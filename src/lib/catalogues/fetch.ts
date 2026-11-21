/**
 * Server-side catalogue fetchers.
 *
 * Each catalogue source is queried through the upstream routes (SIMBAD TAP, VizieR TAP or ASU, see
 * `src/config/upstream-routes.ts`) and normalised to a common `CatalogueEntry` shape consumed by the listing page.
 *
 * The site reads the versioned snapshots first (`./snapshot`); the live queries only serve
 * catalogues without a snapshot and `scripts/build/update-catalogue-snapshots.mjs`.
 *
 * The endpoints are slow (1–4s) so all responses are cached aggressively
 * (24h s-maxage) at the API layer.
 */

import { getCatalogue, type CatalogueDef } from './registry';
import { CATALOGUE_EPOCH, precessToJ2000 } from './precess';
import { constellationFromCoords } from '../constellation-from-coords';
import { querySimbadTap, queryVizierTable, rowsToObjects } from '@/lib/upstream/clients';

export interface CatalogueEntry {
    /** Canonical id used for cross-linking (?q=) on the explorer page. */
    id: string;
    /** Display label, often the same as id. */
    label: string;
    /** Optional common name (NGC name field, "Owl Nebula", etc.). */
    commonName?: string;
    /** Right ascension in degrees (J2000). */
    ra: number;
    /** Declination in degrees (J2000). */
    dec: number;
    /** Object type, free-form text from the source. */
    type?: string;
    /** Constellation IAU 3-letter code. */
    constellation?: string;
    /** Integrated apparent magnitude when available. */
    mag?: number;
    /** Largest apparent dimension in arcminutes. */
    sizeArcmin?: number;
    /** Optional human description from the source row. */
    description?: string;
    /** Ideal observation month index (1..12) — populated by the API based on observer lat. */
    bestMonthIndex?: number;
    /** Short French label for the ideal month ("Mai", "—" when not visible). */
    bestMonthLabel?: string;
    /** Max altitude reached at transit from the given observer latitude. */
    bestMonthMaxAlt?: number;
}

export interface CatalogueListing {
    catalogue: CatalogueDef;
    entries: CatalogueEntry[];
    total: number;
}

/* -------------------------------------------------------------------------- */
/*  Curated id list → SIMBAD batch                                            */
/* -------------------------------------------------------------------------- */

/** SIMBAD's `ident.id` column stores designations with right-aligned, space-
 *  padded numbers ("M   1", "NGC    40", "Cl Melotte   25"). To match exactly
 *  we generate every plausible padded variant for the given display id. */
function simbadVariants(displayId: string): string[] {
    const trimmed = displayId.trim();
    const variants = new Set<string>([trimmed]);
    // <prefix words> <number>: pad the number to widths 3, 4, 5.
    const m = trimmed.match(/^(.+?)\s+(\d+)$/);
    if (m) {
        const prefix = m[1];
        const num = m[2];
        for (const w of [3, 4, 5]) {
            variants.add(`${prefix} ${num.padStart(w, ' ')}`);
        }
    }
    // Sh2-N → SIMBAD often stores "SH  2-N".
    const sh = trimmed.match(/^Sh\s*2-(\d+)$/i);
    if (sh) variants.add(`SH  2-${sh[1]}`);
    return [...variants];
}

/**
 * Fetch a curated id list (Messier, Caldwell) via a single SIMBAD TAP query.
 * SIMBAD's `ident` table indexes every alias of every object.
 */
