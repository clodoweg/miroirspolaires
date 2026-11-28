/**
 * POST /api/admin/shop/pickup-requests/:id : décision sur une demande de remise en main propre.
 * Body JSON `{ action }` :
 * - `approve` : tire un code (valable `PICKUP_CODE_VALIDITY_DAYS` jours) et l'envoie à l'acheteur ;
 * - `reject` : refuse une demande en attente ; `revoke` : annule un code accepté et pas encore utilisé ;
 * - `resend` : renvoie le code d'une demande acceptée.
 *
 * Réponse : `{ request, emailSent }`. 409 si le statut de la demande ne permet pas l'action.
 *
 * WARNING: un code accepté ouvre aussitôt la remise en main propre gratuite sur le site public.
 */
import type { APIRoute } from 'astro';
import { jsonResponse, requireAdmin } from '@/lib/admin/shared';
import {
    approvePickupRequest,
    closePickupRequest,
    getPickupRequest,
    resolvePickupDatabase,
} from '@/lib/shop/pickup-codes';
import { sendPickupCodeToBuyer } from '@/lib/shop/pickup-mailer';

export const prerender = false;

const ACTIONS = ['approve', 'reject', 'revoke', 'resend'] as const;
type PickupAction = (typeof ACTIONS)[number];
const ID_PATTERN = /^[0-9a-f-]{36}$/;
const FALLBACK_SITE_URL = 'https://www.miroirspolaires.fr';

export const POST: APIRoute = async ({ locals, params, request }) => {
    const blocked = requireAdmin(locals);
    if (blocked) return blocked;

    const id = params.id ?? '';
    if (!ID_PATTERN.test(id)) return jsonResponse({ error: 'Identifiant invalide.' }, 400);
    const body = (await request.json().catch(() => null)) as { action?: unknown } | null;
    const action = body?.action;
    if (typeof action !== 'string' || !ACTIONS.includes(action as PickupAction)) {
        return jsonResponse({ error: 'Action inconnue.' }, 400);
    }
    if (!(await resolvePickupDatabase())) {
        return jsonResponse({ error: 'Turso n’est pas configuré sur ce déploiement.' }, 503);
    }

    try {
        const now = new Date();
        const current = await getPickupRequest(id);
        if (!current) return jsonResponse({ error: 'Demande introuvable.' }, 404);

        let updated = current;
        if (action === 'approve') {
            updated = (await approvePickupRequest(id, now)) ?? current;
            if (updated === current) return jsonResponse({ error: 'Cette demande n’est plus en attente.' }, 409);
        } else if (action === 'reject' || action === 'revoke') {
            const expected = action === 'reject' ? 'pending' : 'approved';
            if (current.status !== expected) {
                return jsonResponse({ error: 'Le statut de la demande ne permet pas cette action.' }, 409);
            }
            updated = (await closePickupRequest(id, now)) ?? current;
        } else if (current.status !== 'approved') {
            return jsonResponse({ error: 'Seul un code accepté peut être renvoyé.' }, 409);
        }

        // POURQUOI l'URL publique : l'admin tourne sur la Preview de `dev`, l'acheteur doit commander en production.
        const siteUrl = import.meta.env.SITE || FALLBACK_SITE_URL;
        const emailSent = updated.status === 'approved' ? await sendPickupCodeToBuyer(updated, siteUrl) : false;
        return jsonResponse({ request: updated, emailSent });
    } catch (error) {
        console.error('[admin] pickup-requests: décision impossible', error);
        return jsonResponse({ error: 'Enregistrement impossible (Turso).' }, 500);
    }
};
