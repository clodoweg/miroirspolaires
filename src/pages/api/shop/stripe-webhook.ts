/**
 * @file src/pages/api/shop/stripe-webhook.ts
 * @description Webhook Stripe de la boutique : marque `used` le code de remise en main propre d'une
 * commande terminée, pour que `/admin/boutique` l'affiche comme commandé.
 *
 * POURQUOI facultatif : `create-checkout-session.ts` refuse déjà un code dont la session est payée. Le
 * webhook tient seulement le tableau de bord à jour sans attendre une nouvelle tentative.
 *
 * OPTIONS ET EXEMPLES :
 * - Stripe › Développeurs › Webhooks › Ajouter un endpoint :
 *   URL `https://www.miroirspolaires.fr/api/shop/stripe-webhook`, événement `checkout.session.completed`.
 *   Recopier le secret de signature (`whsec_…`) dans la variable Vercel `STRIPE_WEBHOOK_SECRET`.
 * - En local : `stripe listen --forward-to localhost:4321/api/shop/stripe-webhook` (secret affiché par la CLI).
 *
 * WARNING: sécurité. Route publique : seul un événement dont la signature est valide est pris en compte.
 */

import type { APIRoute } from 'astro';
import Stripe from 'stripe';
import { errorResponse, jsonResponse } from '../../../lib/api/http';
import { markPickupCodeUsed } from '../../../lib/shop/pickup-codes';

export const prerender = false;

function readEnv(name: string): string | undefined {
    return import.meta.env[name] || process.env[name] || undefined;
}

export const POST: APIRoute = async ({ request }) => {
    const secretKey = readEnv('STRIPE_SECRET_KEY');
    const webhookSecret = readEnv('STRIPE_WEBHOOK_SECRET');
    if (!secretKey || !webhookSecret) {
        console.error('[api] stripe-webhook: configuration Stripe incomplète');
        return errorResponse(503, 'Webhook non configuré.');
    }
    const signature = request.headers.get('stripe-signature');
    if (!signature) return errorResponse(400, 'Signature manquante.');

    const stripe = new Stripe(secretKey);
    let event: Stripe.Event;
    try {
        // POURQUOI le corps brut : la signature porte sur les octets reçus, pas sur un JSON reparsé.
        event = await stripe.webhooks.constructEventAsync(await request.text(), signature, webhookSecret);
    } catch (error) {
        console.warn('[api] stripe-webhook: signature refusée', error);
        return errorResponse(400, 'Signature invalide.');
    }

    if (event.type !== 'checkout.session.completed') {
        return jsonResponse({ received: true });
    }
    const session = event.data.object;
    const pickupRequestId = session.metadata?.pickup_request_id;
    if (!pickupRequestId) return jsonResponse({ received: true });

    try {
        await markPickupCodeUsed(pickupRequestId, session.id, new Date());
        return jsonResponse({ received: true });
    } catch (error) {
        // POURQUOI 500 : Stripe renvoie l'événement plus tard, Turso aura peut-être répondu.
        console.error('[api] stripe-webhook: mise à jour du code impossible', error);
        return errorResponse(500, 'Erreur interne du serveur');
    }
};
