/**
 * GET /api/admin/release : état de la mise en production (commits de `dev` absents de `main`, PR ouverte, CI).
 * POST /api/admin/release : ouvre la PR `dev` → `main` (ou renvoie celle qui est ouverte).
 *
 * Admin distant uniquement : en local, il n'y a pas de GitHub App configurée.
 */
import type { APIRoute } from 'astro';
import { getAdminAccessMode, getRemoteAdminConfig } from '@/lib/admin/auth/config';
import { getReleaseStatus, openReleasePullRequest, toReleaseErrorResponse } from '@/lib/admin/github/release';
import { requireAdmin, jsonResponse } from '@/lib/admin/shared';
import { getRemoteGitHubClient } from '@/lib/admin/stores/content-reader';

export const prerender = false;

const LOCAL_ONLY = { error: 'La mise en production se fait depuis l’admin distant (Preview de dev).' };

function branches() {
    const { contentBranch, productionBranch } = getRemoteAdminConfig();
    return { contentBranch, productionBranch };
}

export const GET: APIRoute = async ({ locals }) => {
    const blocked = requireAdmin(locals);
    if (blocked) return blocked;
    if (getAdminAccessMode() !== 'remote') return jsonResponse(LOCAL_ONLY, 501);
    try {
        return jsonResponse(await getReleaseStatus(getRemoteGitHubClient(), branches()));
    } catch (error) {
        return toReleaseErrorResponse(error);
    }
};

export const POST: APIRoute = async ({ locals }) => {
    const blocked = requireAdmin(locals);
    if (blocked) return blocked;
    if (getAdminAccessMode() !== 'remote') return jsonResponse(LOCAL_ONLY, 501);
    const login = locals.adminAccess?.mode === 'remote' ? locals.adminAccess.session.login : 'admin';
    try {
        return jsonResponse(await openReleasePullRequest(getRemoteGitHubClient(), branches(), login));
    } catch (error) {
        return toReleaseErrorResponse(error);
    }
};
