// @vitest-environment node
/**
 * Tests de la route `/api/admin/upstream/probe` : garde de dev et refus de tout ce qui sort du registre.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { probeUpstreamRoute } = vi.hoisted(() => ({ probeUpstreamRoute: vi.fn() }));

vi.mock('@/lib/admin/upstream-routes', () => ({ probeUpstreamRoute }));

import { POST } from './probe';

const callPost = (body: unknown) =>
    POST({
        request: new Request('http://localhost/api/admin/upstream/probe', {
            method: 'POST',
            body: JSON.stringify(body),
        }),
    } as Parameters<typeof POST>[0]);

describe('/api/admin/upstream/probe', () => {
    beforeEach(() => {
        vi.stubEnv('DEV', true);
        probeUpstreamRoute.mockResolvedValue({ status: 'ok', latencyMs: 12 });
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.clearAllMocks();
    });

    it('répond 404 hors du mode dev', async () => {
        vi.stubEnv('DEV', false);
        expect((await callPost({ serviceId: 'simbad', routeId: 'cds' })).status).toBe(404);
        expect(probeUpstreamRoute).not.toHaveBeenCalled();
    });

    it('teste la route du registre', async () => {
        const response = await callPost({ serviceId: 'simbad', routeId: 'harvard' });
        expect(await response.json()).toEqual({ status: 'ok', latencyMs: 12 });
        const [, serviceId, route] = probeUpstreamRoute.mock.calls[0];
        expect(serviceId).toBe('simbad');
        expect(route.baseUrl).toBe('https://simbad.harvard.edu/simbad/sim-tap/sync');
    });

    it.each([
        [{ serviceId: 'inconnu', routeId: 'cds' }],
        [{ serviceId: 'simbad', routeId: 'inconnue' }],
        [{ serviceId: '__proto__', routeId: 'cds' }],

        [{}],
    ])('refuse %j', async (body) => {
        expect((await callPost(body)).status).toBe(404);
        expect(probeUpstreamRoute).not.toHaveBeenCalled();
    });

    it('ignore une URL fournie par le client', async () => {
        await callPost({ serviceId: 'simbad', routeId: 'cds', baseUrl: 'http://169.254.169.254/' });
        expect(probeUpstreamRoute.mock.calls[0][2].baseUrl).toContain('simbad.cds.unistra.fr');
    });
});
