/**
 * Transport ASU de VizieR : construction des URL et lecture des réponses `asu-tsv`.
 *
 * Responsabilité : rendre le même résultat `{ cols, rows }` que le TAP, pour que la normalisation des
 * catalogues ne dépende pas de la route. Les types viennent des lignes `#Column`, et les coordonnées
 * sexagésimales sont converties en degrés comme le fait le TAP.
 *
 * POURQUOI ASU : les miroirs de VizieR n'exposent pas le TAP. `-oc.form=dec` ne convertit pas les colonnes
 * natives (RA1950…) : il ne s'applique qu'aux colonnes calculées, précessées en J2000 et donc différentes.
 */

import { UpstreamResponseError } from './failover';

export type TableCell = string | number | null;

export interface TableResult {
    cols: string[];
    rows: TableCell[][];
}

export interface AsuRequest {
    /** Table VizieR, par exemple `VII/118/ngc2000`. */
    table: string;
    columns: string[];
    /** Filtres exacts sur des colonnes. Une valeur à largeur fixe garde ses espaces. */
    constraints?: Record<string, string>;
}

const SEXAGESIMAL_RA_UNIT = '"h:m:s"';
const SEXAGESIMAL_DEC_UNIT = '"d:m:s"';
const NUMERIC_FORMAT = /^[IFED]$/i;
// POURQUOI : évite des décimales parasites dans les instantanés. Un millionième de degré est bien plus fin que ces catalogues.
const COORDINATE_DECIMALS = 1e6;

/**
 * Construit l'URL d'une requête ASU.
 *
 * POURQUOI `encodeURIComponent` : `URLSearchParams` écrit les espaces en `+`, alors que le padding des
 * noms (`Name=  224`) doit arriver intact pour que le filtre exact trouve la ligne.
 *
 * @param baseUrl - Point d'entrée `asu-tsv` de la route.
 * @param request - Table, colonnes et filtres.
 * @returns L'URL complète, sans limite de lignes.
 */
export function buildAsuUrl(baseUrl: string, { table, columns, constraints = {} }: AsuRequest): string {
    const params: [string, string][] = [
        ['-source', table],
        ['-out.max', 'unlimited'],
        ['-out', columns.join(',')],
        ...Object.entries(constraints),
    ];
    return `${baseUrl}?${params.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&')}`;
}

function sexagesimalParts(value: string): number[] | null {
    const parts = value.trim().replace(/^[+-]/, '').split(/\s+/).map(Number);
    if (parts.length < 2 || parts.length > 3 || parts.some((part) => !Number.isFinite(part))) return null;
    return parts;
}

function partsToUnits([major, minutes, seconds = 0]: number[]): number {
    return major + minutes / 60 + seconds / 3600;
}

function roundCoordinate(degrees: number): number {
    return Math.round(degrees * COORDINATE_DECIMALS) / COORDINATE_DECIMALS;
}

/**
 * Convertit une ascension droite sexagésimale (`00 42.7`, `15 52 48.0`) en degrés.
 *
 * @param value - Valeur de la colonne.
 * @returns L'angle en degrés, null si la valeur est illisible.
 */
export function parseRightAscension(value: string): number | null {
    const parts = sexagesimalParts(value);
    return parts ? roundCoordinate(partsToUnits(parts) * 15) : null;
}

/**
 * Convertit une déclinaison sexagésimale (`+32 45`, `-72 21.5`, `-00 12 30`) en degrés.
 *
 * @param value - Valeur de la colonne.
 * @returns L'angle en degrés, null si la valeur est illisible.
 */
export function parseDeclination(value: string): number | null {
    const parts = sexagesimalParts(value);
    if (!parts) return null;
    // POURQUOI : le signe se lit sur le texte, car un calcul sur le nombre perdrait le signe de `-00 12`.
    const sign = value.trim().startsWith('-') ? -1 : 1;
    return roundCoordinate(sign * partsToUnits(parts));
}

