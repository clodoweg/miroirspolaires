// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { purgeReplacedImages } from './image-cache-purge';

afterEach(() => vi.unstubAllEnvs());

const CDN_OFF = { urlCount: 0, failedCount: 0, skippedReason: 'not-configured' };
const ZONE = '0123456789abcdef0123456789abcdef';

describe('purgeReplacedImages', () => {
    it('ne fait rien sans image', async () => {
        expect(await purgeReplacedImages([])).toEqual({ keys: [], failedCount: 0 });
    });

    it('signale l’absence de configuration du worker et du CDN', async () => {
        vi.stubEnv('IMAGE_WORKER_URL', '');
        vi.stubEnv('IMAGE_WORKER_PURGE_KEY', '');
        vi.stubEnv('CLOUDFLARE_ZONE_ID', '');
        expect(await purgeReplacedImages(['blog/2026/a/b.jpg'])).toEqual({
            keys: ['blog/2026/a/b.jpg'],
            failedCount: 0,
            skippedReason: 'not-configured',
            cdn: CDN_OFF,
        });
    });

    it('purge l’image et toutes ses variantes avec la clé de purge', async () => {
        vi.stubEnv('IMAGE_WORKER_URL', 'https://img.example/');
        vi.stubEnv('IMAGE_WORKER_PURGE_KEY', 'secret');
        vi.stubEnv('CLOUDFLARE_ZONE_ID', '');
        const fetchImpl = vi.fn(
            async (_url: string | URL | Request, _init?: RequestInit) => new Response('', { status: 200 }),
        );
        const result = await purgeReplacedImages(['blog/2026/a/b.jpg'], { fetchImpl, pauseBetweenMs: 0 });
        expect(result).toEqual({ keys: ['blog/2026/a/b.jpg'], failedCount: 0, cdn: CDN_OFF });
        const urls = fetchImpl.mock.calls.map(([url]) => url);
        expect(urls[0]).toBe('https://img.example/blog/2026/a/b.jpg');
        expect(urls.some((url) => /\/w_400,q_80,f_jpeg\/blog\/2026\/a\/b\.jpg$/.test(String(url)))).toBe(true);
        expect(fetchImpl.mock.calls[0][1]).toMatchObject({ headers: { 'x-purge': '1', 'x-purge-key': 'secret' } });
    });

    it('purge aussi le CDN de R2 : image, miniature et versions web', async () => {
        vi.stubEnv('IMAGE_WORKER_URL', '');
        vi.stubEnv('CLOUDFLARE_ZONE_ID', ZONE);
        vi.stubEnv('CLOUDFLARE_API_TOKEN', 'cf-token');
        vi.stubEnv('PUBLIC_R2_URL', 'https://pub.example/');
        const fetchImpl = vi.fn(
            async (_url: string | URL | Request, _init?: RequestInit) =>
                new Response(JSON.stringify({ success: true }), { status: 200 }),
        );
        const result = await purgeReplacedImages(['blog/2026/a/b.jpg'], { fetchImpl });
        expect(result.cdn).toEqual({ urlCount: 5, failedCount: 0 });
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        const [url, init] = fetchImpl.mock.calls[0];
        expect(url).toBe(`https://api.cloudflare.com/client/v4/zones/${ZONE}/purge_cache`);
        expect(JSON.parse(String(init?.body)).files).toEqual([
            'https://pub.example/blog/2026/a/b.jpg',
            'https://pub.example/blog/2026/a/b-thumb.jpg',
            'https://pub.example/web/blog/2026/a/b-w400.jpg',
            'https://pub.example/web/blog/2026/a/b-w800.jpg',
            'https://pub.example/web/blog/2026/a/b-w1200.jpg',
        ]);
    });
});
