/**
 * Clients SIMBAD et VizieR communs au site et aux scripts, branchés sur le failover des routes amont.
 *
 * Responsabilité : décrire une requête une seule fois et l'exécuter sur la route disponible. Le résultat
 * garde la même forme quel que soit le transport (`tap-adql` ou `asu-tsv`).
 */

import { UPSTREAM_TIMEOUT_MS } from '@/lib/api/http';
import { buildAsuUrl, parseAsuTsv, type TableCell, type TableResult } from './asu';
import { UpstreamHttpError, withUpstreamFailover } from './failover';

async function fetchTapJson(endpoint: string, query: string, timeoutMs: number): Promise<TableResult> {
    const params = new URLSearchParams({ request: 'doQuery', lang: 'adql', format: 'json', query });
    const response = await fetch(`${endpoint}?${params.toString()}`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new UpstreamHttpError('TAP', response.status);
    const json: { data?: TableCell[][]; metadata?: { name: string }[] } = await response.json();
    return { cols: (json.metadata ?? []).map((column) => column.name), rows: json.data ?? [] };
}

/**
 * Exécute une requête ADQL sur SIMBAD.
 *
 * @param query - Requête ADQL.
 * @returns Le tableau de résultats.
 * @throws {UpstreamUnavailableError} Si aucune route ne répond.
 */
export function querySimbadTap(query: string): Promise<TableResult> {
    return withUpstreamFailover('simbad', (route, timeoutMs) => fetchTapJson(route.baseUrl, query, timeoutMs), {
        finalTimeoutMs: UPSTREAM_TIMEOUT_MS.tap,
    });
}

export interface VizierTableQuery {
    /** Table VizieR, par exemple `VII/118/ngc2000`. */
    table: string;
    columns: string[];
    /** Plafond de lignes (`TOP` en ADQL, appliqué après lecture en ASU). */
    top?: number;
    /** Condition ADQL, sans le mot-clé WHERE. */
    adqlWhere?: string;
    /** Filtres exacts équivalents à `adqlWhere` pour ASU. Leur présence autorise une réponse sans ligne. */
    asuConstraints?: Record<string, string>;
    /** Filtre appliqué après lecture en ASU, pour une condition qu'ASU ne sait pas exprimer. */
    asuKeepRow?: (row: Record<string, TableCell>) => boolean;
}

function buildVizierAdql({ table, columns, top, adqlWhere }: VizierTableQuery): string {
    const topClause = top ? `TOP ${top} ` : '';
    const quotedColumns = columns.map((column) => `"${column}"`).join(', ');
    const whereClause = adqlWhere ? ` WHERE ${adqlWhere}` : '';
    return `SELECT ${topClause}${quotedColumns} FROM "${table}"${whereClause}`;
}

async function fetchVizierAsu(baseUrl: string, query: VizierTableQuery, timeoutMs: number): Promise<TableResult> {
    const { table, columns, asuConstraints, asuKeepRow, top } = query;
    const url = buildAsuUrl(baseUrl, { table, columns, constraints: asuConstraints });
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new UpstreamHttpError('ASU', response.status);
    const parsed = parseAsuTsv(await response.text(), columns, Boolean(asuConstraints));

    const keptRows = asuKeepRow
        ? parsed.rows.filter((row) => asuKeepRow(Object.fromEntries(columns.map((column, i) => [column, row[i]]))))
        : parsed.rows;
    return { cols: parsed.cols, rows: top ? keptRows.slice(0, top) : keptRows };
}

/**
 * Lit une table VizieR sur la première route disponible, en TAP ou en ASU selon la route.
 *
 * @param query - Description de la requête, valable pour les deux transports.
 * @returns Le tableau de résultats, de même forme pour les deux transports.
 * @throws {UpstreamUnavailableError} Si aucune route ne répond.
 */
export function queryVizierTable(query: VizierTableQuery): Promise<TableResult> {
    return withUpstreamFailover(
        'vizier',
        (route, timeoutMs) =>
            route.protocol === 'asu-tsv'
                ? fetchVizierAsu(route.baseUrl, query, timeoutMs)
                : fetchTapJson(route.baseUrl, buildVizierAdql(query), timeoutMs),
        { finalTimeoutMs: UPSTREAM_TIMEOUT_MS.tap },
    );
}

/**
 * Transforme un tableau de résultats en objets indexés par colonne.
 *
 * @param table - Tableau de résultats.
 * @returns Une ligne par objet.
 */
export function rowsToObjects({ cols, rows }: TableResult): Record<string, TableCell>[] {
    return rows.map((row) => Object.fromEntries(cols.map((column, index) => [column, row[index]])));
}
