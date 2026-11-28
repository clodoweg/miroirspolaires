import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { constructEvent, markUsed } = vi.hoisted(() => ({ constructEvent: vi.fn(), markUsed: vi.fn() }));

vi.mock('stripe', () => {
    function Stripe() {
        return { webhooks: { constructEventAsync: constructEvent } };
    }
    return { default: Stripe };
});
vi.mock('../../../lib/shop/pickup-codes', () => ({ markPickupCodeUsed: markUsed }));

import { POST } from './stripe-webhook';

function callRoute(signature: string | null = 't=1,v1=abc') {
    const headers = new Headers({ 'Content-Type': 'application/json' });
    if (signature) headers.set('stripe-signature', signature);
    const request = new Request('https://www.miroirspolaires.fr/api/shop/stripe-webhook', {
        method: 'POST',
        headers,
        body: '{"id":"evt_1"}',
    });
    return POST({ request } as Parameters<typeof POST>[0]);
}

function completed(metadata: Record<string, string>) {
    return { type: 'checkout.session.completed', data: { object: { id: 'cs_test_1', metadata } } };
}

describe('POST /api/shop/stripe-webhook', () => {
    beforeEach(() => {
        vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_dummy');
        vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_dummy');
        constructEvent.mockReset();
        markUsed.mockReset();
        markUsed.mockResolvedValue(true);
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it('renvoie 503 sans secret de webhook', async () => {
        vi.stubEnv('STRIPE_WEBHOOK_SECRET', '');
        expect((await callRoute()).status).toBe(503);
    });

    it('refuse une requête sans signature ou mal signée', async () => {
        expect((await callRoute(null)).status).toBe(400);
        constructEvent.mockRejectedValue(new Error('No signatures found'));
        expect((await callRoute()).status).toBe(400);
        expect(markUsed).not.toHaveBeenCalled();
    });

    it('vérifie la signature sur le corps brut', async () => {
        constructEvent.mockResolvedValue({ type: 'payment_intent.created', data: { object: {} } });
        expect((await callRoute()).status).toBe(200);
        expect(constructEvent).toHaveBeenCalledWith('{"id":"evt_1"}', 't=1,v1=abc', 'whsec_dummy');
        expect(markUsed).not.toHaveBeenCalled();
    });

    it('marque le code utilisé à la fin d’un paiement de remise en main propre', async () => {
        constructEvent.mockResolvedValue(completed({ pickup_request_id: 'r1' }));
        expect((await callRoute()).status).toBe(200);
        expect(markUsed).toHaveBeenCalledWith('r1', 'cs_test_1', expect.any(Date));
    });

    it('ignore une commande Mondial Relay', async () => {
        constructEvent.mockResolvedValue(completed({ carrier_id: 'mondial_relay' }));
        expect((await callRoute()).status).toBe(200);
        expect(markUsed).not.toHaveBeenCalled();
    });

    it('renvoie 500 pour que Stripe réessaie si Turso échoue', async () => {
        constructEvent.mockResolvedValue(completed({ pickup_request_id: 'r1' }));
        markUsed.mockRejectedValue(new Error('turso down'));
        const response = await callRoute();
        expect(response.status).toBe(500);
        expect(JSON.stringify(await response.json())).not.toContain('turso');
    });
});
