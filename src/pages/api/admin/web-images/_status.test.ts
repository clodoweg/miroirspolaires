// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';

const { getWebImagesStatus } = vi.hoisted(() => ({ getWebImagesStatus: vi.fn() }));
vi.mock('@/lib/admin/web-images-status', () => ({ getWebImagesStatus }));

import { GET } from './status';

const callRoute = () => GET({} as Parameters<typeof GET>[0]) as Promise<Response>;

describe('GET /api/admin/web-images/status', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
        getWebImagesStatus.mockReset();
    });

    it('renvoie 404 hors dev', async () => {
        vi.stubEnv('DEV', false);
        expect((await callRoute()).status).toBe(404);
        expect(getWebImagesStatus).not.toHaveBeenCalled();
    });

    it('renvoie l’état calculé sur src/assets et le manifeste', async () => {
        vi.stubEnv('DEV', true);
        const status = {
            total: 3,
            pending: 1,
            pendingByScope: { astro: 0, blog: 1, voyages: 0 },
            pendingSamples: ['blog/a.jpg'],
        };
        getWebImagesStatus.mockResolvedValue(status);
        const response = await callRoute();
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(status);
        const [assetsRoot, manifestPath] = getWebImagesStatus.mock.calls[0];
        expect(assetsRoot).toMatch(/src[/\\]assets$/);
        expect(manifestPath).toMatch(/src[/\\]data[/\\]web-images\.json$/);
    });

    it('renvoie un 500 générique en cas d’erreur', async () => {
        vi.stubEnv('DEV', true);
        vi.spyOn(console, 'error').mockImplementation(() => {});
        getWebImagesStatus.mockRejectedValue(new Error('EACCES /secret'));
        const response = await callRoute();
        expect(response.status).toBe(500);
        expect(JSON.stringify(await response.json())).not.toContain('secret');
    });
});
