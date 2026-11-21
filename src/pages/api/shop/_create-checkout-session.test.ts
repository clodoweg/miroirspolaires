import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { createSession } = vi.hoisted(() => ({ createSession: vi.fn() }));

vi.mock('stripe', () => {
    class StripeError extends Error {
        requestId = 'req_test';
    }
    function Stripe() {
        return { checkout: { sessions: { create: createSession } } };
    }
    Stripe.errors = { StripeError };
    return { default: Stripe };
});

import { POST } from './create-checkout-session';
import { SHOP_CONFIG } from '../../../config/shop';

const VALID_RELAY = {
    id: '012345',
    name: 'Tabac de la Gare',
    address: '1 rue de la Gare',
    zipCode: '75001',
    city: 'PARIS',
    country: 'FR',
};

function callRoute(body: unknown) {
    const request = new Request('https://www.miroirspolaires.fr/api/shop/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: typeof body === 'string' ? body : JSON.stringify(body),
    });
    // POURQUOI : le handler n'utilise que `request` et `url` du contexte Astro.
    return POST({ request, url: new URL(request.url) } as Parameters<typeof POST>[0]);
}

describe('POST /api/shop/create-checkout-session', () => {
    beforeEach(() => {
        vi.stubEnv('ENABLE_BOUTIQUE', 'true');
        vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_dummy');
        createSession.mockReset();
        createSession.mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/test' });
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it('renvoie 403 quand la boutique est désactivée', async () => {
        vi.stubEnv('ENABLE_BOUTIQUE', 'false');
        const response = await callRoute({ carrierId: 'mondial_relay' });
        expect(response.status).toBe(403);
        expect(createSession).not.toHaveBeenCalled();
    });

    it("ne révèle pas le nom de la variable d'environnement si la clé Stripe manque", async () => {
        vi.stubEnv('STRIPE_SECRET_KEY', '');
        const response = await callRoute({ carrierId: 'mondial_relay' });
        expect(response.status).toBe(503);
        expect(JSON.stringify(await response.json())).not.toMatch(/STRIPE_SECRET_KEY|\.env/);
    });

    it('refuse un corps qui n’est pas du JSON', async () => {
        const response = await callRoute('pas du json');
        expect(response.status).toBe(400);
    });

    it('calcule le prix côté serveur et ignore un prix envoyé par le client', async () => {
        const response = await callRoute({
            carrierId: 'mondial_relay',
            relayPoint: VALID_RELAY,
            quantity: 2,
            price: 0.01,
        });
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ url: 'https://checkout.stripe.com/c/pay/test' });
        const params = createSession.mock.calls[0][0];
        expect(params.line_items[0].price_data.unit_amount).toBe(Math.round(SHOP_CONFIG.book.price * 100));
        expect(params.line_items[0].quantity).toBe(2);
    });

    it.each([[2.5], [0], [11], ['abc'], [-3]])('refuse la quantité %s', async (quantity) => {
        const response = await callRoute({ carrierId: 'mondial_relay', relayPoint: VALID_RELAY, quantity });
        expect(response.status).toBe(400);
        expect(createSession).not.toHaveBeenCalled();
    });

    it('refuse un transporteur inconnu sans le recopier dans la réponse', async () => {
        const response = await callRoute({ carrierId: '<script>x</script>' });
        expect(response.status).toBe(400);
        expect(JSON.stringify(await response.json())).not.toContain('<script>');
    });

    it('copie un point relais valide dans les métadonnées', async () => {
        const response = await callRoute({ carrierId: 'mondial_relay', relayPoint: VALID_RELAY });
        expect(response.status).toBe(200);
        const { metadata } = createSession.mock.calls[0][0];
        expect(metadata).toMatchObject({
            relay_id: '012345',
            relay_name: 'Tabac de la Gare',
            relay_zipcode: '75001',
            relay_city: 'PARIS',
            relay_country: 'FR',
        });
    });

    it.each([
        ['absent', undefined],
        ['nom trop long (> 500 caractères des métadonnées Stripe)', { ...VALID_RELAY, name: 'x'.repeat(600) }],
        ['adresse non textuelle', { ...VALID_RELAY, address: { evil: true } }],
        ['ville manquante', { ...VALID_RELAY, city: undefined }],
        ['code postal invalide', { ...VALID_RELAY, zipCode: '75001; DROP' }],
        ['pays invalide', { ...VALID_RELAY, country: 'FRANCE' }],
    ])('refuse un point relais %s', async (_label, relayPoint) => {
        const response = await callRoute({ carrierId: 'mondial_relay', relayPoint });
        expect(response.status).toBe(400);
        expect(createSession).not.toHaveBeenCalled();
    });

    it.each([
        ['absent', undefined],
        ['refusé', false],
        ['non booléen', 'true'],
    ])('refuse la remise en main propre si l’accord est %s', async (_label, priorAgreementConfirmed) => {
        const response = await callRoute({ carrierId: 'remise_main_propre', priorAgreementConfirmed });
        expect(response.status).toBe(400);
        expect(createSession).not.toHaveBeenCalled();
    });

    it('crée une remise en main propre gratuite, sans adresse ni délai, avec accord tracé', async () => {
        const response = await callRoute({ carrierId: 'remise_main_propre', priorAgreementConfirmed: true });
        expect(response.status).toBe(200);
        const params = createSession.mock.calls[0][0];
        const { shipping_rate_data: shippingRate } = params.shipping_options[0];
        expect(shippingRate.fixed_amount.amount).toBe(0);
        expect(shippingRate.delivery_estimate).toBeUndefined();
        expect(params.shipping_address_collection).toBeUndefined();
        expect(params.metadata.prior_agreement_confirmed).toBe('true');
    });

    it('n’impose pas la confirmation d’accord à Mondial Relay', async () => {
        const response = await callRoute({ carrierId: 'mondial_relay', relayPoint: VALID_RELAY });
        expect(response.status).toBe(200);
        const params = createSession.mock.calls[0][0];
        expect(params.metadata.prior_agreement_confirmed).toBeUndefined();
        expect(params.shipping_options[0].shipping_rate_data.fixed_amount.amount).toBe(1);
        expect(params.shipping_options[0].shipping_rate_data.delivery_estimate).toBeDefined();
    });

    it('renvoie un message générique quand Stripe échoue', async () => {
        createSession.mockRejectedValue(new Error('No such price: secret account detail'));
        const response = await callRoute({ carrierId: 'mondial_relay', relayPoint: VALID_RELAY });
        expect(response.status).toBe(502);
        expect(JSON.stringify(await response.json())).not.toContain('secret account detail');
    });
});
