import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { pickup, notify } = vi.hoisted(() => ({
    pickup: {
        resolvePickupDatabase: vi.fn(),
        isPickupRequestRateLimited: vi.fn(),
        createPickupRequest: vi.fn(),
    },
    notify: vi.fn(),
}));

vi.mock('../../../lib/shop/pickup-codes', () => pickup);
vi.mock('../../../lib/shop/pickup-mailer', () => ({ notifyAuthorOfPickupRequest: notify }));

import { POST } from './pickup-request';

const VALID = { name: 'Camille', email: 'camille@example.org', place: 'Lyon', message: '' };

function callRoute(body: unknown, clientAddress: string | (() => string) = '203.0.113.7') {
    const request = new Request('https://www.miroirspolaires.fr/api/shop/pickup-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '198.51.100.1, 10.0.0.1' },
        body: typeof body === 'string' ? body : JSON.stringify(body),
    });
    const context = { request, url: new URL(request.url) } as Record<string, unknown>;
    Object.defineProperty(context, 'clientAddress', {
        get: typeof clientAddress === 'function' ? clientAddress : () => clientAddress,
    });
    return POST(context as unknown as Parameters<typeof POST>[0]);
}

describe('POST /api/shop/pickup-request', () => {
    beforeEach(() => {
        vi.stubEnv('ENABLE_BOUTIQUE', 'true');
        Object.values(pickup).forEach((mock) => mock.mockReset());
        notify.mockReset();
        pickup.resolvePickupDatabase.mockResolvedValue({});
        pickup.isPickupRequestRateLimited.mockResolvedValue(false);
        pickup.createPickupRequest.mockImplementation(async (input) => ({ id: 'r1', ...input }));
        notify.mockResolvedValue(true);
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it('renvoie 403 quand la boutique est désactivée', async () => {
        vi.stubEnv('ENABLE_BOUTIQUE', 'false');
        expect((await callRoute(VALID)).status).toBe(403);
    });

    it('enregistre la demande, avec une empreinte du client et sans l’IP, puis prévient l’auteur', async () => {
        const response = await callRoute(VALID);
        expect(response.status).toBe(201);
        const stored = pickup.createPickupRequest.mock.calls[0][0];
        expect(stored).toMatchObject(VALID);
        expect(stored.clientHash).toMatch(/^[0-9a-f]{64}$/);
        expect(JSON.stringify(stored)).not.toContain('203.0.113.7');
        expect(notify).toHaveBeenCalledOnce();
    });

    it('retombe sur x-forwarded-for quand l’adaptateur ne fournit pas l’adresse', async () => {
        await callRoute(VALID, () => {
            throw new Error('clientAddress indisponible');
        });
        const fallbackHash = pickup.createPickupRequest.mock.calls[0][0].clientHash;
        await callRoute(VALID, '198.51.100.1');
        expect(pickup.createPickupRequest.mock.calls[1][0].clientHash).toBe(fallbackHash);
    });

    it('fait semblant d’accepter quand le champ piège est rempli', async () => {
        const response = await callRoute({ ...VALID, website: 'http://spam' });
        expect(response.status).toBe(201);
        expect(pickup.createPickupRequest).not.toHaveBeenCalled();
    });

    it.each([['pas du json'], [{ ...VALID, email: 'faux' }]])('refuse %s', async (body) => {
        expect((await callRoute(body)).status).toBe(400);
        expect(pickup.createPickupRequest).not.toHaveBeenCalled();
    });

    it('renvoie 429 au-delà des plafonds', async () => {
        pickup.isPickupRequestRateLimited.mockResolvedValue(true);
        expect((await callRoute(VALID)).status).toBe(429);
        expect(pickup.createPickupRequest).not.toHaveBeenCalled();
    });

    it('renvoie 503 sans Turso et un message générique si Turso échoue', async () => {
        pickup.resolvePickupDatabase.mockResolvedValueOnce(null);
        expect((await callRoute(VALID)).status).toBe(503);
        pickup.createPickupRequest.mockRejectedValueOnce(new Error('SQLITE secret'));
        const response = await callRoute(VALID);
        expect(response.status).toBe(500);
        expect(JSON.stringify(await response.json())).not.toContain('secret');
    });
});
