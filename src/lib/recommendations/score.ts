/**
 * Recommendation engine.
 *
 * Given a location and a reference month, find catalogue objects whose
 * peak altitude during astronomical night falls in [month-1, month, month+1].
 *
 * Implementation:
 *   1. Aggregate a curated pool of candidates from the catalogue registry
 *      (Messier + Caldwell + the brightest NGC/IC entries by V mag).
 *   2. For each candidate, compute the monthly visibility curve at the
 *      requested location (12 months starting at the reference month - 1).
 *   3. Pick the month with the highest "max night altitude" → that is the
 *      candidate's peak month.
 *   4. Keep candidates whose peak month is within ±1 month of the reference.
 *   5. Sort by peak altitude descending, then by magnitude.
 *
 * The whole computation is pure (no I/O once entries are loaded), so it
 * scales linearly with the number of candidates. We bound the pool to keep
 * server time well below 1s.
 */

import { altAz, sunPosition, type ObsLocation } from '@/lib/objects/observation';
import { fetchCatalogueEntries, type CatalogueEntry } from '@/lib/catalogues/fetch';

export interface Recommendation extends CatalogueEntry {
    /** Slug of the source catalogue (messier, caldwell, ngc, …). */
    catalogue: string;
    /** Year-month start of the candidate's peak observability month. */
    peakMonthStart: Date;
    /** Maximum altitude (deg) reached during astronomical night at peak month. */
    peakAltDeg: number;
    /** Offset relative to reference month: -1, 0 or +1. */
    peakOffset: -1 | 0 | 1;
    /** Total hours spent above 30° altitude during astronomical night (sun <= -12°) at peak month. */
    nightHoursAbove30: number;
    /** Calculated observability score (0 to 100). */
    score: number;
}

/**
 * Estimate the candidate's peak month over a 3-month window centered on the
 * reference month. We still scan ±1 month and pick the best of the three.
 *
 * The probe is the 15th of each month at noon UTC, sampled every 15 minutes over
 * 24h. Sun altitude must be ≤ -12° for the sample to count (astro night).
 */
function peakMonth(
    raDeg: number,
    decDeg: number,
    loc: ObsLocation,
    refMonthStart: Date,
): { offset: -1 | 0 | 1; alt: number; monthStart: Date; nightHoursAbove30: number } | null {
    let best: { offset: -1 | 0 | 1; alt: number; monthStart: Date; nightHoursAbove30: number } | null = null;
    for (const offset of [-1, 0, 1] as const) {
        const monthStart = new Date(refMonthStart.getFullYear(), refMonthStart.getMonth() + offset, 1);
        const probe = new Date(monthStart.getFullYear(), monthStart.getMonth(), 15, 12, 0, 0, 0);
        let maxAlt = -90;
        let nightStepsAbove30 = 0;
        const stepMin = 15;
        const totalSteps = (24 * 60) / stepMin;

        for (let i = 0; i < totalSteps; i++) {
            const t = new Date(probe.getTime() + i * stepMin * 60 * 1000);
            const sun = sunPosition(t);
            const sunAlt = altAz(sun.ra, sun.dec, loc, t).altDeg;
            if (sunAlt > -12) continue;

            const alt = altAz(raDeg, decDeg, loc, t).altDeg;
            if (alt > maxAlt) maxAlt = alt;
            if (alt >= 30) {
                nightStepsAbove30++;
            }
        }

        const nightHoursAbove30 = Math.round(nightStepsAbove30 * (stepMin / 60) * 10) / 10;
        if (maxAlt < 10) continue;
        if (
            !best ||
            maxAlt - best.alt > 0.2 ||
            (Math.abs(maxAlt - best.alt) <= 0.2 && Math.abs(offset) < Math.abs(best.offset))
        ) {
            best = { offset, alt: maxAlt, monthStart, nightHoursAbove30 };
        }
    }
    return best;
}

/**
 * True spherical separation in degrees between two equatorial positions.
 * Used as a fallback dedup signal when textual cross-references are missing.
 */
function angularSepDeg(ra1: number, dec1: number, ra2: number, dec2: number): number {
    const toRad = Math.PI / 180;
    const d1 = dec1 * toRad;
    const d2 = dec2 * toRad;
    const dRa = (ra1 - ra2) * toRad;
    const cos = Math.sin(d1) * Math.sin(d2) + Math.cos(d1) * Math.cos(d2) * Math.cos(dRa);
    return Math.acos(Math.min(1, Math.max(-1, cos))) / toRad;
}

/**
 * Two entries within this radius are treated as the same object.
 * 5′ is wide enough to absorb the ~3′ offset between SIMBAD's modern
 * positions (used for Messier/Caldwell) and the NGC 2000.0 historical
 * positions for extended objects like M6/NGC 6405, while staying tight
 * enough to avoid colliding with neighbouring clusters/nebulae.
 */
const DEDUP_RADIUS_DEG = 5 / 60;

