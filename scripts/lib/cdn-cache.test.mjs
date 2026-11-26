// @vitest-environment node
/**
 * Tests de la purge du cache CDN Cloudflare devant le domaine public de R2.
 */
import { describe, expect, it, vi } from 'vitest';
import { publicUrlsForKeys, purgeCdnKeys, purgeCdnUrls, readCdnPurgeConfig } from './cdn-cache.mjs';

const ZONE = '0123456789abcdef0123456789abcdef';
const ENV = { CLOUDFLARE_ZONE_ID: ZONE, CLOUDFLARE_API_TOKEN: 'cf-token', PUBLIC_R2_URL: 'https://pub.example/' };

const okFetch = () => vi.fn(async (_url, _init) => new Response(JSON.stringify({ success: true }), { status: 200 }));

describe('readCdnPurgeConfig', () => {
    it('lit la configuration complète', () => {
        expect(readCdnPurgeConfig(ENV)).toEqual({
            zoneId: ZONE,
            apiToken: 'cf-token',
            publicBase: 'https://pub.example',
        });
    });

    it.each([
        ['sans zone', { ...ENV, CLOUDFLARE_ZONE_ID: '' }],
        ['zone invalide', { ...ENV, CLOUDFLARE_ZONE_ID: '../x' }],
        ['sans jeton', { ...ENV, CLOUDFLARE_API_TOKEN: '' }],
        ['URL publique en http', { ...ENV, PUBLIC_R2_URL: 'http://pub.example' }],
    ])('refuse %s', (_label, env) => {
        expect(readCdnPurgeConfig(env)).toBeNull();
    });
});

describe('publicUrlsForKeys', () => {
    it('encode les noms et ajoute miniature et versions web sur demande', () => {
        expect(publicUrlsForKeys('https://pub.example', ['blog/2026/a/é t.jpg'])).toEqual([
            'https://pub.example/blog/2026/a/%C3%A9%20t.jpg',
        ]);
        const urls = publicUrlsForKeys('https://pub.example', ['blog/2026/a/b.png', 'blog/2026/a/b-thumb.jpg'], {
            withDerivatives: true,
        });
        expect(urls).toContain('https://pub.example/blog/2026/a/b-thumb.jpg');
        expect(urls).toContain('https://pub.example/web/blog/2026/a/b-w1200.jpg');
        expect(urls).not.toContain('https://pub.example/blog/2026/a/b-thumb-thumb.jpg');
        expect(new Set(urls).size).toBe(urls.length);
    });

    it('ne dérive rien d’une version web', () => {
        expect(publicUrlsForKeys('https://pub.example', ['web/x/b-w400.jpg'], { withDerivatives: true })).toEqual([
            'https://pub.example/web/x/b-w400.jpg',
        ]);
    });
});

describe('purgeCdnUrls', () => {
    it('envoie des lots de 30 URL avec le jeton', async () => {
        const fetchImpl = okFetch();
        const urls = Array.from({ length: 65 }, (_, i) => `https://pub.example/${i}.jpg`);
        expect(await purgeCdnUrls(urls, { zoneId: ZONE, apiToken: 'cf-token', fetchImpl })).toBe(0);
        expect(fetchImpl).toHaveBeenCalledTimes(3);
        expect(JSON.parse(fetchImpl.mock.calls[2][1].body).files).toHaveLength(5);
        expect(fetchImpl.mock.calls[0][1].headers.authorization).toBe('Bearer cf-token');
    });

    it('compte les URL des lots refusés sans écrire le jeton', async () => {
        const error = vi.fn();
        const fetchImpl = vi.fn(
            async () =>
                new Response(JSON.stringify({ success: false, errors: [{ message: 'Authentication error' }] }), {
                    status: 403,
                }),
        );
        expect(
            await purgeCdnUrls(['https://pub.example/a.jpg'], { zoneId: ZONE, apiToken: 'cf-token', fetchImpl, error }),
        ).toBe(1);
        expect(error.mock.calls[0][0]).toContain('Authentication error');
        expect(error.mock.calls[0][0]).not.toContain('cf-token');
    });

    it('compte les URL en cas d’erreur réseau', async () => {
        const fetchImpl = vi.fn(async () => {
            throw new Error('offline');
        });
        expect(
            await purgeCdnUrls(['https://pub.example/a.jpg', 'https://pub.example/b.jpg'], {
                zoneId: ZONE,
                apiToken: 't',
                fetchImpl,
                error: () => {},
            }),
        ).toBe(2);
    });
});

describe('purgeCdnKeys', () => {
    it('saute la purge sans configuration', async () => {
        const fetchImpl = okFetch();
        expect(await purgeCdnKeys(['a.jpg'], { env: {}, fetchImpl })).toEqual({
            urlCount: 0,
            failedCount: 0,
            skippedReason: 'not-configured',
        });
        expect(await purgeCdnKeys([], { env: ENV, fetchImpl })).toEqual({ urlCount: 0, failedCount: 0 });
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('purge les clés configurées', async () => {
        const fetchImpl = okFetch();
        expect(await purgeCdnKeys(['web/a-w400.jpg', 'astro/b.jpg'], { env: ENV, fetchImpl })).toEqual({
            urlCount: 2,
            failedCount: 0,
        });
    });
});
