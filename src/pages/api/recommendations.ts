/**
 * GET /api/recommendations?lat=&lon=&name=&date=&limit=&minAlt=
 *
 * Recommandations d'objets à photographier pour un lieu et une date (voir
 * `src/lib/recommendations/score.ts`). Tous les paramètres sont bornés : un lieu hors de
 * la Terre ou une date invalide renvoie 400 au lieu de lancer un calcul complet.
 */

import type { APIRoute } from 'astro';
import { buildRecommendations } from '@/lib/recommendations/score';
import { DEFAULT_LOCATION } from '@/lib/objects/observation';
import { quantizeCoordinate, quantizeDateToHour, recommendationsCacheControl } from '@/lib/recommendations/query';
import {
    errorResponse,
    internalErrorResponse,
    jsonResponse,
    parseBoundedInt,
    parseBoundedString,
    parseDateParam,
    parseNumberInRange,
} from '@/lib/api/http';

export const prerender = false;

const MAX_LIMIT = 500;

export const GET: APIRoute = async ({ url }) => {
    const { searchParams } = url;
    const latRaw = searchParams.get('lat');
    const lonRaw = searchParams.get('lon');
    const lat = parseNumberInRange(latRaw, { min: -90, max: 90 });
    const lon = parseNumberInRange(lonRaw, { min: -180, max: 180 });
    if ((latRaw && lat === undefined) || (lonRaw && lon === undefined)) {
        return errorResponse(400, 'Coordonnées invalides.');
    }

    const date = parseDateParam(searchParams.get('date'));
    if (date === undefined) {
        return errorResponse(400, 'Date invalide.');
    }

    const name = parseBoundedString(searchParams.get('name'), 80) || DEFAULT_LOCATION.name;
    const limit = searchParams.has('limit')
        ? parseBoundedInt(searchParams.get('limit'), { fallback: MAX_LIMIT, min: 1, max: MAX_LIMIT })
        : undefined;
    const minAlt = parseBoundedInt(searchParams.get('minAlt'), { fallback: 30, min: 0, max: 80 });

    // POURQUOI : même quantification que le client, pour que les appels directs ne contournent pas le cache.
    const location =
        lat !== undefined && lon !== undefined
            ? { lat: quantizeCoordinate(lat), lon: quantizeCoordinate(lon), name }
            : DEFAULT_LOCATION;

    try {
        const result = await buildRecommendations({
            location,
            date: quantizeDateToHour(date ?? new Date()),
            limit,
            minAltDeg: minAlt,
        });
        return jsonResponse(
            { ...result, location },
            { headers: { 'Cache-Control': recommendationsCacheControl(result.poolComplete) } },
        );
    } catch (error) {
        return internalErrorResponse('recommendations', error);
    }
};
