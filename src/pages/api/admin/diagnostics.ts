/**
 * GET /api/admin/diagnostics : vérifie l'accès de l'admin distant au dépôt GitHub (jeton d'installation,
 * dépôt, branche, lecture du contenu) et indique quoi corriger. En local, signale simplement le mode.
 */
import type { APIRoute } from 'astro';
import { getAdminAccessMode, getRemoteAdminConfig } from '@/lib/admin/auth/config';
import { diagnoseRemoteAccess } from '@/lib/admin/github/diagnostics';
import { requireAdmin, jsonResponse } from '@/lib/admin/shared';
import { getRemoteGitHubClient } from '@/lib/admin/stores/content-reader';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
    const blocked = requireAdmin(locals);
    if (blocked) return blocked;
    if (getAdminAccessMode() !== 'remote') return jsonResponse({ mode: 'local', ok: true, steps: [] });
    const diagnostic = await diagnoseRemoteAccess(getRemoteGitHubClient(), getRemoteAdminConfig());
    return jsonResponse({ mode: 'remote', ...diagnostic }, diagnostic.ok ? 200 : 503);
};
