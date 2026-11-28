import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { store, sendCode } = vi.hoisted(() => ({
    store: {
        resolvePickupDatabase: vi.fn(),
        listPickupRequests: vi.fn(),
        getPickupRequest: vi.fn(),
        approvePickupRequest: vi.fn(),
        closePickupRequest: vi.fn(),
    },
    sendCode: vi.fn(),
}));

vi.mock('@/lib/shop/pickup-codes', () => store);
vi.mock('@/lib/shop/pickup-mailer', () => ({ sendPickupCodeToBuyer: sendCode }));

import { GET } from './index';
import { POST } from './[id]';

const ID = '00000000-0000-4000-8000-000000000001';
const PENDING = { id: ID, status: 'pending', email: 'camille@example.org', code: null };
const APPROVED = { ...PENDING, status: 'approved', code: 'MP-7K4Q-X9RT', expiresAt: '2026-12-28T00:00:00Z' };
const GRANTED = { adminAccess: { mode: 'local' } } as App.Locals;

function post(action: unknown, id = ID, locals: App.Locals = GRANTED) {
    const request = new Request(`http://localhost/api/admin/shop/pickup-requests/${id}`, {
        method: 'POST',
        body: JSON.stringify({ action }),
    });
    return POST({ request, params: { id }, locals } as unknown as Parameters<typeof POST>[0]);
}

describe('API admin des remises en main propre', () => {
    beforeEach(() => {
        Object.values(store).forEach((mock) => mock.mockReset());
        sendCode.mockReset();
        store.resolvePickupDatabase.mockResolvedValue({});
        sendCode.mockResolvedValue(true);
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it('liste les demandes et l’état de la configuration e-mail', async () => {
        vi.stubEnv('RESEND_API_KEY', 're_x');
        vi.stubEnv('SHOP_NOTIFY_EMAIL', '');
        store.listPickupRequests.mockResolvedValue([PENDING]);
        const response = await GET({ locals: GRANTED } as Parameters<typeof GET>[0]);
        const body = await response.json();
        expect(body.requests).toEqual([PENDING]);
        expect(body.email).toMatchObject({ apiKey: true, notifyAddress: false });
    });

    it('signale Turso absent ou en échec', async () => {
        store.resolvePickupDatabase.mockResolvedValueOnce(null);
        expect((await GET({ locals: GRANTED } as Parameters<typeof GET>[0])).status).toBe(503);
        store.listPickupRequests.mockRejectedValueOnce(new Error('x'));
        expect((await GET({ locals: GRANTED } as Parameters<typeof GET>[0])).status).toBe(500);
        store.resolvePickupDatabase.mockResolvedValueOnce(null);
        expect((await post('approve')).status).toBe(503);
    });

    it('accepte une demande et envoie le code', async () => {
        store.getPickupRequest.mockResolvedValue(PENDING);
        store.approvePickupRequest.mockResolvedValue(APPROVED);
        const response = await post('approve');
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ request: APPROVED, emailSent: true });
        expect(sendCode).toHaveBeenCalledWith(APPROVED, expect.stringMatching(/^https:\/\//));
    });

    it('répond 409 si la demande n’est plus en attente', async () => {
        store.getPickupRequest.mockResolvedValue(APPROVED);
        store.approvePickupRequest.mockResolvedValue(null);
        expect((await post('approve')).status).toBe(409);
        expect((await post('reject')).status).toBe(409);
        store.getPickupRequest.mockResolvedValue(PENDING);
        expect((await post('revoke')).status).toBe(409);
        expect((await post('resend')).status).toBe(409);
        expect(sendCode).not.toHaveBeenCalled();
    });

    it('refuse sans envoyer d’e-mail', async () => {
        store.getPickupRequest.mockResolvedValue(PENDING);
        store.closePickupRequest.mockResolvedValue({ ...PENDING, status: 'rejected' });
        const body = await (await post('reject')).json();
        expect(body).toMatchObject({ request: { status: 'rejected' }, emailSent: false });
        expect(sendCode).not.toHaveBeenCalled();
    });

    it('révoque et renvoie un code accepté', async () => {
        store.getPickupRequest.mockResolvedValue(APPROVED);
        expect((await (await post('resend')).json()).emailSent).toBe(true);
        store.closePickupRequest.mockResolvedValue({ ...APPROVED, status: 'revoked' });
        expect((await (await post('revoke')).json()).request.status).toBe('revoked');
    });

    it.each([
        ['action inconnue', 'delete', ID, 400],
        ['identifiant invalide', 'approve', '../etc', 400],
    ])('refuse : %s', async (_label, action, id, status) => {
        expect((await post(action, id)).status).toBe(status);
    });

    it('répond 404 pour une demande inconnue et 500 si Turso échoue', async () => {
        store.getPickupRequest.mockResolvedValueOnce(null);
        expect((await post('approve')).status).toBe(404);
        store.getPickupRequest.mockRejectedValueOnce(new Error('x'));
        expect((await post('approve')).status).toBe(500);
    });
});
