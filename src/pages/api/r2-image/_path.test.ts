import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from './[...path]';

function callRoute(assetPath: string | undefined) {
    const url = new URL(`https://www.miroirspolaires.fr/api/r2-image/${assetPath ?? ''}`);
    return GET({ params: { path: assetPath }, url, request: new Request(url) } as unknown as Parameters<typeof GET>[0]);
}

describe('GET /api/r2-image/[...path]', () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
        // POURQUOI : on teste le chemin de production (R2) ; en dev la route lit d'abord le disque.
        vi.stubEnv('DEV', false);
        fetchMock.mockReset();
        vi.stubGlobal('fetch', fetchMock);
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it.each([
        ['absent', undefined],
        ['traversée encodée', '..%2F..%2F.env'],
        ['traversée', 'blog/2026/slug/../../../.env'],
        ['hors blog et voyages', 'astrophotographies/2026/1213620_raw.jpg'],
        ['extension non image', 'blog/2026/la-route-des-fjords/notes.md'],
        ['fichier caché', 'blog/2026/slug/.env'],
    ])('refuse un chemin %s sans appeler R2', async (_label, assetPath) => {
        const response = await callRoute(assetPath);
        expect(response.status).toBe(404);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('relaie le flux R2 sans le bufferiser, avec un type MIME imposé et sans CORS ouvert', async () => {
        const body = new ReadableStream({
            start(controller) {
                controller.enqueue(new Uint8Array([1, 2, 3]));
                controller.close();
            },
        });
        fetchMock.mockResolvedValue(
            new Response(body, { status: 200, headers: { 'Content-Type': 'text/html', 'Content-Length': '3' } }),
        );

        const response = await callRoute('blog/2026/la-route-des-fjords/001_0662_pano.jpg');

        expect(fetchMock).toHaveBeenCalledWith(
            'https://pub-r2.miroirspolaires.fr/blog/2026/la-route-des-fjords/001_0662_pano.jpg',
            expect.objectContaining({ signal: expect.any(AbortSignal) }),
        );
        expect(response.status).toBe(200);
        expect(response.body).toBe(body);
        expect(response.headers.get('Content-Type')).toBe('image/jpeg');
        expect(response.headers.get('Content-Length')).toBe('3');
        expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
        expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    });

    it('accepte le préfixe assets/ des chemins markdown', async () => {
        fetchMock.mockResolvedValue(new Response('x', { status: 200 }));
        await callRoute('assets/voyages/2025/troms/pano.webp');
        expect(fetchMock).toHaveBeenCalledWith(
            'https://pub-r2.miroirspolaires.fr/voyages/2025/troms/pano.webp',
            expect.objectContaining({ signal: expect.any(AbortSignal) }),
        );
    });

    it('abandonne si R2 ne renvoie pas ses en-têtes dans le délai', async () => {
        vi.useFakeTimers();
        fetchMock.mockImplementation(
            (_url: string, init: { signal: AbortSignal }) =>
                new Promise((_resolve, reject) => {
                    init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
                }),
        );
        const pending = callRoute('blog/2026/slug/pano.jpg');
        await vi.advanceTimersByTimeAsync(10_000);
        expect((await pending).status).toBe(502);
        vi.useRealTimers();
    });

    it('ne relaie pas le message d’erreur amont', async () => {
        fetchMock.mockResolvedValue(new Response('detail interne', { status: 403, statusText: 'AccessDenied bucket' }));
        const response = await callRoute('blog/2026/slug/pano.jpg');
        expect(response.status).toBe(502);
        expect(await response.text()).not.toContain('bucket');
    });
});
