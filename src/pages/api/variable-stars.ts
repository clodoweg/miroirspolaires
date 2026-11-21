/**
 * @file variable-stars.ts
 * @description API endpoint pour récupérer les étoiles variables avec filtrage SQL optimisé.
 *
 * Responsabilité principale :
 * - Fournir les étoiles variables paginées avec filtrage par type, constellation,
 *   magnitude, amplitude, visibilité nocturne et faisabilité instrumentale.
 *
 * Architecture d'optimisation :
 * Le catalogue contient ~4.8M d'étoiles. Pour éviter des scans coûteux sur une
 * base Turso distante, on maximise le pré-filtrage SQL :
 *   1. Déclinaison (dec) : réduit à la bande visible depuis la latitude
 *   2. Magnitude (v_mag_max) : filtre par la limite instrumentale
 * Ensuite, le calcul d'observabilité JS ne s'applique qu'aux résultats SQL (500 au plus).
 *
 * WARNING: tous les paramètres sont bornés (page, limit, coordonnées, longueur de recherche) :
 * en SQLite, `LIMIT -1` signifie « sans limite », soit les 4,8 M lignes.
 *
 * Index requis sur variable_stars :
 *   - idx_var_stars_dec_vmag ON (dec, v_mag_max) → requêtes Faisable
 *   - idx_var_stars_dec ON (dec) → requêtes Visible ce soir
 *   - idx_var_stars_type ON (type) → filtre par catégorie
 *   - idx_var_stars_v_mag_max ON (v_mag_max) → filtre par magnitude
 */

import type { APIRoute } from 'astro';
import { db } from '../../lib/db';
import { observability, type ObsLocation } from '../../lib/objects/observation';
import { constellations } from '../../lib/constellations';
import {
    errorResponse,
    internalErrorResponse,
    jsonResponse,
    parseBoundedInt,
    parseBoundedString,
    parseDateParam,
    parseNumberInRange,
} from '../../lib/api/http';
import { foldAccents } from '@/utils/normalize';

export const prerender = false;

const DEG = Math.PI / 180;
const MAX_PAGE_SIZE = 100;
// POURQUOI : au-delà, l'OFFSET oblige SQLite à parcourir des centaines de milliers de lignes.
const MAX_PAGE = 1000;
const MAX_SEARCH_LENGTH = 64;
// POURQUOI : borne large des magnitudes et amplitudes plausibles ; au-delà, la valeur est ignorée.
const MAGNITUDE_RANGE = { min: -30, max: 40 };

// POURQUOI : mots-clés de type reconnus dans la recherche, avec la longueur minimale du préfixe
// saisi. Les valeurs sont celles de la colonne `type` (eclipsing, semiregular, cepheid, mira,
// cataclysmique). « rr lyrae » exige 7 caractères pour que « RR Lyr », nom d'étoile, reste
// une recherche par nom.
const SEARCH_TYPE_KEYWORDS: { keyword: string; type: string; minLength: number }[] = [
    { keyword: 'mira', type: 'mira', minLength: 4 },
    { keyword: 'semi-reguliere', type: 'semiregular', minLength: 4 },
    { keyword: 'semireguliere', type: 'semiregular', minLength: 4 },
    { keyword: 'semiregular', type: 'semiregular', minLength: 4 },
    { keyword: 'binaire a eclipses', type: 'eclipsing', minLength: 4 },
    { keyword: 'eclipses', type: 'eclipsing', minLength: 4 },
    { keyword: 'eclipsing', type: 'eclipsing', minLength: 4 },
    { keyword: 'cepheide', type: 'cepheid', minLength: 4 },
    { keyword: 'cepheid', type: 'cepheid', minLength: 4 },
    { keyword: 'rr lyrae', type: 'cepheid', minLength: 7 },
    { keyword: 'cataclysmique', type: 'cataclysmique', minLength: 4 },
    { keyword: 'cataclysmic', type: 'cataclysmique', minLength: 4 },
];

/**
 * Reconnaît une recherche qui désigne un type de variabilité.
 *
 * @param foldedSearch - Saisie en minuscules, sans accents.
 * @returns La valeur de la colonne `type`, ou `''` si la saisie n'est le début d'aucun mot-clé.
 */
