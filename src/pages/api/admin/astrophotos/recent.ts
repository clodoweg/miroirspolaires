import type { APIRoute } from 'astro';
import { requireAdmin, jsonResponse } from '@/lib/admin/shared';
import { listRecentPhotos } from '@/lib/admin/astrophotos';

export const prerender = false;

export const GET: APIRoute = async ({ url, locals }) => {
    const blocked = requireAdmin(locals);
    if (blocked) return blocked;
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam === 'all' ? 9999 : Math.min(1000, Math.max(1, parseInt(limitParam ?? '30', 10) || 30));
    try {
        return jsonResponse(await listRecentPhotos(limit));
    } catch (error) {
        // POURQUOI : à distance, la lecture passe par GitHub et R2, qui peuvent échouer.
        return jsonResponse({ error: (error as Error).message ?? String(error) }, 502);
    }
};
