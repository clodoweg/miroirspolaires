/**
 * @file src/pages/api/shop/create-checkout-session.ts
 * @description Point de terminaison API pour l'initialisation d'une session Stripe Checkout.
 * Vérifie côté serveur la validité du panier, recalcule les frais de port
 * et configure les métadonnées de livraison (Mondial Relay ou remise en main propre).
 *
 * POURQUOI :
 * La création de session Stripe s'effectue obligatoirement côté serveur avec la clé secrète
 * pour garantir que le montant total et les frais d'expédition ne peuvent être falsifiés
 * par le client.
 *
 * OPTIONS ET EXEMPLES :
 * - `POST /api/shop/create-checkout-session`
 *   Body JSON : `{ carrierId: "mondial_relay", quantity: 1, relayPoint: { ... } }`
 *   ou `{ carrierId: "remise_main_propre", quantity: 1, pickupCode: "MP-7K4Q-X9RT" }`
 *   Réponse JSON : `{ url: "https://checkout.stripe.com/c/pay/..." }`
 *
 * REMISE EN MAIN PROPRE : le code, délivré par l'auteur depuis `/admin/boutique`, est vérifié dans Turso
 * (`findUsablePickupCode`). La session Checkout impose l'e-mail de la demande. Une session précédente
 * encore ouverte pour ce code est expirée, une session déjà payée le rend inutilisable : le code ne sert
 * qu'à une commande, même sans webhook Stripe (`stripe-webhook.ts` le marque `used` en plus).
 */

import type { APIRoute } from 'astro';
import Stripe from 'stripe';
import { SHOP_CONFIG, getActiveCarrier, isBoutiqueEnabled } from '../../../config/shop';
import { errorResponse, jsonResponse } from '../../../lib/api/http';
import {
    MAX_QUANTITY,
    parseQuantity,
    validateRelayPoint,
    type ValidatedRelayPoint,
} from '../../../lib/shop/checkout-validation';
import {
    attachCheckoutSession,
    findUsablePickupCode,
    markPickupCodeUsed,
    normalizePickupCode,
    resolvePickupDatabase,
    type PickupRequest,
} from '../../../lib/shop/pickup-codes';

export const prerender = false;

