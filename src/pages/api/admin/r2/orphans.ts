/**
 * POST /api/admin/r2/orphans : supprime de R2 des fichiers orphelins (corps `{ keys: string[] }`).
 *
 * WARNING: destructif, sur le bucket de production. `deleteR2Orphans` recalcule les orphelins et refuse toute clé
 * qui n'en est pas un ; l'interface demande une confirmation.
 */
import type { APIRoute } from 'astro';
import { deleteR2Orphans, R2OrphanRequestError } from '@/lib/admin/r2-inventory';
import { getContentReader } from '@/lib/admin/stores/content-reader';
import { jsonResponse, requireAdmin } from '@/lib/admin/shared';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
    const blocked = requireAdmin(locals);
    if (blocked) return blocked;
    const body = (await request.json().catch(() => null)) as { keys?: unknown } | null;
    try {
        const deleted = await deleteR2Orphans(body?.keys, getContentReader());
        return jsonResponse({ deleted });
    } catch (error) {
        if (error instanceof R2OrphanRequestError) return jsonResponse({ error: error.message }, 400);
        return jsonResponse({ error: (error as Error).message ?? String(error) }, 502);
    }
};
