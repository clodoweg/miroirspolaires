import type { APIRoute } from 'astro';
import { fetchCatalogueEntries } from '@/lib/catalogues/fetch';
import { FRENCH_NAMES } from '@/data/common_names_fr';
import { constellationFromCoords } from '@/lib/constellation-from-coords';
import { getConstellationName } from '@/lib/constellations';
import { categorize, typeLabel } from '@/lib/catalogues/classify';
import { bestObservationMonth } from '@/lib/catalogues/best-month';
import {
    errorResponse,
    internalErrorResponse,
    jsonResponse,
    parseBoundedInt,
    parseBoundedString,
    parseNumberInRange,
} from '@/lib/api/http';
import { foldAccents } from '@/utils/normalize';

/** Natural-order key: numbers within strings sort numerically ("M 9" < "M 10"). */
function naturalKey(s: string): (string | number)[] {
    return s.split(/(\d+)/).map((part) => (/^\d+$/.test(part) ? Number(part) : part.toLowerCase()));
}
function naturalCompare(a: string, b: string): number {
    const ka = naturalKey(a);
    const kb = naturalKey(b);
    const len = Math.min(ka.length, kb.length);
    for (let i = 0; i < len; i++) {
        const x = ka[i];
        const y = kb[i];
        if (typeof x === 'number' && typeof y === 'number') {
            if (x !== y) return x - y;
        } else {
            const sx = String(x);
            const sy = String(y);
            if (sx !== sy) return sx < sy ? -1 : 1;
        }
    }
    return ka.length - kb.length;
}

export const prerender = false;

export const GET: APIRoute = async ({ params, url }) => {
    const slug = params.slug?.trim();
    if (!slug || slug.length > 40) return errorResponse(400, 'Catalogue manquant ou invalide.');

    try {
        const result = await fetchCatalogueEntries(slug);
        if (!result) return errorResponse(404, 'Catalogue inconnu.');

        const q = parseBoundedString(url.searchParams.get('q'), 80).toLowerCase();
        const sortRaw = parseBoundedString(url.searchParams.get('sort'), 32) || 'default';
        const [sort, dirRaw] = sortRaw.split(':');
        const dir: 'asc' | 'desc' = dirRaw === 'desc' ? 'desc' : 'asc';
        const lat = parseNumberInRange(url.searchParams.get('lat'), { min: -90, max: 90 }) ?? null;
        const page = parseBoundedInt(url.searchParams.get('page'), { fallback: 1, min: 1, max: 10000 });
        const limit = parseBoundedInt(url.searchParams.get('limit'), { fallback: 1000, min: 20, max: 2000 });

        let entries = result.entries.map((e) => {
            const fr = FRENCH_NAMES[e.id];
            const next = fr ? { ...e, commonName: fr } : { ...e };
            if (!next.constellation) {
                const c = constellationFromCoords(next.ra, next.dec);
                if (c) next.constellation = c;
            }
            if (lat != null) {
                const bm = bestObservationMonth(next.ra, next.dec, lat);
                next.bestMonthIndex = bm.monthIndex;
                next.bestMonthLabel = bm.label;
                next.bestMonthMaxAlt = bm.maxAltitudeDeg;
            }
            return next;
        });

        if (q) {
            const cleanQ = foldAccents(q).trim();
            entries = entries.filter((e) => {
                const constName = e.constellation ? getConstellationName(e.constellation) : '';
                const constNameClean = foldAccents(constName);
                const haystack = foldAccents(
                    `${e.id} ${e.label} ${e.commonName ?? ''} ${e.type ?? ''} ${e.constellation ?? ''} ${constNameClean} ${e.description ?? ''}`,
                );
                return haystack.includes(cleanQ);
            });
        }

        let cmp: ((a: (typeof entries)[number], b: (typeof entries)[number]) => number) | null = null;
        switch (sort) {
            case 'id':
                cmp = (a, b) => naturalCompare(a.label, b.label);
                break;
            case 'commonName':
                cmp = (a, b) => {
                    const an = a.commonName ?? '';
                    const bn = b.commonName ?? '';
                    if (!an && !bn) return 0;
                    if (!an) return 1;
                    if (!bn) return -1;
                    return an.localeCompare(bn, 'fr');
                };
                break;
            case 'category':
                cmp = (a, b) => categorize(a.type).localeCompare(categorize(b.type), 'fr');
                break;
            case 'type':
                cmp = (a, b) => typeLabel(a.type).localeCompare(typeLabel(b.type), 'fr');
                break;
            case 'mag':
                cmp = (a, b) => (a.mag ?? 99) - (b.mag ?? 99);
                break;
            case 'size':
                cmp = (a, b) => (a.sizeArcmin ?? 0) - (b.sizeArcmin ?? 0);
                break;
            case 'ra':
                cmp = (a, b) => a.ra - b.ra;
                break;
            case 'dec':
                cmp = (a, b) => a.dec - b.dec;
                break;
            case 'constellation':
                cmp = (a, b) => (a.constellation ?? '').localeCompare(b.constellation ?? '');
                break;
            case 'bestMonth':
                cmp = (a, b) => (a.bestMonthIndex ?? 99) - (b.bestMonthIndex ?? 99);
                break;
            // 'default': keep registry order
        }
        if (cmp) {
            const sign = dir === 'desc' ? -1 : 1;
            entries = [...entries].sort((a, b) => sign * cmp!(a, b));
        }

        const total = entries.length;
        const start = (page - 1) * limit;
        const slice = entries.slice(start, start + limit);

        const cacheControl = import.meta.env.DEV
            ? 'no-store, no-cache, must-revalidate, proxy-revalidate'
            : 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800';

        return jsonResponse(
            { catalogue: result.catalogue, page, limit, total, entries: slice },
            { headers: { 'Cache-Control': cacheControl } },
        );
    } catch (error) {
        return internalErrorResponse(`catalogue/${slug}`, error);
    }
};