async function fetchSimbadList(ids: string[]): Promise<CatalogueEntry[]> {
    // Map each variant back to the canonical display id.
    const variantToDisplay = new Map<string, string>();
    for (const id of ids) {
        for (const v of simbadVariants(id)) variantToDisplay.set(v, id);
    }
    const allVariants = [...variantToDisplay.keys()];
    const escaped = allVariants.map((v) => `'${v.replace(/'/g, "''")}'`).join(',');
    const query = `
        SELECT i.id AS query_id,
               b.main_id, b.ra, b.dec, b.otype_txt,
               b.galdim_majaxis, b.galdim_minaxis,
               f.V, f.B
        FROM ident AS i
        JOIN basic AS b ON b.oid = i.oidref
        LEFT JOIN allfluxes AS f ON f.oidref = b.oid
        WHERE i.id IN (${escaped})`;
    const records = rowsToObjects(await querySimbadTap(query));

    // Map back by display id, preserving the original input order.
    const byDisplayId = new Map<string, Record<string, any>>();
    for (const r of records) {
        const display = variantToDisplay.get(String(r.query_id));
        if (display && !byDisplayId.has(display)) byDisplayId.set(display, r);
    }

    return ids
        .map((id, idx) => {
            const r = byDisplayId.get(id);
            if (!r || r.ra == null || r.dec == null) return null;
            const entry: CatalogueEntry = {
                id,
                label: id,
                commonName: r.main_id ? String(r.main_id).trim() : undefined,
                ra: Number(r.ra),
                dec: Number(r.dec),
                type: r.otype_txt ? String(r.otype_txt) : undefined,
                mag: typeof r.V === 'number' ? r.V : typeof r.B === 'number' ? r.B : undefined,
                sizeArcmin:
                    typeof r.galdim_majaxis === 'number' && r.galdim_majaxis > 0 ? Number(r.galdim_majaxis) : undefined,
            };
            // Stash the original index for stable ordering.
            (entry as any)._idx = idx;
            return entry;
        })
        .filter((e): e is CatalogueEntry => e !== null);
}

/* -------------------------------------------------------------------------- */
/*  VizieR catalogues                                                         */
/* -------------------------------------------------------------------------- */

/** NGC 2000.0 — VII/118/ngc2000 (NGC + IC).
 *  Name is a 5-char field; IC entries start with "I". RAB2000/DEB2000 are
 *  already in decimal degrees. B2000 ≈ J2000 (no meaningful difference). */
async function fetchNgc2000(prefix: 'NGC' | 'IC'): Promise<CatalogueEntry[]> {
    const records = rowsToObjects(
        await queryVizierTable({
            table: 'VII/118/ngc2000',
            columns: ['Name', 'Type', 'RAB2000', 'DEB2000', 'mag', 'size', 'Const', 'Desc'],
            top: 9000,
            adqlWhere: prefix === 'IC' ? `"Name" LIKE 'I%'` : `"Name" NOT LIKE 'I%'`,
            // POURQUOI : ASU filtre sur une valeur exacte. On lit donc la table entière, puis on sépare NGC et IC.
            asuKeepRow: (row) => String(row.Name).startsWith('I') === (prefix === 'IC'),
        }),
    );

    return records
        .map((r): CatalogueEntry | null => {
            const rawName = String(r.Name ?? '').trim();
            if (!rawName) return null;
            const numMatch = rawName.match(/(\d+)/);
            if (!numMatch) return null;
            const num = parseInt(numMatch[1], 10);
            const id = `${prefix} ${num}`;

            const ra = Number(r.RAB2000);
            const dec = Number(r.DEB2000);
            if (!Number.isFinite(ra) || !Number.isFinite(dec)) return null;

            return {
                id,
                label: id,
                ra,
                dec,
                type: r.Type ? String(r.Type).trim() : undefined,
                constellation: r.Const ? String(r.Const).trim() : undefined,
                mag: typeof r.mag === 'number' ? r.mag : undefined,
                sizeArcmin: typeof r.size === 'number' ? r.size : undefined,
                description: r.Desc ? String(r.Desc).trim() : undefined,
            };
        })
        .filter((e): e is CatalogueEntry => e !== null);
}

const SHARPLESS_FORM: Record<string, string> = {
    '1': 'circulaire',
    '2': 'elliptique',
    '3': 'irrégulière',
};

/** Sharpless 2 — VII/20/catalog.
 *  RA1900/DE1900 are decimal degrees (despite the column description). 100y
 *  of precession ≈ 1°: fine for the thumbnail's wide FOV. The explorer page
 *  resolves the same id through SIMBAD with full J2000 accuracy. */
