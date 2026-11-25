/**
 * GET /api/admin/todo : liste « À faire » du tableau de bord (`collectAdminTodos`), en local comme à distance.
 *
 * L'état de mise en production n'est lu que sur l'admin distant (API GitHub).
 */
import type { APIRoute } from 'astro';
import { collectAdminTodos } from '@/lib/admin/admin-todo';
import { getAdminAccessMode, getRemoteAdminConfig } from '@/lib/admin/auth/config';
import { getReleaseStatus } from '@/lib/admin/github/release';
import { getContentReader, getRemoteGitHubClient } from '@/lib/admin/stores/content-reader';
import { jsonResponse, requireAdmin } from '@/lib/admin/shared';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
    const blocked = requireAdmin(locals);
    if (blocked) return blocked;
    const isRemote = getAdminAccessMode() === 'remote';
    const report = await collectAdminTodos(getContentReader(), {
        release: isRemote
            ? () => {
                  const { contentBranch, productionBranch } = getRemoteAdminConfig();
                  return getReleaseStatus(getRemoteGitHubClient(), { contentBranch, productionBranch });
              }
            : undefined,
    });
    return jsonResponse(report, 200, { 'Cache-Control': 'no-store' });
};
