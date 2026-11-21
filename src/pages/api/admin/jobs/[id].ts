/**
 * GET /api/admin/jobs/[id]?after=<n> : état d'un job et lignes de journal postérieures au curseur.
 */
import type { APIRoute } from 'astro';
import { getAdminAccessMode } from '@/lib/admin/auth/config';
import { readRemoteJob, toJobErrorResponse } from '@/lib/admin/jobs';
import { requireAdmin, jsonResponse } from '@/lib/admin/shared';

export const prerender = false;

const JOB_ID_RE = /^[0-9a-f-]{36}$/;

export const GET: APIRoute = async ({ params, url, locals }) => {
    const blocked = requireAdmin(locals);
    if (blocked) return blocked;
    if (getAdminAccessMode() !== 'remote') return jsonResponse({ error: 'Admin distant uniquement.' }, 501);
    const id = String(params.id ?? '');
    if (!JOB_ID_RE.test(id)) return jsonResponse({ error: 'Identifiant invalide' }, 400);
    const after = Number.parseInt(url.searchParams.get('after') ?? '0', 10);
    try {
        return jsonResponse(await readRemoteJob(id, Number.isSafeInteger(after) && after > 0 ? after : 0));
    } catch (error) {
        return toJobErrorResponse(error);
    }
};
