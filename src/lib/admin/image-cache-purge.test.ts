// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { purgeReplacedImages } from './image-cache-purge';

afterEach(() => vi.unstubAllEnvs());

describe('purgeReplacedImages', () => {
    it('ne fait rien sans image', async () => {
        expect(await purgeReplacedImages([])).toEqual({ keys: [], failedCount: 0 });
    });

    it('signale l’absence de configuration du worker', async () => {
        vi.stubEnv('IMAGE_WORKER_URL', '');
        vi.stubEnv('IMAGE_WORKER_PURGE_KEY', '');
        expect(await purgeReplacedImages(['blog/2026/a/b.jpg'])).toEqual({
            keys: ['blog/2026/a/b.jpg'],
            failedCount: 0,
            skippedReason: 'not-configured',
        });
    });

    it('purge l’image et toutes ses variantes avec la clé de purge', async () => {
        vi.stubEnv('IMAGE_WORKER_URL', 'https://img.example/');
        vi.stubEnv('IMAGE_WORKER_PURGE_KEY', 'secret');
        const fetchImpl = vi.fn(
            async (_url: string | URL | Request, _init?: RequestInit) => new Response('', { status: 200 }),
        );
        const result = await purgeReplacedImages(['blog/2026/a/b.jpg'], { fetchImpl, pauseBetweenMs: 0 });
        expect(result).toEqual({ keys: ['blog/2026/a/b.jpg'], failedCount: 0 });
        const urls = fetchImpl.mock.calls.map(([url]) => url);
        expect(urls[0]).toBe('https://img.example/blog/2026/a/b.jpg');
        expect(urls.some((url) => /\/w_400,q_80,f_jpeg\/blog\/2026\/a\/b\.jpg$/.test(String(url)))).toBe(true);
        expect(fetchImpl.mock.calls[0][1]).toMatchObject({ headers: { 'x-purge': '1', 'x-purge-key': 'secret' } });
    });
});