async function fetchSharpless(): Promise<CatalogueEntry[]> {
    const records = rowsToObjects(
        await queryVizierTable({
            table: 'VII/20/catalog',
            columns: ['Sh2', 'RA1900', 'DE1900', 'Diam', 'Form', 'Stars'],
        }),
    );

    return records
        .map((r): CatalogueEntry | null => {
            const num = Number(r.Sh2);
            if (!Number.isFinite(num)) return null;
            const ra = Number(r.RA1900);
            const dec = Number(r.DE1900);
            if (!Number.isFinite(ra) || !Number.isFinite(dec)) return null;
            return {
                id: `Sh2-${num}`,
                label: `Sh2-${num}`,
                ra,
                dec,
                type: r.Form != null ? `H II ${SHARPLESS_FORM[String(r.Form)] ?? ''}`.trim() : 'H II',
                sizeArcmin: typeof r.Diam === 'number' ? r.Diam : undefined,
                description:
                    typeof r.Stars === 'number' && r.Stars > 0
                        ? `${r.Stars} étoile(s) excitatrice(s) associée(s)`
                        : undefined,
            };
        })
        .filter((e): e is CatalogueEntry => e !== null);
}

/** Lynds Bright Nebulae — VII/9/catalog. RA1950/DE1950 are decimal degrees. */
async function fetchLBN(): Promise<CatalogueEntry[]> {
    const records = rowsToObjects(
        await queryVizierTable({
            table: 'VII/9/catalog',
            columns: ['Seq', 'RA1950', 'DE1950', 'Diam1', 'Diam2', 'Bright', 'Color', 'Name'],
            top: 1500,
        }),
    );

    return records
        .map((r): CatalogueEntry | null => {
            const seq = Number(r.Seq);
            if (!Number.isFinite(seq)) return null;
            const ra = Number(r.RA1950);
            const dec = Number(r.DE1950);
            if (!Number.isFinite(ra) || !Number.isFinite(dec)) return null;
            const sz = typeof r.Diam1 === 'number' ? r.Diam1 : undefined;
            return {
                id: `LBN ${seq}`,
                label: `LBN ${seq}`,
                ra,
                dec,
                type: 'Nébuleuse brillante',
                sizeArcmin: sz,
                commonName: r.Name && String(r.Name).trim() ? String(r.Name).trim() : undefined,
            };
        })
        .filter((e): e is CatalogueEntry => e !== null);
}

/** Barnard's dark nebulae — VII/220A. RA1875/DE1875 are decimal degrees. */
async function fetchBarnard(): Promise<CatalogueEntry[]> {
    const records = rowsToObjects(
        await queryVizierTable({
            table: 'VII/220A/barnard',
            columns: ['Barn', 'RA1875', 'DE1875', 'Diam'],
        }),
    );

    return records
        .map((r): CatalogueEntry | null => {
            const num = String(r.Barn ?? '').trim();
            if (!num) return null;
            const ra = Number(r.RA1875);
            const dec = Number(r.DE1875);
            if (!Number.isFinite(ra) || !Number.isFinite(dec)) return null;
            return {
                id: `Barnard ${num}`,
                label: `Barnard ${num}`,
                ra,
                dec,
                type: 'Nébuleuse obscure',
                sizeArcmin: typeof r.Diam === 'number' ? r.Diam : undefined,
            };
        })
        .filter((e): e is CatalogueEntry => e !== null);
}

/** Atlas of Peculiar Galaxies — VII/192/arplist. RAJ2000/DEJ2000 are J2000 deg.
 *  The table stores one row per *galaxy member* of each Arp system, so we
 *  collapse rows per Arp number and keep the brightest member (smallest VT). */
