// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { IMAGE_CONFIG } from '../../src/config/imageConfig.mjs';
import { purgeImageKeys, purgeWorkerUrl, workerUrlsForKey } from './worker-cache.mjs';

const silent = { log: () => {}, error: () => {}, pauseMs: () => 0 };

function fakeFetch(statuses) {
    const calls = [];
    const fetchImpl = async (url, init) => {
        calls.push({ url, init });
        const status = statuses.length > 1 ? statuses.shift() : statuses[0];
        if (status instanceof Error) throw status;
        return { ok: status >= 200 && status < 300, status, arrayBuffer: async () => new ArrayBuffer(0) };
    };
    return { calls, fetchImpl };
}

describe('workerUrlsForKey', () => {
    it("donne l'URL nue puis une URL f_jpeg par variante mise en cache", () => {
        const urls = workerUrlsForKey('https://img.example/', 'astrophotographies/2026/1_raw.jpg');
        expect(urls[0]).toBe('https://img.example/astrophotographies/2026/1_raw.jpg');
        expect(urls).toHaveLength(1 + IMAGE_CONFIG.CACHED_VARIANTS.length);
        const [width, quality] = IMAGE_CONFIG.CACHED_VARIANTS[0];
        expect(urls[1]).toBe(`https://img.example/w_${width},q_${quality},f_jpeg/astrophotographies/2026/1_raw.jpg`);
    });
});

describe('purgeWorkerUrl', () => {
    it('envoie un GET avec la clé de purge, accepte 404', async () => {
        const { calls, fetchImpl } = fakeFetch([404]);
        expect(await purgeWorkerUrl('https://img.example/a.jpg', 'secret', { ...silent, fetchImpl })).toBe(true);
        expect(calls[0].init).toEqual({ method: 'GET', headers: { 'x-purge': '1', 'x-purge-key': 'secret' } });
    });

    it('réessaie sur 503 et sur erreur réseau, échoue après 3 tentatives', async () => {
        const retried = fakeFetch([503, new Error('reset'), 200]);
        expect(await purgeWorkerUrl('u', 'k', { ...silent, fetchImpl: retried.fetchImpl })).toBe(true);
        expect(retried.calls).toHaveLength(3);

        const failing = fakeFetch([503]);
        expect(await purgeWorkerUrl('u', 'k', { ...silent, fetchImpl: failing.fetchImpl })).toBe(false);
        expect(failing.calls).toHaveLength(3);

        const refused = fakeFetch([403]);
        expect(await purgeWorkerUrl('u', 'k', { ...silent, fetchImpl: refused.fetchImpl })).toBe(false);
        expect(refused.calls).toHaveLength(1);
    });
});

describe('purgeImageKeys', () => {
    it('purge chaque variante de chaque image et compte les échecs', async () => {
        const { calls, fetchImpl } = fakeFetch([403]);
        const failed = await purgeImageKeys(['a.jpg', 'b.jpg'], {
            workerUrl: 'https://img.example',
            purgeKey: 'k',
            pauseBetweenMs: 0,
            ...silent,
            fetchImpl,
        });
        const perImage = 1 + IMAGE_CONFIG.CACHED_VARIANTS.length;
        expect(calls).toHaveLength(2 * perImage);
        expect(failed).toBe(2 * perImage);
    });
});
