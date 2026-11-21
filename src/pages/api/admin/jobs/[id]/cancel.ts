/**
 * POST /api/admin/jobs/[id]/cancel : annule un job (run GitHub Actions annulé s'il a démarré).
 */
import type { APIRoute } from 'astro';
import { getAdminAccessMode } from '@/lib/admin/auth/config';
import { cancelRemoteJob, toJobErrorResponse } from '@/lib/admin/jobs';
import { requireAdmin, jsonResponse } from '@/lib/admin/shared';
import { getRemoteGitHubClient } from '@/lib/admin/stores/content-reader';

export const prerender = false;

export const POST: APIRoute = async ({ params, locals }) => {
    const blocked = requireAdmin(locals);
    if (blocked) return blocked;
    if (getAdminAccessMode() !== 'remote') return jsonResponse({ error: 'Admin distant uniquement.' }, 501);
    const id = String(params.id ?? '');
    if (!/^[0-9a-f-]{36}$/.test(id)) return jsonResponse({ error: 'Identifiant invalide' }, 400);
    try {
        return jsonResponse(await cancelRemoteJob(id, getRemoteGitHubClient()));
    } catch (error) {
        return toJobErrorResponse(error);
    }
};