async function fetchArp(): Promise<CatalogueEntry[]> {
    const records = rowsToObjects(
        await queryVizierTable({
            table: 'VII/192/arplist',
            columns: ['Arp', 'Name', 'VT', 'dim1', 'dim2', 'MType', 'RAJ2000', 'DEJ2000'],
        }),
    );

    const byNum = new Map<number, { brightest: Record<string, any>; members: string[] }>();
    for (const r of records) {
        const num = Number(r.Arp);
        const ra = Number(r.RAJ2000);
        const dec = Number(r.DEJ2000);
        if (!Number.isFinite(num) || !Number.isFinite(ra) || !Number.isFinite(dec)) continue;
        const name = r.Name ? String(r.Name).trim() : '';
        const existing = byNum.get(num);
        if (!existing) {
            byNum.set(num, { brightest: r, members: name ? [name] : [] });
            continue;
        }
        if (name && !existing.members.includes(name)) existing.members.push(name);
        const cur = typeof existing.brightest.VT === 'number' ? existing.brightest.VT : Infinity;
        const next = typeof r.VT === 'number' ? r.VT : Infinity;
        if (next < cur) existing.brightest = r;
    }

    return [...byNum.entries()].map(([num, { brightest: r, members }]): CatalogueEntry => {
        const ra = Number(r.RAJ2000);
        const dec = Number(r.DEJ2000);
        return {
            id: `Arp ${num}`,
            label: `Arp ${num}`,
            ra,
            dec,
            type: r.MType ? `Galaxie ${String(r.MType).trim()}` : 'Galaxie particulière',
            mag: typeof r.VT === 'number' ? r.VT : undefined,
            sizeArcmin: typeof r.dim1 === 'number' ? r.dim1 : undefined,
            commonName: members[0],
            description: members.length > 1 ? `${members.length} galaxies : ${members.join(', ')}` : undefined,
        };
    });
}

/** UGC — VII/26D/catalog. RA1950/DE1950 are decimal degrees (despite the
 *  "(hours)" header). 50y of precession ≈ 0.7° — fine for a thumbnail FOV;
 *  the explorer page resolves the same id through SIMBAD with full J2000. */
async function fetchUGC(): Promise<CatalogueEntry[]> {
    const records = rowsToObjects(
        await queryVizierTable({
            table: 'VII/26D/catalog',
            columns: ['UGC', 'RA1950', 'DE1950', 'MajAxis', 'MinAxis', 'Pmag', 'Hubble'],
            top: 14000,
        }),
    );

    return records
        .map((r): CatalogueEntry | null => {
            const num = Number(r.UGC);
            if (!Number.isFinite(num)) return null;
            const ra = Number(r.RA1950);
            const dec = Number(r.DE1950);
            if (!Number.isFinite(ra) || !Number.isFinite(dec)) return null;
            const hubble = r.Hubble ? String(r.Hubble).trim() : '';
            return {
                id: `UGC ${num}`,
                label: `UGC ${num}`,
                ra,
                dec,
                type: hubble ? `Galaxie ${hubble}` : 'Galaxie',
                mag: typeof r.Pmag === 'number' ? r.Pmag : undefined,
                sizeArcmin: typeof r.MajAxis === 'number' ? r.MajAxis : undefined,
            };
        })
        .filter((e): e is CatalogueEntry => e !== null);
}

const VDB_TYPE: Record<string, string> = {
    R: 'à réflexion',
    E: 'à émission',
    M: 'mixte',
    I: 'incertaine',
};

/** van den Bergh reflection nebulae — VII/21/catalog.
 *  `_RA`/`_DE` are SIMBAD-resolved J2000 in degrees, queryable directly. */
async function fetchVdB(): Promise<CatalogueEntry[]> {
    const records = rowsToObjects(
        await queryVizierTable({
            table: 'VII/21/catalog',
            columns: ['VdB', '_RA', '_DE', 'Vmag', 'Type', 'BRadMax', 'SpType', 'DM'],
        }),
    );

    return records
        .map((r): CatalogueEntry | null => {
            const num = Number(r.VdB);
            if (!Number.isFinite(num)) return null;
            const ra = Number(r._RA);
            const dec = Number(r._DE);
            if (!Number.isFinite(ra) || !Number.isFinite(dec)) return null;
            const t = String(r.Type ?? '').trim();
            const desc = VDB_TYPE[t] ?? t;
            return {
                id: `vdB ${num}`,
                label: `vdB ${num}`,
                ra,
                dec,
                type: `Nébuleuse ${desc}`.trim(),
                mag: typeof r.Vmag === 'number' ? r.Vmag : undefined,
                // BRadMax is a radius in arcmin → diameter ≈ 2×.
                sizeArcmin: typeof r.BRadMax === 'number' && r.BRadMax > 0 ? r.BRadMax * 2 : undefined,
                description: r.SpType ? `étoile illuminatrice : ${String(r.SpType).trim()}` : undefined,
            };
        })
        .filter((e): e is CatalogueEntry => e !== null);
}