/** Normalise a catalogue id for textual comparison ("NGC6405" / "NGC 6405" → "NGC 6405"). */
function normaliseId(s: string): string {
    return s.replace(/\s+/g, ' ').trim().toUpperCase();
}

function isDuplicate(
    cand: CatalogueEntry,
    existing: Array<CatalogueEntry & { catalogue: string }>,
    aliasSet: Set<string>,
): boolean {
    if (aliasSet.has(normaliseId(cand.id))) return true;
    for (const e of existing) {
        if (angularSepDeg(cand.ra, cand.dec, e.ra, e.dec) <= DEDUP_RADIUS_DEG) return true;
    }
    return false;
}

/**
 * Collect the set of cross-catalogue aliases from already-tagged entries.
 * SIMBAD's main_id is stored as `commonName`, which is typically the canonical
 * NGC/IC designation for Messier/Caldwell objects (e.g. M 6 → "NGC 6405").
 */
function collectAliases(entries: Array<CatalogueEntry & { catalogue: string }>): Set<string> {
    const set = new Set<string>();
    for (const e of entries) {
        set.add(normaliseId(e.id));
        if (e.commonName) set.add(normaliseId(e.commonName));
    }
    return set;
}

const ALL_CATALOGUE_SPECS: { slug: string; limit?: number; maxMag?: number }[] = [
    { slug: 'messier' },
    { slug: 'caldwell' },
    { slug: 'ngc', limit: 300, maxMag: 11.5 },
    { slug: 'ic', limit: 200, maxMag: 12.0 },
    { slug: 'sharpless', limit: 313 },
    { slug: 'lbn', limit: 200 },
    { slug: 'barnard', limit: 349 },
    { slug: 'arp', limit: 338 },
    { slug: 'ugc', limit: 200, maxMag: 12.0 },
    { slug: 'vdb', limit: 158 },
    { slug: 'rcw', limit: 182 },
    { slug: 'hcg', limit: 100 },
    { slug: 'ldn', limit: 200 },
    { slug: 'ced', limit: 215 },
    { slug: 'ocl', limit: 200, maxMag: 11.0 },
    { slug: 'pn', limit: 200, maxMag: 13.0 },
    { slug: 'aco', limit: 150 },
    { slug: 'gc', limit: 150 },
];

// WARNING: la page est rendue côté serveur et attend ce chargement. Sans borne, une panne du CDS la bloque
// jusqu'au délai maximal de la fonction Vercel, et le visiteur ne reçoit rien.
const POOL_LOAD_DEADLINE_MS = 12_000;

// POURQUOI : un pool incomplet est conservé peu de temps, pour éviter d'attendre la borne à chaque requête
// pendant une panne, tout en récupérant les catalogues manquants dès le retour du service.
const INCOMPLETE_POOL_TTL_MS = 5 * 60 * 1000;

interface CandidatePool {
    candidates: Array<CatalogueEntry & { catalogue: string }>;
    /** False when at least one catalogue failed or missed the loading deadline. */
    isComplete: boolean;
}

/**
 * Build the list of candidate objects across all deep-sky catalogues.
 * Deduplicates cross-referenced objects (e.g. M 31 / NGC 224 / Caldwell entries).
 */
async function buildCandidatePool(): Promise<CandidatePool> {
    const tagged: Array<CatalogueEntry & { catalogue: string }> = [];
    const aliases = collectAliases(tagged);
    let isComplete = true;

    let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<'deadline'>((resolve) => {
        deadlineTimer = setTimeout(() => resolve('deadline'), POOL_LOAD_DEADLINE_MS);
    });
    // POURQUOI : chargement en parallèle pour que le temps total ne cumule pas les délais de chaque catalogue.
    // Une requête qui dépasse la borne continue en arrière-plan et alimente le cache mémoire de fetchCatalogueEntries.
    const loads = await Promise.all(
        ALL_CATALOGUE_SPECS.map((spec) =>
            Promise.race([fetchCatalogueEntries(spec.slug), deadline]).catch((err: unknown) => {
                console.error(`Failed to load candidates for ${spec.slug} in recommendations:`, err);
                return 'failed' as const;
            }),
        ),
    );
    clearTimeout(deadlineTimer);

    // POURQUOI : fusion dans l'ordre de ALL_CATALOGUE_SPECS, car la déduplication garde la première occurrence
    // (M 31 doit l'emporter sur NGC 224), quel que soit l'ordre d'arrivée des réponses.
    ALL_CATALOGUE_SPECS.forEach((spec, index) => {
        const data = loads[index];
        if (data === 'deadline' || data === 'failed') {
            isComplete = false;
            if (data === 'deadline') {
                console.error(`Timed out loading candidates for ${spec.slug} in recommendations`);
            }
            return;
        }
        if (!data || !data.entries) return;

        let candidates = data.entries;
        if (spec.maxMag !== undefined) {
            candidates = candidates.filter(
                (e) => e.mag == null || (typeof e.mag === 'number' && e.mag <= spec.maxMag!),
            );
        }

        let addedCount = 0;
        for (const e of candidates) {
            if (spec.limit !== undefined && addedCount >= spec.limit) break;
            if (isDuplicate(e, tagged, aliases)) continue;
            tagged.push({ ...e, catalogue: spec.slug });
            aliases.add(normaliseId(e.id));
            if (e.commonName) aliases.add(normaliseId(e.commonName));
            addedCount++;
        }
    });

    return { candidates: tagged, isComplete };
}

