/**
 * VizieR client for catalogue-specific enrichment (TAP or ASU depending on the route).
 *
 * Pulls the original row from the catalogue when the target matches one of
 * Sh2 (Sharpless 2 — VII/20), LBN (Lynds Bright Nebulae — VII/9) or
 * NGC/IC (NGC 2000.0 — VII/118). Each catalogue has its own schema; we
 * normalise to a common `CatalogEntry` shape consumed by the UI.
 *
 * @see https://tapvizier.cds.unistra.fr/adql/
 */

import type { TableCell } from '@/lib/upstream/asu';
import { queryVizierTable, rowsToObjects, type VizierTableQuery } from '@/lib/upstream/clients';

export interface CatalogEntry {
    catalog: string;
    catalogId: string;
    fields: { label: string; value: string }[];
    sourceUrl?: string;
}

async function queryRows(query: VizierTableQuery): Promise<Record<string, TableCell>[]> {
    return rowsToObjects(await queryVizierTable(query));
}

const SHARPLESS_FORM: Record<string, string> = {
    '1': 'circulaire',
    '2': 'elliptique',
    '3': 'irrégulière',
};
const SHARPLESS_STRUCT: Record<string, string> = {
    '1': 'amorphe',
    '2': 'intermédiaire',
    '3': 'filamentaire',
};
const SHARPLESS_BRIGHT: Record<string, string> = {
    '1': 'faible',
    '2': 'moyenne',
    '3': 'élevée',
};

const LBN_COLOR: Record<string, string> = {
    '1': 'majoritairement à émission',
    '2': 'mixte émission/réflexion',
    '3': 'majoritairement à réflexion',
    '4': 'incertaine',
};

/**
 * Query the Sh2 (Sharpless 2) row for a given Sh2 number.
 */
async function fetchSharpless(num: number): Promise<CatalogEntry | null> {
    try {
        const rows = await queryRows({
            table: 'VII/20/catalog',
            columns: ['Sh2', 'Diam', 'Form', 'Struct', 'Bright', 'Stars'],
            adqlWhere: `"Sh2" = ${num}`,
            asuConstraints: { Sh2: String(num) },
        });
        const r = rows[0];
        if (!r) return null;
        const fields: CatalogEntry['fields'] = [];
        if (r.Diam != null) fields.push({ label: 'Diamètre', value: `${r.Diam}′` });
        if (r.Form != null) fields.push({ label: 'Forme', value: SHARPLESS_FORM[String(r.Form)] ?? String(r.Form) });
        if (r.Struct != null)
            fields.push({ label: 'Structure', value: SHARPLESS_STRUCT[String(r.Struct)] ?? String(r.Struct) });
        if (r.Bright != null)
            fields.push({ label: 'Brillance', value: SHARPLESS_BRIGHT[String(r.Bright)] ?? String(r.Bright) });
        if (r.Stars != null) fields.push({ label: 'Étoiles associées', value: String(r.Stars) });
        return {
            catalog: 'Sharpless 2 (1959)',
            catalogId: `Sh2-${num}`,
            fields,
            sourceUrl: `https://vizier.cds.unistra.fr/viz-bin/VizieR-3?-source=VII/20&Sh2=${num}`,
        };
    } catch {
        return null;
    }
}

/**
 * Query the LBN row for a given Lynds sequence number.
 */
async function fetchLBN(seq: number): Promise<CatalogEntry | null> {
    try {
        const rows = await queryRows({
            table: 'VII/9/catalog',
            columns: ['Seq', 'Diam1', 'Diam2', 'Area', 'Bright', 'Color', 'Name'],
            adqlWhere: `"Seq" = ${seq}`,
            asuConstraints: { Seq: String(seq) },
        });
        const r = rows[0];
        if (!r) return null;
        const fields: CatalogEntry['fields'] = [];
        if (r.Diam1 != null && r.Diam2 != null)
            fields.push({ label: 'Dimensions', value: `${r.Diam1}′ × ${r.Diam2}′` });
        else if (r.Diam1 != null) fields.push({ label: 'Dimension', value: `${r.Diam1}′` });
        if (r.Area != null) fields.push({ label: 'Surface', value: `${r.Area} deg²` });
        if (r.Bright != null) fields.push({ label: 'Brillance (1=la plus forte)', value: String(r.Bright) });
        if (r.Color != null) fields.push({ label: 'Type', value: LBN_COLOR[String(r.Color)] ?? String(r.Color) });
        if (r.Name && String(r.Name).trim()) fields.push({ label: 'Autre nom', value: String(r.Name).trim() });
        return {
            catalog: 'Lynds Bright Nebulae (1965)',
            catalogId: `LBN ${seq}`,
            fields,
            sourceUrl: `https://vizier.cds.unistra.fr/viz-bin/VizieR-3?-source=VII/9&Seq=${seq}`,
        };
    } catch {
        return null;
    }
}

