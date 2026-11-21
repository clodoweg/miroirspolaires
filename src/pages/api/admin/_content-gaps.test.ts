// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getContentGaps } from '@/lib/admin/content-gaps.mjs';
import { GET } from './content-gaps';

vi.mock('@/lib/admin/content-gaps.mjs', () => ({ getContentGaps: vi.fn() }));

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
        vi.mocked(getContentGaps).mockReturnValue(gaps);
        const response = await callGet('?scope=voyages');
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(gaps);
        expect(getContentGaps).toHaveBeenCalledWith('voyages', process.cwd());
    });
});
