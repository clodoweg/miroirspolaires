/**
 * GET /api/object/resolve?q=<désignation>
 *
 * Résout un objet du ciel profond (Sesame, SIMBAD, VizieR… via `src/lib/objects/resolve.ts`).
 */

import type { APIRoute } from 'astro';
import { resolveObject } from '@/lib/objects/resolve';
import { errorResponse, internalErrorResponse, jsonResponse } from '@/lib/api/http';
import { UpstreamUnavailableError } from '@/lib/upstream/failover';

export const prerender = false;

const MAX_QUERY_LENGTH = 80;

export const GET: APIRoute = async ({ url }) => {
    const query = url.searchParams.get('q')?.trim() ?? '';
    if (!query) {
        return errorResponse(400, 'Paramètre "q" manquant.');
    }
    if (query.length > MAX_QUERY_LENGTH) {
        return errorResponse(400, 'Paramètre "q" trop long.');
    }

    try {
        const result = await resolveObject(query);
        if (!result) {
            return errorResponse(404, `Aucun objet trouvé pour "${query}".`);
        }
        const cacheControl = import.meta.env.DEV
            ? 'no-store, no-cache, must-revalidate, proxy-revalidate'
            : 'public, max-age=86400, stale-while-revalidate=604800';
        return jsonResponse(result, { headers: { 'Cache-Control': cacheControl } });
    } catch (error) {
        if (error instanceof UpstreamUnavailableError) {
            console.error('object/resolve', error.message);
            // POURQUOI : Sesame Harvard expire sur un nom inconnu. Pendant une panne du CDS, on ne peut donc pas
            // distinguer une faute de frappe d'une vraie panne, et le message couvre les deux cas.
            return errorResponse(503, 'Résolution des noms momentanément indisponible. Vérifiez aussi la désignation.');
        }
        return internalErrorResponse('object/resolve', error);
    }
};
