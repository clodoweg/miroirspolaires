/**
 * Textes manquants d'un domaine (`?scope=blog|voyages`), affichés par `/admin/blog/images` et `/admin/voyages/images`.
 *
 * Lecture seule par `getContentReader()` : disque en local, branche dev à distance.
 */
import type { APIRoute } from 'astro';
import { getContentGapsWith } from '@/lib/admin/content-gaps-reader';
import { getContentReader } from '@/lib/admin/stores/content-reader';
import { requireAdmin, jsonResponse } from '@/lib/admin/shared';

export const prerender = false;

export const GET: APIRoute = async ({ url, locals }) => {
    const blocked = requireAdmin(locals);
    if (blocked) return blocked;
    const scope = url.searchParams.get('scope');
    if (scope !== 'blog' && scope !== 'voyages') return new Response('Invalid scope', { status: 400 });
    try {
        return jsonResponse(await getContentGapsWith(getContentReader(), scope));
    } catch (error) {
        return jsonResponse({ error: (error as Error).message ?? String(error) }, 502);
    }
};