/** In-memory cache of candidate pool: kept until the next server boot once complete. */
let poolCache: (CandidatePool & { expiresAt: number }) | null = null;
let poolPromise: Promise<CandidatePool> | null = null;

/** Helper d'isolation pour les tests unitaires : réinitialise le cache du pool de candidats. */
export function _resetPoolCache() {
    poolCache = null;
    poolPromise = null;
}

async function getCandidatePool(): Promise<CandidatePool> {
    if (poolCache && Date.now() < poolCache.expiresAt) return poolCache;
    if (!poolPromise) {
        poolPromise = buildCandidatePool()
            .then((pool) => {
                poolCache = {
                    ...pool,
                    expiresAt: pool.isComplete ? Infinity : Date.now() + INCOMPLETE_POOL_TTL_MS,
                };
                return pool;
            })
            .finally(() => {
                poolPromise = null;
            });
    }
    return poolPromise;
}

export interface RecommendationOptions {
    location: ObsLocation;
    /** Reference date: the recommendation window is the month containing it. */
    date: Date;
    /** Optional maximum number of recommendations to return (if omitted, returns all matching items). */
    limit?: number;
    /** Minimum peak altitude in degrees to consider (default 30). */
    minAltDeg?: number;
}

export async function buildRecommendations(opts: RecommendationOptions): Promise<{
    referenceMonthStart: Date;
    items: Recommendation[];
    poolSize: number;
    /** False when some catalogues were unavailable: the result must not be cached for long. */
    poolComplete: boolean;
}> {
    const minAlt = opts.minAltDeg ?? 30;
    const refMonthStart = new Date(opts.date.getFullYear(), opts.date.getMonth(), 1);
    const { candidates: pool, isComplete: poolComplete } = await getCandidatePool();
    // POURQUOI : une liste vide due à une panne ne doit pas passer pour un succès, le CDN la garderait 24 h.
    if (pool.length === 0 && !poolComplete) {
        throw new Error('No catalogue available for recommendations');
    }

    const items: Recommendation[] = [];
    for (const cand of pool) {
        const peak = peakMonth(cand.ra, cand.dec, opts.location, refMonthStart);
        if (!peak) continue;
        if (peak.alt < minAlt) continue;

        // POURQUOI : Calcul d'un score d'observabilité composite sur 100 points
        // - Altitude au zénith (0 à 40 pts) : plus la hauteur maximale est proche de 90°, meilleure est la qualité.
        // - Durée utile nocturne > 30° (0 à 25 pts) : favorise les objets visibles longtemps pendant la nuit astro.
        // - Taille apparente en arcminutes (0 à 20 pts) : favorise les grands objets spectaculaires ("plus c'est grand, mieux c'est").
        // - Coïncidence du mois de pic (5 ou 15 pts) : privilégie les objets au sommet de leur visibilité le mois même.
        const altScore = Math.max(0, Math.min(40, Math.round(((peak.alt - 30) / 60) * 40)));
        const hoursScore = Math.max(0, Math.min(25, Math.round((peak.nightHoursAbove30 / 8) * 25)));
        const sizeArcmin = typeof cand.sizeArcmin === 'number' && !isNaN(cand.sizeArcmin) ? cand.sizeArcmin : 0;
        const sizeScore =
            sizeArcmin > 0 ? Math.max(0, Math.min(20, Math.round((Math.sqrt(sizeArcmin) / Math.sqrt(60)) * 20))) : 0;
        const offsetScore = peak.offset === 0 ? 15 : 5;
        const score = Math.min(100, Math.max(0, altScore + hoursScore + sizeScore + offsetScore));

        items.push({
            ...cand,
            peakMonthStart: peak.monthStart,
            peakAltDeg: peak.alt,
            peakOffset: peak.offset,
            nightHoursAbove30: peak.nightHoursAbove30,
            score,
        });
    }

    items.sort((a, b) => {
        // Tri par défaut par score décroissant, puis par altitude, puis par magnitude.
        if (b.score !== a.score) return b.score - a.score;
        if (b.peakAltDeg !== a.peakAltDeg) return b.peakAltDeg - a.peakAltDeg;
        return (a.mag ?? 99) - (b.mag ?? 99);
    });

    const finalItems = opts.limit && opts.limit > 0 ? items.slice(0, opts.limit) : items;

    return {
        referenceMonthStart: refMonthStart,
        items: finalItems,
        poolSize: pool.length,
        poolComplete,
    };
}