const RCW_BRIGHT: Record<string, string> = {
    v: 'très brillante',
    b: 'brillante',
    m: 'moyenne',
    f: 'faible',
};

/** RCW HII regions (Rodgers, Campbell & Whiteoak 1960) — VII/216/rcw.
 *  RAB1950/DEB1950 are decimal degrees. */
async function fetchRCW(): Promise<CatalogueEntry[]> {
    const records = rowsToObjects(
        await queryVizierTable({
            table: 'VII/216/rcw',
            columns: ['RCW', 'RAB1950', 'DEB1950', 'MajAxis', 'MinAxis', 'Br', 'IDs'],
        }),
    );

    return records
        .map((r): CatalogueEntry | null => {
            const num = Number(r.RCW);
            if (!Number.isFinite(num)) return null;
            const ra = Number(r.RAB1950);
            const dec = Number(r.DEB1950);
            if (!Number.isFinite(ra) || !Number.isFinite(dec)) return null;
            const br = String(r.Br ?? '')
                .trim()
                .toLowerCase();
            const brDesc = RCW_BRIGHT[br[0]] ?? '';
            return {
                id: `RCW ${num}`,
                label: `RCW ${num}`,
                ra,
                dec,
                type: brDesc ? `H II ${brDesc}` : 'H II',
                sizeArcmin: typeof r.MajAxis === 'number' ? r.MajAxis : undefined,
                description: r.IDs ? String(r.IDs).trim() : undefined,
            };
        })
        .filter((e): e is CatalogueEntry => e !== null);
}

/** Hickson Compact Groups — VII/213/groups. RA1950/DE1950 are decimal degrees. */
async function fetchHCG(): Promise<CatalogueEntry[]> {
    const records = rowsToObjects(
        await queryVizierTable({
            table: 'VII/213/groups',
            columns: ['HCG', 'RA1950', 'DE1950', 'Type', 'MCount', 'AngSize', 'Totmag', 'Emag'],
        }),
    );

    return records
        .map((r): CatalogueEntry | null => {
            const num = Number(r.HCG);
            if (!Number.isFinite(num)) return null;
            const ra = Number(r.RA1950);
            const dec = Number(r.DE1950);
            if (!Number.isFinite(ra) || !Number.isFinite(dec)) return null;
            const members = typeof r.MCount === 'number' ? r.MCount : null;
            return {
                id: `HCG ${num}`,
                label: `HCG ${num}`,
                ra,
                dec,
                type: members ? `Groupe compact (${members} galaxies)` : 'Groupe compact de galaxies',
                mag: typeof r.Totmag === 'number' ? r.Totmag : undefined,
                sizeArcmin: typeof r.AngSize === 'number' ? r.AngSize : undefined,
                description: r.Type ? `Type ${String(r.Type).trim()}` : undefined,
            };
        })
        .filter((e): e is CatalogueEntry => e !== null);
}

/** Lynds Dark Nebulae — VII/7A/ldn. RA1950/DE1950 are decimal degrees. */
async function fetchLDN(): Promise<CatalogueEntry[]> {
    const records = rowsToObjects(
        await queryVizierTable({
            table: 'VII/7A/ldn',
            columns: ['LDN', 'RA1950', 'DE1950', 'Area', 'Opacity', 'Barn'],
            top: 2000,
        }),
    );

    return records
        .map((r): CatalogueEntry | null => {
            const num = Number(r.LDN);
            if (!Number.isFinite(num) || num <= 0) return null;
            const ra = Number(r.RA1950);
            const dec = Number(r.DE1950);
            if (!Number.isFinite(ra) || !Number.isFinite(dec)) return null;
            const opacity = typeof r.Opacity === 'number' ? r.Opacity : null;
            // LDN's Area is in square degrees → approximate diameter (arcmin) for a circular cloud.
            const sizeArcmin =
                typeof r.Area === 'number' && r.Area > 0 ? 60 * 2 * Math.sqrt(r.Area / Math.PI) : undefined;
            return {
                id: `LDN ${num}`,
                label: `LDN ${num}`,
                ra,
                dec,
                type: opacity ? `Nébuleuse obscure (opacité ${opacity}/6)` : 'Nébuleuse obscure',
                sizeArcmin,
                description: r.Barn && String(r.Barn).trim() ? `Barnard : ${String(r.Barn).trim()}` : undefined,
            };
        })
        .filter((e): e is CatalogueEntry => e !== null);
}

