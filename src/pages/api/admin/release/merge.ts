/**
 * POST /api/admin/release/merge : fusionne la PR de mise en production (corps `{ pullNumber, headSha }`).
 *
 * WARNING: déploie le site public. La fusion n'a lieu que si la CI de la PR est verte et que sa tête est
 * celle affichée à l'administrateur (`mergeReleasePullRequest`).
 */
import type { APIRoute } from 'astro';
import { getAdminAccessMode } from '@/lib/admin/auth/config';
import { mergeReleasePullRequest, toReleaseErrorResponse } from '@/lib/admin/github/release';
import { requireAdmin, jsonResponse } from '@/lib/admin/shared';
import { getRemoteGitHubClient } from '@/lib/admin/stores/content-reader';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
    const blocked = requireAdmin(locals);
    if (blocked) return blocked;
    if (getAdminAccessMode() !== 'remote') {
        return jsonResponse({ error: 'La mise en production se fait depuis l’admin distant (Preview de dev).' }, 501);
    }
    const body = (await request.json().catch(() => null)) as { pullNumber?: unknown; headSha?: unknown } | null;
    const pullNumber = Number(body?.pullNumber);
    const headSha = typeof body?.headSha === 'string' ? body.headSha : '';
    if (!Number.isSafeInteger(pullNumber) || pullNumber <= 0 || !/^[0-9a-f]{40}$/.test(headSha)) {
        return jsonResponse({ error: 'pullNumber et headSha requis' }, 400);
    }
    try {
        return jsonResponse({
            ok: true,
            ...(await mergeReleasePullRequest(getRemoteGitHubClient(), pullNumber, headSha)),
        });
    } catch (error) {
        return toReleaseErrorResponse(error);
    }
};
