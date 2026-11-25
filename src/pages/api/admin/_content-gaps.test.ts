// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getContentGapsWith } from '@/lib/admin/content-gaps-reader';
import { GET } from './content-gaps';

vi.mock('@/lib/admin/content-gaps-reader', () => ({ getContentGapsWith: vi.fn() }));
vi.mock('@/lib/admin/stores/content-reader', () => ({ getContentReader: () => 'lecteur' }));

const callGet = (query: string) =>
    GET({ url: new URL(`http://localhost/api/admin/content-gaps${query}`) } as Parameters<typeof GET>[0]);

afterEach(() => vi.unstubAllEnvs());

describe('GET /api/admin/content-gaps', () => {
    it('renvoie 404 hors dev', async () => {
        vi.stubEnv('DEV', false);
        expect((await callGet('?scope=blog')).status).toBe(404);
    });

    it('refuse un domaine inconnu', async () => {
        vi.stubEnv('DEV', true);
        expect((await callGet('?scope=astro')).status).toBe(400);
        expect((await callGet('')).status).toBe(400);
    });

    it('renvoie les textes manquants du domaine', async () => {
        vi.stubEnv('DEV', true);
        const gaps = { missingAltCount: 1, missingAltsByEntry: { '2026/a': 1 }, missingSeo: [] };
        vi.mocked(getContentGapsWith).mockResolvedValue(gaps);
        const response = await callGet('?scope=voyages');
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(gaps);
        expect(getContentGapsWith).toHaveBeenCalledWith('lecteur', 'voyages');
    });

    it('répond 502 si la lecture de la branche échoue', async () => {
        vi.stubEnv('DEV', true);
        vi.mocked(getContentGapsWith).mockRejectedValue(new Error('GitHub injoignable'));
        const response = await callGet('?scope=blog');
        expect(response.status).toBe(502);
        expect(await response.json()).toEqual({ error: 'GitHub injoignable' });
    });
});