export const POST: APIRoute = async ({ request, url }) => {
    // POURQUOI : Blocage de toute tentative de paiement si la boutique est désactivée par variable d'environnement
    if (!isBoutiqueEnabled()) {
        return errorResponse(403, 'La boutique est actuellement désactivée.');
    }

    const stripeSecretKey = import.meta.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
        console.error('[api] create-checkout-session: STRIPE_SECRET_KEY absente');
        return errorResponse(503, 'Le paiement est momentanément indisponible.');
    }

    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
        return errorResponse(400, 'Corps de requête JSON manquant ou invalide.');
    }
    const { carrierId, quantity, relayPoint, pickupCode } = body as Record<string, unknown>;

    const safeQuantity = parseQuantity(quantity);
    if (safeQuantity === null) {
        return errorResponse(400, `La quantité doit être un entier entre 1 et ${MAX_QUANTITY}.`);
    }

    const carrier = typeof carrierId === 'string' ? getActiveCarrier(carrierId) : undefined;
    if (!carrier) {
        return errorResponse(400, 'Le transporteur choisi est indisponible ou désactivé.');
    }

    let validatedRelay: ValidatedRelayPoint | null = null;
    if (carrier.type === 'relay') {
        validatedRelay = validateRelayPoint(relayPoint);
        if (!validatedRelay) {
            return errorResponse(400, 'Les informations du point relais Mondial Relay sont incomplètes ou invalides.');
        }
    }

    const stripe = new Stripe(stripeSecretKey);

    let pickupRequest: PickupRequest | null = null;
    if (carrier.requiresPriorAgreement) {
        const code = normalizePickupCode(pickupCode);
        if (!code) {
            return errorResponse(400, "Ce mode de livraison nécessite le code remis par l'auteur.");
        }
        if (!(await resolvePickupDatabase())) {
            console.error('[api] create-checkout-session: Turso indisponible pour vérifier un code');
            return errorResponse(503, 'La remise en main propre est momentanément indisponible.');
        }
        try {
            pickupRequest = await findUsablePickupCode(code, new Date());
            if (pickupRequest && !(await releasePreviousSession(stripe, pickupRequest))) {
                pickupRequest = null;
            }
        } catch (error) {
            console.error('[api] create-checkout-session: vérification du code impossible', error);
            return errorResponse(503, 'La remise en main propre est momentanément indisponible.');
        }
        if (!pickupRequest) {
            return errorResponse(400, 'Ce code est invalide, expiré ou a déjà servi.');
        }
    }

    const book = SHOP_CONFIG.book;

    // Métadonnées exhaustives pour la commande
    const metadata: Record<string, string> = {
        product_id: book.id,
        product_title: book.title,
        carrier_id: carrier.id,
        carrier_name: carrier.name,
        carrier_type: carrier.type,
        quantity: String(safeQuantity),
    };

    if (pickupRequest) {
        metadata.pickup_request_id = pickupRequest.id;
        metadata.pickup_code = pickupRequest.code ?? '';
    }

    if (validatedRelay) {
        metadata.relay_id = validatedRelay.id;
        metadata.relay_name = validatedRelay.name;
        metadata.relay_address = validatedRelay.address;
        metadata.relay_zipcode = validatedRelay.zipCode;
        metadata.relay_city = validatedRelay.city;
        metadata.relay_country = validatedRelay.country;
    }

    // Construction de l'URL absolue du site pour les redirections
    const origin = url.origin;

    // Configuration des paramètres de la session Stripe Checkout
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
        mode: 'payment',
        locale: 'fr',
        line_items: [
            {
                price_data: {
                    currency: 'eur',
                    product_data: {
                        name: book.title,
                        description: book.subtitle,
                    },
                    unit_amount: Math.round(book.price * 100), // En centimes d'euros
                },
                quantity: safeQuantity,
            },
        ],
        shipping_options: [
            {
                shipping_rate_data: {
                    type: 'fixed_amount',
                    fixed_amount: {
                        amount: Math.round(carrier.price * 100),
                        currency: 'eur',
                    },
                    display_name: carrier.name,
                    // POURQUOI : la date d'une remise en main propre se convient avec l'acheteur, sans délai à annoncer.
                    ...(carrier.type === 'relay' && {
                        delivery_estimate: {
                            minimum: { unit: 'business_day', value: 3 },
                            maximum: { unit: 'business_day', value: 5 },
                        },
                    }),
                },
            },
        ],
        // Collecte du téléphone pour le SMS relais ou pour convenir de la remise en main propre
        phone_number_collection: {
            enabled: true,
        },
        metadata,
        // POURQUOI : l'accord porte sur une personne ; Checkout reprend l'e-mail de la demande.
        ...(pickupRequest && { customer_email: pickupRequest.email, client_reference_id: pickupRequest.id }),
        success_url: `${origin}/boutique/confirmation?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/boutique`,
    };

    try {
        const session = await stripe.checkout.sessions.create(sessionParams);
        if (pickupRequest) await attachCheckoutSession(pickupRequest.id, session.id);
        return jsonResponse({ url: session.url });
    } catch (error) {
        // WARNING: le message Stripe peut décrire la configuration du compte : il reste dans les logs.
        const requestId = error instanceof Stripe.errors.StripeError ? error.requestId : undefined;
        console.error('[api] create-checkout-session: échec Stripe', { requestId }, error);
        return errorResponse(502, 'Impossible de créer la session de paiement. Réessayez dans quelques instants.');
    }
};

/**
 * Neutralise la session Checkout déjà rattachée au code, s'il y en a une.
 *
 * WARNING: sans cela, deux onglets ouverts avec le même code pourraient être payés tous les deux.
 *
 * @param stripe - Client Stripe.
 * @param request - Demande acceptée.
 * @returns `false` si la session précédente est déjà payée (code consommé), `true` sinon.
 */
async function releasePreviousSession(stripe: Stripe, request: PickupRequest): Promise<boolean> {
    if (!request.stripeSessionId) return true;
    const previous = await stripe.checkout.sessions.retrieve(request.stripeSessionId);
    if (previous.status === 'complete') {
        await markPickupCodeUsed(request.id, previous.id, new Date());
        return false;
    }
    if (previous.status === 'open') {
        await stripe.checkout.sessions.expire(previous.id);
    }
    return true;
}
