import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { createSession, retrieveSession, expireSession, pickup } = vi.hoisted(() => ({
    createSession: vi.fn(),
    retrieveSession: vi.fn(),
    expireSession: vi.fn(),
    pickup: {
        resolvePickupDatabase: vi.fn(),
        findUsablePickupCode: vi.fn(),
        attachCheckoutSession: vi.fn(),
        markPickupCodeUsed: vi.fn(),
    },
}));

vi.mock('../../../lib/shop/pickup-codes', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../../lib/shop/pickup-codes')>()),
    ...pickup,
}));

vi.mock('stripe', () => {
    class StripeError extends Error {
        requestId = 'req_test';
    }
    function Stripe() {
        return { checkout: { sessions: { create: createSession, retrieve: retrieveSession, expire: expireSession } } };
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

const APPROVED = {
    id: '00000000-0000-4000-8000-000000000001',
    createdAt: '2026-11-28T10:00:00.000Z',
    name: 'Camille',
    email: 'camille@example.org',
    place: 'Lyon',
    message: '',
    status: 'approved',
    code: 'MP-7K4Q-X9RT',
    decidedAt: '2026-11-28T11:00:00.000Z',
    expiresAt: '2026-12-28T11:00:00.000Z',
    stripeSessionId: null as string | null,
    usedAt: null,
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
        createSession.mockResolvedValue({ id: 'cs_test_new', url: 'https://checkout.stripe.com/c/pay/test' });
        retrieveSession.mockReset();
        expireSession.mockReset();
        Object.values(pickup).forEach((mock) => mock.mockReset());
        pickup.resolvePickupDatabase.mockResolvedValue({});
        pickup.findUsablePickupCode.mockResolvedValue(APPROVED);
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
        ['mal formé', 'pas-un-code'],
        ['non textuel', true],
    ])('refuse la remise en main propre si le code est %s', async (_label, pickupCode) => {
        const response = await callRoute({ carrierId: 'remise_main_propre', pickupCode });
        expect(response.status).toBe(400);
        expect(pickup.findUsablePickupCode).not.toHaveBeenCalled();
        expect(createSession).not.toHaveBeenCalled();
    });

    it('refuse un code inconnu, expiré ou révoqué', async () => {
        pickup.findUsablePickupCode.mockResolvedValue(null);
        const response = await callRoute({ carrierId: 'remise_main_propre', pickupCode: 'mp-7k4q-x9rt' });
        expect(response.status).toBe(400);
        expect(pickup.findUsablePickupCode.mock.calls[0][0]).toBe('MP-7K4Q-X9RT');
        expect(createSession).not.toHaveBeenCalled();
    });

    it('crée une remise en main propre gratuite, liée à l’e-mail de la demande', async () => {
        const response = await callRoute({ carrierId: 'remise_main_propre', pickupCode: 'MP-7K4Q-X9RT' });
        expect(response.status).toBe(200);
        const params = createSession.mock.calls[0][0];
        const { shipping_rate_data: shippingRate } = params.shipping_options[0];
        expect(shippingRate.fixed_amount.amount).toBe(0);
        expect(shippingRate.delivery_estimate).toBeUndefined();
        expect(params.shipping_address_collection).toBeUndefined();
        expect(params.customer_email).toBe('camille@example.org');
        expect(params.metadata).toMatchObject({ pickup_request_id: APPROVED.id, pickup_code: 'MP-7K4Q-X9RT' });
        expect(pickup.attachCheckoutSession).toHaveBeenCalledWith(APPROVED.id, 'cs_test_new');
    });

    it('expire la session précédente encore ouverte avant d’en créer une autre', async () => {
        pickup.findUsablePickupCode.mockResolvedValue({ ...APPROVED, stripeSessionId: 'cs_test_old' });
        retrieveSession.mockResolvedValue({ id: 'cs_test_old', status: 'open' });
        const response = await callRoute({ carrierId: 'remise_main_propre', pickupCode: 'MP-7K4Q-X9RT' });
        expect(response.status).toBe(200);
        expect(expireSession).toHaveBeenCalledWith('cs_test_old');
    });

    it('refuse un code dont la session précédente est déjà payée', async () => {
        pickup.findUsablePickupCode.mockResolvedValue({ ...APPROVED, stripeSessionId: 'cs_test_paid' });
        retrieveSession.mockResolvedValue({ id: 'cs_test_paid', status: 'complete' });
        const response = await callRoute({ carrierId: 'remise_main_propre', pickupCode: 'MP-7K4Q-X9RT' });
        expect(response.status).toBe(400);
        expect(pickup.markPickupCodeUsed).toHaveBeenCalledWith(APPROVED.id, 'cs_test_paid', expect.any(Date));
        expect(createSession).not.toHaveBeenCalled();
    });

    it('renvoie 503 sans Turso ou si la vérification échoue', async () => {
        pickup.resolvePickupDatabase.mockResolvedValueOnce(null);
        expect((await callRoute({ carrierId: 'remise_main_propre', pickupCode: 'MP-7K4Q-X9RT' })).status).toBe(503);
        pickup.findUsablePickupCode.mockRejectedValueOnce(new Error('libsql: secret'));
        const response = await callRoute({ carrierId: 'remise_main_propre', pickupCode: 'MP-7K4Q-X9RT' });
        expect(response.status).toBe(503);
        expect(JSON.stringify(await response.json())).not.toContain('secret');
    });

    it('n’impose pas de code à Mondial Relay', async () => {
        const response = await callRoute({ carrierId: 'mondial_relay', relayPoint: VALID_RELAY });
        expect(response.status).toBe(200);
        const params = createSession.mock.calls[0][0];
        expect(params.metadata.pickup_request_id).toBeUndefined();
        expect(params.customer_email).toBeUndefined();
        expect(pickup.findUsablePickupCode).not.toHaveBeenCalled();
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