/**
 * Query the NGC/IC row from NGC 2000.0 (Sky Catalogue 2000).
 * Names in the table are stored padded; we use TRIM() for matching.
 */
async function fetchNgc2000(prefix: 'NGC' | 'IC', num: number): Promise<CatalogEntry | null> {
    try {
        // VizieR stores "Name" right-justified in 5 chars: "   40" for NGC 40, "I 273" for IC 273.
        // TAPVizieR does not support TRIM(), so we must match the exact padded form.
        const name = prefix === 'IC' ? 'I' + String(num).padStart(4, ' ') : String(num).padStart(5, ' ');
        const rows = await queryRows({
            table: 'VII/118/ngc2000',
            columns: ['Name', 'Type', 'mag', 'size', 'Const', 'Desc'],
            adqlWhere: `"Name" = '${name}'`,
            asuConstraints: { Name: name },
        });
        const r = rows[0];
        if (!r) return null;
        const fields: CatalogEntry['fields'] = [];
        if (r.Type) fields.push({ label: 'Classification', value: String(r.Type).trim() });
        if (r.mag != null) fields.push({ label: 'Magnitude intégrée', value: String(r.mag) });
        if (r.size != null) fields.push({ label: 'Plus grande dimension', value: `${r.size}′` });
        if (r.Const) fields.push({ label: 'Constellation', value: String(r.Const).trim() });
        if (r.Desc) fields.push({ label: 'Description', value: String(r.Desc).trim() });
        return {
            catalog: 'NGC 2000.0 (Sky Publishing)',
            catalogId: `${prefix} ${num}`,
            fields,
            sourceUrl: `https://vizier.cds.unistra.fr/viz-bin/VizieR-3?-source=VII/118`,
        };
    } catch {
        return null;
    }
}

/**
 * Detect catalogue identifiers in the resolved aliases and fetch the
 * corresponding rows in parallel. Returns the deduped list of entries.
 */
export async function fetchCatalogEntries(aliases: string[]): Promise<CatalogEntry[]> {
    const collapsed = aliases.map((a) => a.replace(/\s+/g, ' ').trim());
    const found: { type: 'Sh2' | 'LBN' | 'NGC' | 'IC'; num: number }[] = [];

    for (const a of collapsed) {
        const sh = a.match(/^Sh\s*2\s*-?\s*(\d+)$/i);
        if (sh) {
            found.push({ type: 'Sh2', num: parseInt(sh[1], 10) });
            continue;
        }
        const lbn = a.match(/^LBN\s*(\d+)$/i);
        if (lbn) {
            found.push({ type: 'LBN', num: parseInt(lbn[1], 10) });
            continue;
        }
        const ngc = a.match(/^NGC\s*(\d+)$/i);
        if (ngc) {
            found.push({ type: 'NGC', num: parseInt(ngc[1], 10) });
            continue;
        }
        const ic = a.match(/^IC\s*(\d+)$/i);
        if (ic) {
            found.push({ type: 'IC', num: parseInt(ic[1], 10) });
            continue;
        }
    }

    // Dedupe by type+num
    const seen = new Set<string>();
    const tasks = found
        .filter((m) => {
            const k = `${m.type}-${m.num}`;
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
        })
        .map((m) => {
            switch (m.type) {
                case 'Sh2':
                    return fetchSharpless(m.num);
                case 'LBN':
                    return fetchLBN(m.num);
                case 'NGC':
                    return fetchNgc2000('NGC', m.num);
                case 'IC':
                    return fetchNgc2000('IC', m.num);
            }
        });

    const results = await Promise.all(tasks);
    return results.filter((r): r is CatalogEntry => Boolean(r));
}