function parseColumnFormats(lines: string[]): Map<string, string> {
    const formats = new Map<string, string>();
    for (const line of lines) {
        const match = line.match(/^#Column\t(\S+)\t\(([A-Za-z])/);
        if (match) formats.set(match[1], match[2]);
    }
    return formats;
}

function convertCell(
    rawValue: string,
    column: string,
    format: string | undefined,
    unit: string | undefined,
): TableCell {
    const value = rawValue.trim();
    if (!value) return null;

    if (unit === SEXAGESIMAL_RA_UNIT || unit === SEXAGESIMAL_DEC_UNIT) {
        const degrees = unit === SEXAGESIMAL_RA_UNIT ? parseRightAscension(value) : parseDeclination(value);
        if (degrees === null) throw new UpstreamResponseError(`ASU : coordonnée illisible « ${value} » (${column})`);
        return degrees;
    }
    if (format && NUMERIC_FORMAT.test(format)) {
        const parsedNumber = Number(value);
        return Number.isFinite(parsedNumber) ? parsedNumber : null;
    }
    return rawValue;
}

/**
 * Lit une réponse `asu-tsv`.
 *
 * WARNING: VizieR répond 200 quand une colonne n'existe pas, et l'ignore sans le dire. Une colonne absente
 * doit donc lever une erreur pour basculer sur une autre route : la considérer comme vide produirait un
 * instantané faux sans aucun signal.
 *
 * @param text - Corps de la réponse.
 * @param requestedColumns - Colonnes demandées, dans l'ordre voulu en sortie.
 * @param allowNoRow - Vrai pour une recherche filtrée, où aucune ligne est une réponse valable.
 * @returns Le tableau typé, dans l'ordre des colonnes demandées.
 * @throws {UpstreamResponseError} Si une colonne manque, si une coordonnée est illisible ou si une table complète revient vide.
 */
export function parseAsuTsv(text: string, requestedColumns: string[], allowNoRow = false): TableResult {
    const lines = text.split(/\r?\n/);
    const formats = parseColumnFormats(lines);
    const missingColumns = requestedColumns.filter((column) => !formats.has(column));
    if (missingColumns.length > 0)
        throw new UpstreamResponseError(`ASU : colonnes absentes (${missingColumns.join(', ')})`);

    const dataLines = lines.filter((line) => line && !line.startsWith('#'));
    if (dataLines.length === 0) {
        if (allowNoRow) return { cols: requestedColumns, rows: [] };
        throw new UpstreamResponseError('ASU : table vide');
    }

    // POURQUOI : la ligne d'unités n'existe que si une colonne demandée a une unité. On se repère donc sur la ligne
    // de tirets qui sépare toujours l'en-tête des données.
    const separatorIndex = dataLines.findIndex((line) => /^[-\t]+$/.test(line));
    if (separatorIndex < 1) throw new UpstreamResponseError('ASU : en-tête illisible');
    const header = dataLines[0].split('\t');
    const units = separatorIndex === 2 ? dataLines[1].split('\t') : [];
    const rowLines = dataLines.slice(separatorIndex + 1);
    const columnIndexes = requestedColumns.map((column) => header.indexOf(column));
    const absentFromHeader = requestedColumns.filter((_, index) => columnIndexes[index] === -1);
    if (absentFromHeader.length > 0)
        throw new UpstreamResponseError(`ASU : en-tête sans ${absentFromHeader.join(', ')}`);

    const rows = rowLines.map((line) => {
        const cells = line.split('\t');
        return requestedColumns.map((column, index) => {
            const cellIndex = columnIndexes[index];
            return convertCell(cells[cellIndex] ?? '', column, formats.get(column), units[cellIndex]);
        });
    });
    if (rows.length === 0 && !allowNoRow) throw new UpstreamResponseError('ASU : table vide');
    return { cols: requestedColumns, rows };
}
