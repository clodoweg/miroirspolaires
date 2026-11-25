// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const inventory = vi.hoisted(() => {
    class R2OrphanRequestError extends Error {}
    return { loadR2Inventory: vi.fn(), deleteR2Orphans: vi.fn(), R2OrphanRequestError };
});
vi.mock('@/lib/admin/r2-inventory', () => inventory);
vi.mock('@/lib/admin/stores/content-reader', () => ({ getContentReader: () => 'lecteur' }));

import { GET } from './inventory';
import { POST } from './orphans';

const post = (body: unknown) =>
    POST({
        request: new Request('http://localhost/api/admin/r2/orphans', { method: 'POST', body: JSON.stringify(body) }),
    } as unknown as Parameters<typeof POST>[0]);

beforeEach(() => vi.stubEnv('DEV', true));
afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
});

describe('GET /api/admin/r2/inventory', () => {
    it('renvoie l’inventaire, ou 502 si R2 ou GitHub échouent', async () => {
        inventory.loadR2Inventory.mockResolvedValueOnce({ totalCount: 0, orphans: [] });
        const ok = await GET({} as Parameters<typeof GET>[0]);
        expect(await ok.json()).toEqual({ totalCount: 0, orphans: [] });
        expect(inventory.loadR2Inventory).toHaveBeenCalledWith('lecteur');

        inventory.loadR2Inventory.mockRejectedValueOnce(new Error('R2 injoignable'));
        const failed = await GET({} as Parameters<typeof GET>[0]);
        expect(failed.status).toBe(502);
    });
});

describe('POST /api/admin/r2/orphans', () => {
    it('supprime, refuse une demande invalide (400) et remonte une panne (502)', async () => {
        inventory.deleteR2Orphans.mockResolvedValueOnce(['a']);
        expect(await (await post({ keys: ['a'] })).json()).toEqual({ deleted: ['a'] });
        expect(inventory.deleteR2Orphans).toHaveBeenCalledWith(['a'], 'lecteur');

        inventory.deleteR2Orphans.mockRejectedValueOnce(new inventory.R2OrphanRequestError('pas un orphelin'));
        expect((await post({ keys: ['b'] })).status).toBe(400);

        inventory.deleteR2Orphans.mockRejectedValueOnce(new Error('R2 injoignable'));
        expect((await post({ keys: ['c'] })).status).toBe(502);
    });
});
