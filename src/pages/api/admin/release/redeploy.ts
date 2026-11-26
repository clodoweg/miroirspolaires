/**
 * GET /api/admin/release/redeploy : indique si le redéploiement de la production est configuré.
 * POST /api/admin/release/redeploy : redéploie la production (deploy hook Vercel), sans changement de code.
 *
 * Admin distant uniquement. WARNING: déclenche un build du site public ; l'URL du hook ne sort jamais du serveur.
 */
import type { APIRoute } from 'astro';
import { getAdminAccessMode } from '@/lib/admin/auth/config';
import {
    isRedeployConfigured,
    RedeployNotConfiguredError,
    triggerProductionRedeploy,
} from '@/lib/admin/production-redeploy';
import { jsonResponse, requireAdmin } from '@/lib/admin/shared';

export const prerender = false;

const LOCAL_ONLY = { error: 'Le redéploiement se lance depuis l’admin distant (Preview de dev).' };

export const GET: APIRoute = async ({ locals }) => {
    const blocked = requireAdmin(locals);
    if (blocked) return blocked;
    if (getAdminAccessMode() !== 'remote') return jsonResponse(LOCAL_ONLY, 501);
    return jsonResponse({ configured: isRedeployConfigured() });
};

export const POST: APIRoute = async ({ locals }) => {
    const blocked = requireAdmin(locals);
    if (blocked) return blocked;
    if (getAdminAccessMode() !== 'remote') return jsonResponse(LOCAL_ONLY, 501);
    try {
        return jsonResponse({ ok: true, ...(await triggerProductionRedeploy()) });
    } catch (error) {
        if (error instanceof RedeployNotConfiguredError) return jsonResponse({ error: error.message }, 503);
        return jsonResponse({ error: (error as Error).message ?? String(error) }, 502);
    }
};