/** Cederblad bright nebulae — VII/231/catalog. RA1900/DE1900 are decimal deg. */
async function fetchCed(): Promise<CatalogueEntry[]> {
    const records = rowsToObjects(
        await queryVizierTable({
            table: 'VII/231/catalog',
            columns: ['Ced', 'm_Ced', 'Name', 'RA1900', 'DE1900', 'Star', 'pmag'],
        }),
    );

    return records
        .map((r): CatalogueEntry | null => {
            const num = Number(r.Ced);
            if (!Number.isFinite(num)) return null;
            const ra = Number(r.RA1900);
            const dec = Number(r.DE1900);
            if (!Number.isFinite(ra) || !Number.isFinite(dec)) return null;
            const suffix = r.m_Ced ? String(r.m_Ced).trim() : '';
            const id = `Ced ${num}${suffix}`;
            const rawName = r.Name ? String(r.Name).trim() : '';
            const rawStar = r.Star ? String(r.Star).trim() : '';
            // Names like "+64 13" / "-12 1234" are unprefixed BD designations,
            // not common names. Promote to a "BD" star descriptor instead.
            const bdLike = /^[+-]\d+\s+\d+$/;
            const commonName = rawName && !bdLike.test(rawName) ? rawName : undefined;
            const starRaw = rawStar && rawStar !== '?' ? rawStar : rawName && bdLike.test(rawName) ? rawName : '';
            const star = starRaw && bdLike.test(starRaw) ? `BD ${starRaw}` : starRaw;
            return {
                id,
                label: id,
                ra,
                dec,
                type: 'Nébuleuse diffuse',
                mag: typeof r.pmag === 'number' ? r.pmag : undefined,
                commonName,
                description: star ? `étoile illuminatrice : ${star}` : undefined,
            };
        })
        .filter((e): e is CatalogueEntry => e !== null);
}

/** Open clusters database — B/ocl/clusters. RAJ2000/DEJ2000, J2000 deg.
 *  The "Cluster" name is already the canonical ID (e.g. "Collinder 285"). */
async function fetchOCL(): Promise<CatalogueEntry[]> {
    const records = rowsToObjects(
        await queryVizierTable({
            table: 'B/ocl/clusters',
            columns: ['Cluster', 'RAJ2000', 'DEJ2000', 'Class', 'Diam', 'Age'],
            top: 3000,
        }),
    );

    return records
        .map((r): CatalogueEntry | null => {
            const id = r.Cluster ? String(r.Cluster).trim().replace(/\s+/g, ' ') : '';
            if (!id) return null;
            const ra = Number(r.RAJ2000);
            const dec = Number(r.DEJ2000);
            if (!Number.isFinite(ra) || !Number.isFinite(dec)) return null;
            const cls = r.Class ? String(r.Class).trim() : '';
            return {
                id,
                label: id,
                ra,
                dec,
                type: cls ? `Amas ouvert (${cls})` : 'Amas ouvert',
                sizeArcmin: typeof r.Diam === 'number' ? r.Diam : undefined,
                description: typeof r.Age === 'number' ? `log(âge) ≈ ${r.Age.toFixed(2)} ans` : undefined,
            };
        })
        .filter((e): e is CatalogueEntry => e !== null);
}

/** Strasbourg-ESO planetary nebulae — V/84/main. RAB1950/DEB1950 in deg.
 *  The PNG designation (e.g. "171.3-25.8") is unique by construction. */
