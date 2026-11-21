/**
 * GET /api/admin/jobs : scripts lançables à distance et derniers jobs.
 * POST /api/admin/jobs : lance un script dans GitHub Actions (corps `{ scriptId }`).
 *
 * Admin distant uniquement : en local, les scripts passent par `/api/admin/scripts/run` (spawn).
 */
import type { APIRoute } from 'astro';
import { getAdminAccessMode, getRemoteAdminConfig } from '@/lib/admin/auth/config';
import { getJobDatabase, startRemoteJob, toJobErrorResponse } from '@/lib/admin/jobs';
import { listJobs } from '@/lib/admin/job-store.mjs';
import { listRemoteScripts } from '@/lib/admin/scripts';
import { requireAdmin, jsonResponse } from '@/lib/admin/shared';
import { getRemoteGitHubClient } from '@/lib/admin/stores/content-reader';

export const prerender = false;

const LOCAL_ONLY = { error: 'Les jobs GitHub Actions se lancent depuis l’admin distant (Preview de dev).' };

export const GET: APIRoute = async ({ locals }) => {
    const blocked = requireAdmin(locals);
    if (blocked) return blocked;
    if (getAdminAccessMode() !== 'remote') return jsonResponse(LOCAL_ONLY, 501);
    const scripts = listRemoteScripts().map(({ id, label, description, category, writes }) => ({
        id,
        label,
        description,
        category,
        writes,
    }));
    const database = await getJobDatabase();
    if (!database) return jsonResponse({ scripts, jobs: [], error: 'Turso n’est pas configuré sur ce déploiement.' });
    return jsonResponse({ scripts, jobs: await listJobs(database, 30) });
};

export const POST: APIRoute = async ({ request, locals }) => {
    const blocked = requireAdmin(locals);
    if (blocked) return blocked;
    if (getAdminAccessMode() !== 'remote') return jsonResponse(LOCAL_ONLY, 501);
    const body = (await request.json().catch(() => null)) as { scriptId?: unknown } | null;
    if (typeof body?.scriptId !== 'string') return jsonResponse({ error: 'scriptId requis' }, 400);
    const actor = locals.adminAccess?.mode === 'remote' ? locals.adminAccess.session.login : 'admin';
    try {
        const job = await startRemoteJob({
            scriptId: body.scriptId,
            actor,
            client: getRemoteGitHubClient(),
            contentBranch: getRemoteAdminConfig().contentBranch,
        });
        return jsonResponse(job, 201);
    } catch (error) {
        return toJobErrorResponse(error);
    }
};
