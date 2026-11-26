import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from './status';

function callGet() {
    return GET({} as unknown as Parameters<typeof GET>[0]);
}

describe('GET /api/admin/cache/status', () => {
    beforeEach(() => {
        vi.stubEnv('DEV', true);
        vi.stubEnv('IMAGE_WORKER_URL', '');
        vi.stubEnv('IMAGE_WORKER_PURGE_KEY', '');
        vi.stubEnv('R2_ACCOUNT_ID', '');
        vi.stubEnv('R2_ACCESS_KEY_ID', '');
        vi.stubEnv('R2_SECRET_ACCESS_KEY', '');
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    it('renvoie 404 hors du mode développement', async () => {
        vi.stubEnv('DEV', false);
        expect((await callGet()).status).toBe(404);
    });

    it('signale un worker non configuré sans appel réseau', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const body = await (await callGet()).json();
        expect(body).toMatchObject({
            configured: false,
            workerUrl: '',
            purgeKeyConfigured: false,
            cdnPurgeConfigured: false,
            r2Configured: false,
            online: false,
            errorMessage: null,
        });
        expect(body.cachePolicy.widths).toEqual([400, 800, 1200]);
        // Politique réelle du worker (core.ts) : JPEG, 500 Ko et 1,8 MP.
        expect(body.cachePolicy).toMatchObject({ sizeLimitKb: 500, megapixelLimit: 1.8 });
        expect(body.cachePolicy.format).toMatch(/^jpeg/);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('considère le worker en ligne dès qu’il répond, même en 400', async () => {
        vi.stubEnv('IMAGE_WORKER_URL', 'https://images.example.com');
        vi.stubEnv('IMAGE_WORKER_PURGE_KEY', 'cle');
        vi.stubEnv('R2_ACCOUNT_ID', 'compte');
        vi.stubEnv('R2_ACCESS_KEY_ID', 'id');
        vi.stubEnv('R2_SECRET_ACCESS_KEY', 'secret');
        const fetchMock = vi
            .fn()
            .mockResolvedValue(new Response('Image path missing', { status: 400, statusText: 'Bad Request' }));
        vi.stubGlobal('fetch', fetchMock);
        const body = await (await callGet()).json();
        expect(fetchMock).toHaveBeenCalledWith(
            'https://images.example.com',
            expect.objectContaining({ method: 'GET' }),
        );
        expect(body).toMatchObject({
            configured: true,
            purgeKeyConfigured: true,
            r2Configured: true,
            online: true,
            pingStatus: 400,
            pingStatusText: 'Bad Request',
        });
        expect(body.pingTime).toBeGreaterThanOrEqual(0);
    });

    it('rapporte l’erreur réseau quand le worker est injoignable', async () => {
        vi.stubEnv('IMAGE_WORKER_URL', 'https://images.example.com');
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND')));
        const body = await (await callGet()).json();
        expect(body).toMatchObject({ online: false, errorMessage: 'getaddrinfo ENOTFOUND', pingStatus: 0 });
    });

    it('convertit en texte une erreur sans message', async () => {
        vi.stubEnv('IMAGE_WORKER_URL', 'https://images.example.com');
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue('coupure'));
        const body = await (await callGet()).json();
        expect(body.errorMessage).toBe('coupure');
    });
});
