/**
 * GET /api/auth/github/login : début du login GitHub de l'admin distant (voir `login-flow.ts`).
 */
import type { APIRoute } from 'astro';
import { getAdminAccessMode, readRemoteAdminConfig } from '@/lib/admin/auth/config';
import { startLogin } from '@/lib/admin/auth/login-flow';

export const prerender = false;

export const GET: APIRoute = ({ url }) => {
    const mode = getAdminAccessMode();
    return startLogin(
        url,
        mode,
        mode === 'remote' ? readRemoteAdminConfig(process.env) : null,
        Math.floor(Date.now() / 1000),
    );
};
