/**
 * GET /api/object/geocode?q=<lieu>
 *
 * Géocode un lieu d'observation via Nominatim (voir `src/lib/objects/nominatim.ts`, qui gère
 * cadence, cache et délai). Les réponses sont mises en cache par le CDN pour 24 h.
 */

import type { APIRoute } from 'astro';
import { errorResponse, internalErrorResponse, jsonResponse } from '../../../lib/api/http';
import { GeocodeRateLimitError, GeocodeUpstreamError, geocodePlace } from '../../../lib/objects/nominatim';

export const prerender = false;

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 200;

export const GET: APIRoute = async ({ url }) => {
    const query = url.searchParams.get('q')?.trim() ?? '';
    if (query.length < MIN_QUERY_LENGTH) {
        return errorResponse(400, 'Paramètre "q" manquant ou trop court.');
    }
    if (query.length > MAX_QUERY_LENGTH) {
        return errorResponse(400, 'Paramètre "q" trop long.');
    }

    try {
        const results = await geocodePlace(query);
        return jsonResponse(
            { results },
            { headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800' } },
        );
    } catch (error) {
        if (error instanceof GeocodeRateLimitError) {
            return jsonResponse(
                { error: 'Trop de requêtes, réessayez dans quelques secondes.' },
                { status: 429, headers: { 'Retry-After': '2', 'Cache-Control': 'no-store' } },
            );
        }
        if (error instanceof GeocodeUpstreamError) {
            console.error('[api] object/geocode:', error);
            return errorResponse(502, 'Service de géocodage indisponible.');
        }
        return internalErrorResponse('object/geocode', error);
    }
};
