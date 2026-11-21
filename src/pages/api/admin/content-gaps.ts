/**
 * Textes manquants d'un domaine (`?scope=blog|voyages`), signalés par `ContentUpdatePanel.tsx`.
 */
import type { APIRoute } from 'astro';
import { getContentGaps } from '@/lib/admin/content-gaps.mjs';
import { requireAdmin, jsonResponse } from '@/lib/admin/shared';

export const prerender = false;

export const GET: APIRoute = async ({ url, locals }) => {
    const blocked = requireAdmin(locals);
    if (blocked) return blocked;
    const scope = url.searchParams.get('scope');
    if (scope !== 'blog' && scope !== 'voyages') return new Response('Invalid scope', { status: 400 });
    return jsonResponse(getContentGaps(scope, process.cwd()));
};
