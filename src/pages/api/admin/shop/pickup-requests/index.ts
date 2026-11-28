/**
 * GET /api/admin/shop/pickup-requests : demandes de remise en main propre (Turso), les plus récentes d'abord,
 * et l'état de la configuration des e-mails.
 *
 * Admin local et distant (même base Turso que la production).
 */
import type { APIRoute } from 'astro';
import { jsonResponse, requireAdmin } from '@/lib/admin/shared';
import { listPickupRequests, resolvePickupDatabase } from '@/lib/shop/pickup-codes';

export const prerender = false;

function isSet(name: string): boolean {
    return Boolean(process.env[name] || import.meta.env[name]);
}

export const GET: APIRoute = async ({ locals }) => {
    const blocked = requireAdmin(locals);
    if (blocked) return blocked;
    if (!(await resolvePickupDatabase())) {
        return jsonResponse({ error: 'Turso n’est pas configuré sur ce déploiement.' }, 503);
    }
    try {
        return jsonResponse({
            requests: await listPickupRequests(200),
            email: {
                apiKey: isSet('RESEND_API_KEY'),
                notifyAddress: isSet('SHOP_NOTIFY_EMAIL'),
                sender: isSet('SHOP_EMAIL_FROM'),
                webhook: isSet('STRIPE_WEBHOOK_SECRET'),
            },
        });
    } catch (error) {
        console.error('[admin] pickup-requests: lecture impossible', error);
        return jsonResponse({ error: 'Lecture des demandes impossible (Turso).' }, 500);
    }
};
