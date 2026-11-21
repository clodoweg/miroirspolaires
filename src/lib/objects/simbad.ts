/**
 * SIMBAD TAP client.
 *
 * Issues two ADQL queries in parallel against the SIMBAD TAP service to
 * fetch (1) the basic table row for the object, and (2) the list of
 * cross-identifiers. Returns a normalized SimbadData payload. Routes come from
 * `src/config/upstream-routes.ts`.
 *
 * @see https://simbad.cds.unistra.fr/simbad/sim-tap
 */

import type { SimbadData } from './types';
import { querySimbadTap, rowsToObjects } from '@/lib/upstream/clients';

async function adql<T = any>(query: string): Promise<T[]> {
    return rowsToObjects(await querySimbadTap(query)) as T[];
}

const escape = (id: string) => id.replace(/'/g, "''");

/**
 * Look up a SIMBAD object and return its scientific record + aliases.
 * @param identifier any SIMBAD-resolvable id; will be normalized to spaced form
 */
export async function fetchSimbad(identifier: string): Promise<SimbadData | null> {
    const id = escape(identifier);

    const basicQuery = `
        SELECT b.oid, b.main_id, b.ra, b.dec, b.otype, b.sp_type, b.morph_type,
               b.plx_value, b.rvz_redshift, b.rvz_radvel,
               b.galdim_majaxis, b.galdim_minaxis, b.galdim_angle
        FROM basic AS b JOIN ident AS i ON b.oid = i.oidref
        WHERE i.id = '${id}'`;

    let basic: any;
    try {
        const rows = await adql(basicQuery);
        basic = rows[0];
    } catch {
        return null;
    }
    if (!basic) return null;

    const oid = basic.oid;

    const [aliasRows, otypeRows, fluxRows] = await Promise.all([
        adql<{ id: string }>(`SELECT id FROM ident WHERE oidref = ${oid} ORDER BY id`).catch(() => []),
        adql<{ description: string }>(
            `SELECT description FROM otypedef WHERE otype = '${escape(String(basic.otype ?? ''))}'`,
        ).catch(() => []),
        // POURQUOI : `allfluxes` a une colonne par filtre (U, B, V…) et refuse `filter, flux`. L'erreur était
        // avalée par ce `catch`, si bien que les flux restaient vides sans aucun signal.
        adql<{ filter: string; flux: number }>(`SELECT filter, flux FROM flux WHERE oidref = ${oid}`).catch(() => []),
    ]);

    const fluxes: Record<string, number> = {};
    for (const f of fluxRows) {
        if (f && f.filter && typeof f.flux === 'number') fluxes[f.filter] = f.flux;
    }

    return {
        mainId: String(basic.main_id ?? '').trim(),
        coords:
            typeof basic.ra === 'number' && typeof basic.dec === 'number'
                ? { ra: basic.ra, dec: basic.dec }
                : undefined,
        otype: basic.otype ?? undefined,
        otypeText: otypeRows[0]?.description ?? undefined,
        spType: basic.sp_type || undefined,
        morphType: basic.morph_type || undefined,
        plxMas: numOrUndef(basic.plx_value),
        redshift: numOrUndef(basic.rvz_redshift),
        radvelKms: numOrUndef(basic.rvz_radvel),
        dimMajArcmin: numOrUndef(basic.galdim_majaxis),
        dimMinArcmin: numOrUndef(basic.galdim_minaxis),
        dimAngleDeg: numOrUndef(basic.galdim_angle),
        aliases: aliasRows.map((r) => r.id?.trim()).filter(Boolean) as string[],
        fluxes,
    };
}

function numOrUndef(v: unknown): number | undefined {
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}