function matchSearchType(foldedSearch: string): string {
    const match = SEARCH_TYPE_KEYWORDS.find(
        ({ keyword, minLength }) => foldedSearch.length >= minLength && keyword.startsWith(foldedSearch),
    );
    return match?.type ?? '';
}

function normalizeType(rawType: string): string {
    const t = (rawType || '').toLowerCase().trim();
    if (
        t === 'eclipsing' ||
        t === 'eclipse' ||
        t.startsWith('e') ||
        t.startsWith('ea') ||
        t.startsWith('eb') ||
        t.startsWith('ew')
    ) {
        return 'eclipsing';
    }
    if (
        t === 'cataclysmique' ||
        t === 'cataclysmic' ||
        t.startsWith('ug') ||
        t.startsWith('n') ||
        t.startsWith('zand')
    ) {
        return 'cataclysmique';
    }
    if (t === 'cepheid' || t === 'rr_lyrae' || t.startsWith('dcep') || t.startsWith('rr')) {
        return 'cepheid';
    }
    if (t === 'mira' || t.startsWith('m')) {
        return 'mira';
    }
    return 'semiregular';
}

export const GET: APIRoute = async ({ url }) => {
    const date = parseDateParam(url.searchParams.get('date'));
    if (date === undefined) {
        return errorResponse(400, 'Date invalide.');
    }
    try {
        const requestedPage = parseBoundedInt(url.searchParams.get('page'), { fallback: 1, min: 1, max: MAX_PAGE + 1 });
        // POURQUOI : au-delà de la borne, liste vide plutôt que la dernière page autorisée répétée
        // (le client dédoublonne : « charger plus » semblerait ne rien faire).
        if (requestedPage > MAX_PAGE) {
            return jsonResponse(
                { stars: [], total: -1, page: requestedPage, limit: MAX_PAGE_SIZE, isExact: false },
                { headers: { 'Cache-Control': 'public, max-age=600' } },
            );
        }
        const page = requestedPage;
        const limit = parseBoundedInt(url.searchParams.get('limit'), { fallback: 50, min: 1, max: MAX_PAGE_SIZE });
        const search = parseBoundedString(url.searchParams.get('search'), MAX_SEARCH_LENGTH);
        const type = parseBoundedString(url.searchParams.get('type'), 32);
        const constellation = parseBoundedString(url.searchParams.get('constellation'), 8);
        const minMagStr = url.searchParams.get('minMag') || '';
        const maxMagStr = url.searchParams.get('maxMag') || '';
        const minAmplitudeStr = url.searchParams.get('minAmplitude') || '';
        const latStr = url.searchParams.get('lat') || '';
        const lonStr = url.searchParams.get('lon') || '';
        const filterVisibleCeSoir = url.searchParams.get('filterVisibleCeSoir') === 'true';
        const filterObservable = url.searchParams.get('filterObservable') === 'true';
        const apertureStr = url.searchParams.get('aperture') || '';
        const aperture = parseNumberInRange(apertureStr, { min: 1, max: 10000 });
        const limitMag = aperture === undefined ? 0 : 9 + 5 * Math.log10(aperture / 10);
        const limitMagPhotoStr = url.searchParams.get('limitMagPhoto') || '';
        // Si limitMagPhoto n'est pas spécifié, on estime la magnitude photo à limitMag + 6.0 (différence typique visuel/photo)
        const limitMagPhoto = limitMagPhotoStr
            ? (parseNumberInRange(limitMagPhotoStr, MAGNITUDE_RANGE) ?? limitMag + 6.0)
            : limitMag + 6.0;

        const sortCol = url.searchParams.get('sortCol') || 'name';
        const sortDir = url.searchParams.get('sortDir') === 'desc' ? 'DESC' : 'ASC';

        const offset = (page - 1) * limit;

        // Construire la requête SQL dynamiquement
        const whereClauses: string[] = [];
        const params: (string | number)[] = [];

        if (search) {
            const searchLower = foldAccents(search).trim();

            // 1. Détecter si la recherche cible une constellation (nom français ou abréviation)
            const matchingAbbrs: string[] = [];
            for (const [abbr, name] of Object.entries(constellations)) {
                const nameNorm = foldAccents(name);
                if (nameNorm.includes(searchLower) || abbr.toLowerCase() === searchLower) {
                    matchingAbbrs.push(abbr);
                }
            }

            // 2. Détecter si la recherche cible un type de variable
            const matchingType = matchSearchType(searchLower);

            if (matchingAbbrs.length > 0) {
                // POURQUOI : La recherche par constellation cible des index directs pour éviter un scan de table très lent
                const placeholders = matchingAbbrs.map(() => '?').join(', ');
                whereClauses.push(`constellation IN (${placeholders})`);
                params.push(...matchingAbbrs);
            } else if (matchingType) {
                // POURQUOI : La recherche par type cible l'index de type
                whereClauses.push('type = ?');
                params.push(matchingType);
            } else {
                // POURQUOI : recherche par préfixe insensible à la casse ASCII (comme LIKE) écrite en
                // intervalle NOCASE, seule forme qu'un index `name COLLATE NOCASE` peut servir. Les jokers
                // saisis (`%`, `_`) restent littéraux. WARNING: tant que cet index n'existe pas sur Turso
                // (SQL dans le rapport d'audit 2026-10), la requête parcourt les 4,8 M lignes.
                whereClauses.push('name COLLATE NOCASE >= ? AND name COLLATE NOCASE < ?');
                params.push(search, `${search}${String.fromCodePoint(0x10ffff)}`);
            }
        }
        if (type && type !== 'all') {
            if (type === 'eclipsing' || type === 'eclipse') {
                whereClauses.push("type IN ('eclipsing', 'eclipse', 'EA', 'EB', 'EW')");
            } else if (type === 'cataclysmique' || type === 'cataclysmic') {
                whereClauses.push("type IN ('cataclysmique', 'cataclysmic', 'UG', 'N', 'ZAND')");
            } else if (type === 'cepheid') {
                whereClauses.push("type IN ('cepheid', 'rr_lyrae', 'DCEP', 'RR')");
            } else if (type === 'mira') {
                whereClauses.push("type IN ('mira', 'M')");
            } else if (type === 'semiregular') {
                whereClauses.push("type IN ('semiregular', 'SR', 'L')");
            } else {
                whereClauses.push('type = ?');
                params.push(type);
            }
        }
        if (constellation && constellation !== 'all') {
            whereClauses.push('constellation = ?');
            params.push(constellation);
        }
        if (minMagStr) {
            const minMag = parseNumberInRange(minMagStr, MAGNITUDE_RANGE);
            if (minMag !== undefined) {
                whereClauses.push('v_mag_min >= ?');
                params.push(minMag);
            }
        }
        if (maxMagStr) {
            const maxMag = parseNumberInRange(maxMagStr, MAGNITUDE_RANGE);
            if (maxMag !== undefined) {
                whereClauses.push('v_mag_max <= ?');
                params.push(maxMag);
            }
        }
        if (minAmplitudeStr) {
            const minAmp = parseNumberInRange(minAmplitudeStr, MAGNITUDE_RANGE);
            if (minAmp !== undefined) {
                whereClauses.push('(v_mag_max - v_mag_min) >= ?');
                params.push(minAmp);
            }
        }

        const lat = parseNumberInRange(latStr, { min: -90, max: 90 }) ?? NaN;
        const lon = parseNumberInRange(lonStr, { min: -180, max: 180 }) ?? NaN;
        const observationDate = date ?? new Date();

        // Filtrage géométrique de déclinaison selon la latitude si fournie
        if (!isNaN(lat)) {
            if (filterObservable) {
                // Pour atteindre 30° d'altitude : |dec - lat| <= 60°
                whereClauses.push('dec >= ?');
                params.push(lat - 60);
                whereClauses.push('dec <= ?');
                params.push(lat + 60);
                if (limitMagPhoto > 0) {
                    whereClauses.push('v_mag_max > 0 AND v_mag_max <= ?');
                    params.push(limitMagPhoto + 4.0);
                }
            } else if (filterVisibleCeSoir) {
                whereClauses.push('dec >= ?');
                params.push(lat - 90);
                whereClauses.push('dec <= ?');
                params.push(lat + 90);
                if (limitMagPhoto > 0) {
                    whereClauses.push('v_mag_max > 0 AND v_mag_max <= ?');
                    params.push(limitMagPhoto + 4.0);
                }
            } else {
                whereClauses.push('dec > ?');
                params.push(lat - 90);
            }
        }

        const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        // Valider la colonne de tri pour éviter les injections SQL
        const allowedSortCols = ['name', 'v_mag_min', 'v_mag_max', 'period', 'constellation', 'distance'];
        const validSortCol = allowedSortCols.includes(sortCol) ? sortCol : 'name';

        let stars: any[] = [];
        let total = 4833587;
        const hasQueryFilters = !!(
            search ||
            (type && type !== 'all') ||
            (constellation && constellation !== 'all') ||
            minMagStr ||
            maxMagStr ||
            minAmplitudeStr
        );
        const hasRestrictiveFilters = hasQueryFilters || filterVisibleCeSoir || filterObservable;

        if (filterVisibleCeSoir || filterObservable) {
            const location: ObsLocation = {
                lat: isNaN(lat) ? -30.526 : lat,
                lon: isNaN(lon) ? -70.853 : lon,
                name: '',
            };

            // POURQUOI : On charge un lot restreint de candidats (max 500) pour garantir un temps de calcul JS < 250ms
            // tout en remplissant largement la page demandée (limit = 100).
            const SQL_FETCH_LIMIT = Math.min(500, page * 250);

            const sqlOrderCol = validSortCol === 'name' || validSortCol === 'v_mag_min' ? 'v_mag_max' : validSortCol;
            const orderBySql = hasQueryFilters ? '' : `ORDER BY ${sqlOrderCol} ${sortDir}`;

            const dataResult = await db.execute({
                sql: `
                    SELECT id, name, star_name as starName, constellation, ra, dec,
                           v_mag_min as vMagMin, v_mag_max as vMagMax, period, epoch,
                           type, spectral_type as spectralType, distance, details
                    FROM variable_stars
                    ${whereSQL}
                    ${orderBySql}
                    LIMIT ${SQL_FETCH_LIMIT}
                `,
                args: params,
            });

            // Calcul d'observabilité uniquement sur les résultats SQL
            const allFiltered = dataResult.rows
                .map((row) => ({
                    id: row.id as string,
                    name: row.name as string,
                    starName: (row.starName as string) || (row.name as string),
                    constellation: (row.constellation as string) || '',
                    ra: Number(row.ra),
                    dec: Number(row.dec),
                    vMagMin: row.vMagMin !== null ? Number(row.vMagMin) : 0,
                    vMagMax: row.vMagMax !== null ? Number(row.vMagMax) : 0,
                    period: row.period !== null ? Number(row.period) : 0,
                    epoch: row.epoch !== null ? Number(row.epoch) : 0,
                    type: normalizeType((row.type as string) || ''),
                    spectralType: (row.spectralType as string) || 'N/A',
                    distance: row.distance !== null ? Number(row.distance) : 0,
                    details: (row.details as string) || undefined,
                }))
                .filter((star) => {
                    // Pré-vérification rapide de l'altitude maximale théorique (formule O(1))
                    // POURQUOI : Évite le calcul complet d'observabilité pour les étoiles
                    // qui ne peuvent géométriquement pas atteindre l'altitude requise.
                    const latRad = location.lat * DEG;
                    const decRad = star.dec * DEG;
                    const maxPossibleAlt =
                        Math.asin(
                            Math.min(1, Math.sin(latRad) * Math.sin(decRad) + Math.cos(latRad) * Math.cos(decRad)),
                        ) / DEG;

                    if (filterObservable && maxPossibleAlt < 30) return false;
                    if (filterVisibleCeSoir && maxPossibleAlt < 0) return false;

                    // Calcul complet d'observabilité pour les candidats restants
                    const obs = observability(star.ra, star.dec, location, observationDate);
                    const maxAltNight = obs.riseSet.maxAltAtNightDeg;
                    const hoursVisible = obs.riseSet.hoursAboveHorizonAtNight ?? 0;

                    if (filterVisibleCeSoir && hoursVisible <= 0) return false;
                    if (filterObservable) {
                        const isSetupCompatible = limitMagPhoto <= 0 || star.vMagMin <= limitMagPhoto;
                        const isObservable = hoursVisible > 0 && maxAltNight !== undefined && maxAltNight >= 30;
                        if (!isSetupCompatible || !isObservable) return false;
                    }
                    return true;
                });

            // Tri en JavaScript
            // POURQUOI : Trier en JS sur la plage filtrée évite les scans et tris
            // géants en base de données.
            const propMap: Record<string, string> = {
                name: 'name',
                v_mag_min: 'vMagMin',
                v_mag_max: 'vMagMax',
                period: 'period',
                constellation: 'constellation',
                distance: 'distance',
            };
            const jsSortCol = propMap[validSortCol] || 'name';
            const sign = sortDir === 'DESC' ? -1 : 1;

            allFiltered.sort((a: any, b: any) => {
                const valA = a[jsSortCol];
                const valB = b[jsSortCol];

                if (typeof valA === 'string' && typeof valB === 'string') {
                    return sign * valA.localeCompare(valB);
                }
                if (typeof valA === 'number' && typeof valB === 'number') {
                    return sign * (valA - valB);
                }
                return 0;
            });

            // Pagination sur les résultats filtrés et triés
            const pageOffset = (page - 1) * limit;
            stars = allFiltered.slice(pageOffset, pageOffset + limit);

            // POURQUOI : Pour le filtrage d'observabilité, le décompte exact en base (COUNT*) est trop coûteux
            // (~20+ sec). Le total de cibles correspondantes est donc estimé par la taille du lot filtré (allFiltered.length).
            total = allFiltered.length;
        } else {
            // Chemin rapide sans filtrage d'observabilité : pagination SQL directe

            // POURQUOI : On lance la requête de données immédiatement en parallèle du COUNT
            // car le COUNT peut être très lent sur des constellations volumineuses (ex: Cyg = 263k lignes).
            const fastSortCol = validSortCol === 'name' || validSortCol === 'v_mag_min' ? 'v_mag_max' : validSortCol;
            const orderByClause = hasQueryFilters ? '' : `ORDER BY ${fastSortCol} ${sortDir}`;

            const dataPromise = db.execute({
                sql: `
                    SELECT id, name, star_name as starName, constellation, ra, dec,
                           v_mag_min as vMagMin, v_mag_max as vMagMax, period, epoch,
                           type, spectral_type as spectralType, distance, details
                    FROM variable_stars
                    ${whereSQL}
                    ${orderByClause}
                    LIMIT ${limit} OFFSET ${offset}
                `,
                args: params,
            });

            if (!hasRestrictiveFilters) {
                try {
                    const metaRes = await db.execute(
                        "SELECT value FROM database_metadata WHERE key = 'variable_stars_count'",
                    );
                    if (metaRes.rows.length > 0) {
                        total = Number(metaRes.rows[0].value);
                    }
                } catch {
                    total = 4833587;
                }
            } else {
                // POURQUOI : SELECT COUNT(*) sur de grands ensembles filtrés (ex: 800k étoiles à éclipses)
                // prend plusieurs secondes sur Turso et bloque le pool de connexions HTTP.
                // On fixe total = -1 pour renvoyer la réponse immédiatement (< 50ms).
                total = -1;
            }

            const dataResult = await dataPromise;

            stars = dataResult.rows.map((row) => ({
                id: row.id as string,
                name: row.name as string,
                starName: (row.starName as string) || (row.name as string),
                constellation: (row.constellation as string) || '',
                ra: Number(row.ra),
                dec: Number(row.dec),
                vMagMin: row.vMagMin !== null ? Number(row.vMagMin) : 0,
                vMagMax: row.vMagMax !== null ? Number(row.vMagMax) : 0,
                period: row.period !== null ? Number(row.period) : 0,
                epoch: row.epoch !== null ? Number(row.epoch) : 0,
                type: normalizeType((row.type as string) || ''),
                spectralType: (row.spectralType as string) || 'N/A',
                distance: row.distance !== null ? Number(row.distance) : 0,
                details: (row.details as string) || undefined,
            }));
        }

        // POURQUOI : total = -1 signifie que le COUNT a expiré (timeout de 5s sur de gros volumes).
        // On marque le résultat comme non-exact pour que le frontend masque le compteur.
        const isExact = total >= 0 && !((filterVisibleCeSoir || filterObservable) && !hasQueryFilters);

        return jsonResponse(
            { stars, total, page, limit, isExact },
            { headers: { 'Cache-Control': 'public, max-age=600' } },
        );
    } catch (error) {
        return internalErrorResponse('variable-stars', error);
    }
};
