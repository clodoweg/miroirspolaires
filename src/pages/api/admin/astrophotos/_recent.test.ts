// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const astro = vi.hoisted(() => ({ listRecentPhotos: vi.fn() }));
vi.mock('@/lib/admin/astrophotos', () => astro);

import { GET } from './recent';

function get(search: string) {
    const url = new URL(`http://localhost/api/admin/astrophotos/recent${search}`);
    return GET({ url } as unknown as Parameters<typeof GET>[0]);
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('DEV', true);
    astro.listRecentPhotos.mockResolvedValue([{ ID: '1' }]);
});

afterEach(() => vi.unstubAllEnvs());

describe('GET /api/admin/astrophotos/recent', () => {
    it('renvoie les photos récentes', async () => {
        expect(await (await get('')).json()).toEqual([{ ID: '1' }]);
    });

    it('répond 502 si la lecture échoue (GitHub ou R2 à distance)', async () => {
        astro.listRecentPhotos.mockRejectedValue(new Error('R2 injoignable'));
        const response = await get('');
        expect(response.status).toBe(502);
        expect(await response.json()).toEqual({ error: 'R2 injoignable' });
    });

    it.each([
        ['', 30],
        ['?limit=all', 9999],
        ['?limit=50', 50],
        ['?limit=0', 30],
        ['?limit=-5', 1],
        ['?limit=abc', 30],
        ['?limit=50000', 1000],
    ])('borne la limite %s à %i', async (search, expected) => {
        await get(search);
        expect(astro.listRecentPhotos).toHaveBeenCalledWith(expected);
    });

    it('renvoie 404 hors dev', async () => {
        vi.stubEnv('DEV', false);
        expect((await get('')).status).toBe(404);
        expect(astro.listRecentPhotos).not.toHaveBeenCalled();
    });
});
