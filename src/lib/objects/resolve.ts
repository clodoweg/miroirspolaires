/**
 * Object resolver orchestrator.
 *
 * Given a user query, resolves the target via Sesame, fetches scientific
 * data from SIMBAD, contextual prose from Wikipedia, builds multi-survey
 * thumbnails via hips2fits, and links to the user's own astrophotography
 * if any matches the catalogue ids. Failures of any single source are
 * captured as warnings rather than fatal errors.
 */

import { resolveWithSesame } from './sesame';
import { fetchSimbad } from './simbad';
import { fetchWikipedia } from './wikipedia';
import { fetchNed } from './ned';
import { fetchCatalogEntries } from './vizier';
import { buildSkyImages, pickFovDeg } from './hips2fits';
import { UpstreamUnavailableError } from '@/lib/upstream/failover';
import { findOwnPhotos } from './own-photos';
import type { ResolvedObject } from './types';
import { FRENCH_NAMES } from '../../data/common_names_fr';
import { foldAccents } from '@/utils/normalize';

// Process-level memo for resolveObject. Keyed by the normalised user query
// (lowercase, single-spaced). The outbound CDS chain takes 3-6 s per cold call,
// so even a short-lived cache eliminates repeat hits for popular targets
// (M 42, NGC 7000, …) and for users who share/refresh a deep-link.
const RESOLVE_TTL_MS = 24 * 60 * 60 * 1000;
const RESOLVE_CACHE_MAX = 200;
const resolveCache = new Map<string, { result: ResolvedObject | null; ts: number }>();
const inFlight = new Map<string, Promise<ResolvedObject | null>>();