async function fetchPN(): Promise<CatalogueEntry[]> {
    const records = rowsToObjects(
        await queryVizierTable({
            table: 'V/84/main',
            columns: ['PNG', 'RAB1950', 'DEB1950', 'Name', 'PK', 'Disc', 'Idents'],
            top: 1500,
        }),
    );

    return records
        .map((r): CatalogueEntry | null => {
            const png = r.PNG ? String(r.PNG).trim() : '';
            if (!png) return null;
            const ra = Number(r.RAB1950);
            const dec = Number(r.DEB1950);
            if (!Number.isFinite(ra) || !Number.isFinite(dec)) return null;
            const id = `PN G${png}`;
            const name = r.Name ? String(r.Name).trim() : '';
            const disc = r.Disc ? String(r.Disc).trim() : '';
            return {
                id,
                label: id,
                ra,
                dec,
                type: 'Nébuleuse planétaire',
                commonName: name || undefined,
                description: disc || undefined,
            };
        })
        .filter((e): e is CatalogueEntry => e !== null);
}

/** Abell, Corwin & Olowin rich clusters of galaxies — VII/110A/table3.
 *  RAB1950/DEB1950 in decimal degrees. */
async function fetchACO(): Promise<CatalogueEntry[]> {
    const records = rowsToObjects(
        await queryVizierTable({
            table: 'VII/110A/table3',
            columns: ['ACO', 'RAB1950', 'DEB1950', 'BMtype', 'Count', 'z'],
            top: 3000,
        }),
    );

    return records
        .map((r): CatalogueEntry | null => {
            const num = Number(r.ACO);
            if (!Number.isFinite(num)) return null;
            const ra = Number(r.RAB1950);
            const dec = Number(r.DEB1950);
            if (!Number.isFinite(ra) || !Number.isFinite(dec)) return null;
            const bm = r.BMtype ? String(r.BMtype).trim() : '';
            const count = typeof r.Count === 'number' ? r.Count : null;
            const parts: string[] = [];
            if (count) parts.push(`${count} galaxies`);
            if (typeof r.z === 'number') parts.push(`z = ${r.z.toFixed(3)}`);
            return {
                id: `Abell ${num}`,
                label: `Abell ${num}`,
                ra,
                dec,
                type: bm ? `Amas de galaxies (${bm})` : 'Amas de galaxies',
                description: parts.join(' · ') || undefined,
            };
        })
        .filter((e): e is CatalogueEntry => e !== null);
}

/** Webbink globular clusters — VII/151/table1a. RA1950/DE1950 in deg. */
async function fetchGC(): Promise<CatalogueEntry[]> {
    const records = rowsToObjects(
        await queryVizierTable({
            table: 'VII/151/table1a',
            columns: ['IAU', 'Name1', 'Name2', 'RA1950', 'DE1950', 'Vt'],
        }),
    );

    return records
        .map((r): CatalogueEntry | null => {
            const ra = Number(r.RA1950);
            const dec = Number(r.DE1950);
            if (!Number.isFinite(ra) || !Number.isFinite(dec)) return null;
            // Name1 is the primary designation, e.g. "NGC  104", "Pal    1".
            const raw = r.Name1 ? String(r.Name1).trim() : String(r.IAU ?? '').trim();
            const id = raw.replace(/\s+/g, ' ');
            if (!id) return null;
            const alt = r.Name2 ? String(r.Name2).trim().replace(/\s+/g, ' ') : '';
            return {
                id,
                label: id,
                ra,
                dec,
                type: 'Amas globulaire',
                mag: typeof r.Vt === 'number' ? r.Vt : undefined,
                commonName: alt || undefined,
            };
        })
        .filter((e): e is CatalogueEntry => e !== null);
}

/* -------------------------------------------------------------------------- */
/*  Public API                                                                */
/* -------------------------------------------------------------------------- */

/** In-memory cache keyed by slug — populated on first request, kept for the
 *  lifetime of the server process (re-validated by the HTTP cache headers). */
