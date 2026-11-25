/**
 * GET /api/admin/r2/inventory : contenu du bucket R2 par grand dossier et fichiers orphelins.
 *
 * Lecture seule ; références lues par `getContentReader()` (disque en local, branche dev à distance).
 */
import type { APIRoute } from 'astro';
import { loadR2Inventory } from '@/lib/admin/r2-inventory';
import { getContentReader } from '@/lib/admin/stores/content-reader';
import { jsonResponse, requireAdmin } from '@/lib/admin/shared';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
    const blocked = requireAdmin(locals);
    if (blocked) return blocked;
    try {
        return jsonResponse(await loadR2Inventory(getContentReader()), 200, { 'Cache-Control': 'no-store' });
    } catch (error) {
        return jsonResponse({ error: (error as Error).message ?? String(error) }, 502);
    }
};