function cacheKey(q: string): string {
    return q.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Normalise une chaîne de caractères pour faciliter la recherche insensible à la casse et aux accents.
 *
 * @param s La chaîne de caractères à normaliser
 * @returns La chaîne normalisée
 */
function normalizeString(s: string): string {
    return foldAccents(s)
        .replace(/[^a-z0-9]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function readCache(key: string): ResolvedObject | null | undefined {
    const hit = resolveCache.get(key);
    if (!hit) return undefined;
    if (Date.now() - hit.ts > RESOLVE_TTL_MS) {
        resolveCache.delete(key);
        return undefined;
    }
    // LRU bump
    resolveCache.delete(key);
    resolveCache.set(key, hit);
    return hit.result;
}

function writeCache(key: string, result: ResolvedObject | null): void {
    if (resolveCache.size >= RESOLVE_CACHE_MAX) {
        // Drop the oldest entry — Map iteration is insertion-ordered.
        const oldest = resolveCache.keys().next().value;
        if (oldest !== undefined) resolveCache.delete(oldest);
    }
    resolveCache.set(key, { result, ts: Date.now() });
}

export async function resolveObject(query: string): Promise<ResolvedObject | null> {
    const trimmed = query.trim();
    if (!trimmed) return null;

    const key = cacheKey(trimmed);
    const cached = readCache(key);
    if (cached !== undefined) return cached;

    // Coalesce concurrent calls for the same key so a burst of requests
    // (e.g. server prefetch + client fetch on hydration) makes a single
    // CDS round-trip.
    const existing = inFlight.get(key);
    if (existing) return existing;

    const promise = doResolve(trimmed)
        .then((result) => {
            writeCache(key, result);
            inFlight.delete(key);
            return result;
        })
        .catch((err) => {
            inFlight.delete(key);
            throw err;
        });
    inFlight.set(key, promise);
    return promise;
}

async function doResolve(trimmed: string): Promise<ResolvedObject | null> {
    const warnings: string[] = [];

    // POURQUOI: Si l'utilisateur saisit un nom français usuel (ex: "galaxie d'andromède"),
    // on le traduit en identifiant de catalogue (ex: "M 31") avant d'appeler Sesame,
    // car les APIs du CDS (Sesame/Simbad) échouent souvent sur les traductions françaises.
    const normQuery = normalizeString(trimmed);
    let resolvedQuery = trimmed;
    for (const [key, val] of Object.entries(FRENCH_NAMES)) {
        if (normalizeString(val) === normQuery) {
            resolvedQuery = key;
            break;
        }
    }

    const sesame = await resolveWithSesame(resolvedQuery).catch((e) => {
        // POURQUOI : une panne ne doit pas passer pour un objet inconnu, ni être gardée en cache comme telle.
        if (e instanceof UpstreamUnavailableError) throw e;
        warnings.push(`Sesame: ${(e as Error).message}`);
        return null;
    });
    if (!sesame) return null;

    // Phase 1: SIMBAD alone — its alias list feeds Wikipedia, NED, VizieR.
    const simbad = await fetchSimbad(sesame.canonicalName).catch((e) => {
        warnings.push(`SIMBAD: ${(e as Error).message}`);
        return null;
    });

    const aliasesForLookup = dedupe([sesame.canonicalName, ...(simbad?.aliases ?? []), ...sesame.aliases]);
    const isExtragalactic = isLikelyExtragalactic(simbad?.otype);

    // Phase 2: Wikipedia + NED + VizieR catalogue rows, all in parallel.
    const [wiki, ned, catalogEntries] = await Promise.all([
        fetchWikipedia(buildWikiCandidates(sesame.canonicalName, aliasesForLookup)).catch((e) => {
            warnings.push(`Wikipedia: ${(e as Error).message}`);
            return null;
        }),
        isExtragalactic
            ? fetchNed(sesame.canonicalName).catch((e) => {
                  warnings.push(`NED: ${(e as Error).message}`);
                  return null;
              })
            : Promise.resolve(null),
        fetchCatalogEntries(aliasesForLookup).catch((e) => {
            warnings.push(`VizieR: ${(e as Error).message}`);
            return [];
        }),
    ]);

    const ra = simbad?.coords?.ra ?? sesame.ra;
    const dec = simbad?.coords?.dec ?? sesame.dec;
    const fov = pickFovDeg(simbad?.dimMajArcmin);
    const images = buildSkyImages(ra, dec, fov);

    const ownPhotos = findOwnPhotos(aliasesForLookup);

    return {
        query: trimmed,
        canonicalName: simbad?.mainId?.replace(/\s+/g, ' ').trim() || sesame.canonicalName,
        coords: { ra, dec },
        simbad: simbad ?? undefined,
        ned: ned ?? undefined,
        catalogEntries: catalogEntries.length ? catalogEntries : undefined,
        wikipedia: wiki ?? undefined,
        images,
        defaultFovDeg: fov,
        ownPhotos: ownPhotos.length ? ownPhotos : undefined,
        aliases: aliasesForLookup,
        warnings: warnings.length ? warnings : undefined,
    };
}

/**
 * Heuristic: SIMBAD otype starts with G for galaxies; QSO/AGN/Sy* for AGN.
 */
function isLikelyExtragalactic(otype?: string): boolean {
    if (!otype) return false;
    const t = otype.trim();
    if (t.startsWith('G')) return true;
    return ['QSO', 'AGN', 'Sy1', 'Sy2', 'Bla', 'BLL', 'rG', 'LIN', 'BiC', 'IG', 'PaG'].includes(t);
}

/**
 * Build plausible Wikipedia page titles from SIMBAD ids.
 * SIMBAD uses two spaces between catalogue and number ("M  31"); Wikipedia
 * uses single space and sometimes the long form ("Messier 31").
 */
function buildWikiCandidates(canonical: string, aliases: string[]): string[] {
    const out: string[] = [];
    const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();
    const push = (s: string) => {
        const v = collapse(s);
        if (v && !out.includes(v)) out.push(v);
    };

    push(canonical);
    for (const a of aliases) {
        push(a);
        // Long forms used by Wikipedia
        const m = collapse(a).match(/^M\s*(\d+)$/);
        if (m) push(`Messier ${m[1]}`);
        const ngc = collapse(a).match(/^NGC\s*(\d+)$/i);
        if (ngc) push(`NGC ${ngc[1]}`);
        const ic = collapse(a).match(/^IC\s*(\d+)$/i);
        if (ic) push(`IC ${ic[1]}`);
        const sh2 = collapse(a).match(/^Sh\s*2\s*-?\s*(\d+)$/i);
        if (sh2) push(`Sh2-${sh2[1]}`);
        const named = collapse(a).match(/^NAME\s+(.+)$/i);
        if (named) push(named[1]);
    }
    return out;
}

function dedupe(list: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of list) {
        const k = item.replace(/\s+/g, ' ').trim();
        if (!k) continue;
        const lo = k.toLowerCase();
        if (seen.has(lo)) continue;
        seen.add(lo);
        out.push(k);
    }
    return out;
}
