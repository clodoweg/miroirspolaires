/**
 * GET /api/auth/github/callback : retour de GitHub, ouverture de la session admin (voir `login-flow.ts`).
 */
import type { APIRoute } from 'astro';
import { getAdminAccessMode, readRemoteAdminConfig } from '@/lib/admin/auth/config';
import { completeLogin } from '@/lib/admin/auth/login-flow';

export const prerender = false;

export const GET: APIRoute = ({ request, url }) => {
    const mode = getAdminAccessMode();
    return completeLogin(
        request,
        url,
        mode,
        mode === 'remote' ? readRemoteAdminConfig(process.env) : null,
        Math.floor(Date.now() / 1000),
    );
};