const memCache = new Map<string, { entries: CatalogueEntry[]; ts: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

/**
 * Lit un catalogue depuis son instantané versionné, ou depuis les routes amont s'il n'en a pas encore.
 *
 * @param slug - Slug du catalogue dans le registre.
 * @returns La liste normalisée, ou null si le catalogue est inconnu.
 */
export async function fetchCatalogueEntries(slug: string): Promise<CatalogueListing | null> {
    const def = getCatalogue(slug);
    if (!def) return null;

    // POURQUOI : import dynamique, car `import.meta.glob` n'existe que sous Vite et le script de génération
    // charge ce module directement avec Node, en n'appelant que fetchCatalogueEntriesLive.
    const { loadCatalogueSnapshot } = await import('./snapshot');
    const snapshotEntries = await loadCatalogueSnapshot(slug);
    if (snapshotEntries) return { catalogue: def, entries: snapshotEntries, total: snapshotEntries.length };

    return fetchCatalogueEntriesLive(slug);
}

/**
 * Interroge directement les routes amont, sans passer par l'instantané.
 *
 * @param slug - Slug du catalogue dans le registre.
 * @returns La liste normalisée, ou null si le catalogue est inconnu.
 * @throws {UpstreamUnavailableError} Si toutes les routes du service échouent.
 */
export async function fetchCatalogueEntriesLive(slug: string): Promise<CatalogueListing | null> {
    const def = getCatalogue(slug);
    if (!def) return null;

    const cached = memCache.get(slug);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
        return { catalogue: def, entries: cached.entries, total: cached.entries.length };
    }

    let entries: CatalogueEntry[] = [];
    switch (def.source) {
        case 'simbad-list':
            entries = await fetchSimbadList(def.ids ?? []);
            break;
        case 'vizier-ngc2000':
            entries = await fetchNgc2000(def.slug === 'ic' ? 'IC' : 'NGC');
            break;
        case 'vizier-sharpless':
            entries = await fetchSharpless();
            break;
        case 'vizier-lbn':
            entries = await fetchLBN();
            break;
        case 'vizier-barnard':
            entries = await fetchBarnard();
            break;
        case 'vizier-arp':
            entries = await fetchArp();
            break;
        case 'vizier-ugc':
            entries = await fetchUGC();
            break;
        case 'vizier-vdb':
            entries = await fetchVdB();
            break;
        case 'vizier-rcw':
            entries = await fetchRCW();
            break;
        case 'vizier-hcg':
            entries = await fetchHCG();
            break;
        case 'vizier-ldn':
            entries = await fetchLDN();
            break;
        case 'vizier-ced':
            entries = await fetchCed();
            break;
        case 'vizier-ocl':
            entries = await fetchOCL();
            break;
        case 'vizier-pn':
            entries = await fetchPN();
            break;
        case 'vizier-aco':
            entries = await fetchACO();
            break;
        case 'vizier-gc':
            entries = await fetchGC();
            break;
    }

    // Precess coordinates from the catalogue's native epoch to J2000 so
    // markers align with the Stellarium engine's J2000 star field. No-op when
    // the source epoch is already J2000.
    const epoch = CATALOGUE_EPOCH[slug];
    if (epoch && epoch !== 2000) {
        entries = entries.map((e) => {
            const { ra, dec } = precessToJ2000(e.ra, e.dec, epoch);
            return { ...e, ra, dec };
        });
    }

    // Resolve constellation for entries lacking it (e.g. SIMBAD batch, Sharpless, LBN, etc.)
    entries = entries.map((e) => {
        if (!e.constellation) {
            e.constellation = constellationFromCoords(e.ra, e.dec);
        }
        return e;
    });

    // Stable sort: curated lists by their original index, others by id number.
    if (def.source === 'simbad-list') {
        entries.sort((a, b) => ((a as any)._idx ?? 0) - ((b as any)._idx ?? 0));
    } else {
        // POURQUOI : le dernier nombre de l'identifiant, sinon « Sh2-155 » est trié sur le « 2 » de « Sh2 ».
        const idNumber = (id: string) => parseInt((id.match(/(\d+)(?!.*\d)/) ?? ['0'])[0], 10);
        entries.sort((a, b) => idNumber(a.id) - idNumber(b.id));
    }

    memCache.set(slug, { entries, ts: Date.now() });
    return { catalogue: def, entries, total: entries.length };
}
