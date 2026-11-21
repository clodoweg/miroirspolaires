// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const photon = vi.hoisted(() => {
    const makeImage = (width: number, height: number) => ({
        get_width: () => width,
        get_height: () => height,
        get_bytes_jpeg: vi.fn(() => new Uint8Array([0xff, 0xd8])),
        get_bytes: vi.fn(() => new Uint8Array([0x89, 0x50])),
        free: vi.fn(),
    });
    return { makeImage, newFromByteslice: vi.fn(), resize: vi.fn() };
});

// POURQUOI : le vrai module charge un WASM que Vite ne sait pas résoudre ; on teste l'orchestration.
vi.mock('@cf-wasm/photon', () => ({
    PhotonImage: { new_from_byteslice: photon.newFromByteslice },
    resize: photon.resize,
    SamplingFilter: { Lanczos3: 5 },
}));

import worker, { type Env } from './index';

const cacheStore = new Map<string, Response>();
const cache = {
    match: vi.fn(async (request: Request) => cacheStore.get(request.url)?.clone()),
    put: vi.fn(async (request: Request, response: Response) => void cacheStore.set(request.url, response)),
    delete: vi.fn(async (request: Request) => cacheStore.delete(request.url)),
};
vi.stubGlobal('caches', { default: cache });

function r2Object(size: number, body = new Uint8Array([1, 2, 3])) {
    return {
        size,
        body: new Response(body).body,
        httpEtag: '"etag"',
        httpMetadata: { contentType: 'image/jpeg' },
        writeHttpMetadata: (headers: Headers) => headers.set('Content-Type', 'image/jpeg'),
        arrayBuffer: async () => body.buffer,
    };
}

function makeEnv(object: unknown = r2Object(1000), purgeKey?: string): Env {
    return { BUCKET: { get: vi.fn(async () => object) }, PURGE_KEY: purgeKey } as unknown as Env;
}

const ctx = { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext;

function request(path: string, init: RequestInit = {}) {
    return new Request(`https://images.miroirspolaires.fr${path}`, init);
}

describe('worker image-resizer', () => {
    beforeEach(() => {
        cacheStore.clear();
        vi.clearAllMocks();
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('refuse les méthodes autres que GET et HEAD', async () => {
        const response = await worker.fetch(request('/w_400/a.jpg', { method: 'POST' }), makeEnv(), ctx);
        expect(response.status).toBe(405);
    });

    it('refuse une purge si PURGE_KEY n’est pas configuré', async () => {
        const response = await worker.fetch(request('/a.jpg', { headers: { 'x-purge': '1' } }), makeEnv(), ctx);
        expect(response.status).toBe(401);
        expect(cache.delete).not.toHaveBeenCalled();
    });

    it('ignore une clé de purge passée en query string', async () => {
        const response = await worker.fetch(
            request('/a.jpg?purge_key=secret', { headers: { 'x-purge': '1' } }),
            makeEnv(r2Object(1000), 'secret'),
            ctx,
        );
        expect(response.status).toBe(401);
    });

    it('purge avec la bonne clé en en-tête', async () => {
        photon.newFromByteslice.mockReturnValue(photon.makeImage(800, 600));
        const response = await worker.fetch(
            request('/w_400/a.jpg', { headers: { 'x-purge': '1', 'x-purge-key': 'secret' } }),
            makeEnv(r2Object(1000), 'secret'),
            ctx,
        );
        expect(response.status).toBe(200);
        expect(cache.delete).toHaveBeenCalledOnce();
    });

    it('redimensionne, libère l’image source et met en cache sans en-tête CORS', async () => {
        const source = photon.makeImage(1600, 1000);
        const resized = photon.makeImage(400, 250);
        photon.newFromByteslice.mockReturnValue(source);
        photon.resize.mockReturnValue(resized);

        const response = await worker.fetch(
            request('/w_400,q_70,f_webp/blog/a.jpg', { headers: { Origin: 'https://www.psaltery.org' } }),
            makeEnv(),
            ctx,
        );

        expect(response.headers.get('Content-Type')).toBe('image/jpeg');
        expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://www.psaltery.org');
        expect(response.headers.get('Vary')).toBe('Origin');
        expect(photon.resize).toHaveBeenCalledWith(source, 400, 250, 5);
        expect(resized.get_bytes_jpeg).toHaveBeenCalledWith(70);
        expect(source.free).toHaveBeenCalled();
        expect(resized.free).toHaveBeenCalled();
        const cached = cacheStore.get('https://images.miroirspolaires.fr/w_400,q_70,f_webp/blog/a.jpg');
        expect(cached?.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('ajoute l’origine de chaque requête à une réponse servie depuis le cache', async () => {
        cacheStore.set('https://images.miroirspolaires.fr/w_400/a.jpg', new Response('img'));
        const evil = await worker.fetch(
            request('/w_400/a.jpg', { headers: { Origin: 'https://miroirspolaires.fr.evil.com' } }),
            makeEnv(),
            ctx,
        );
        expect(evil.headers.get('Access-Control-Allow-Origin')).toBe('https://miroirspolaires.fr');
        const psaltery = await worker.fetch(
            request('/w_400/a.jpg', { headers: { Origin: 'https://psaltery.org' } }),
            makeEnv(),
            ctx,
        );
        expect(psaltery.headers.get('Access-Control-Allow-Origin')).toBe('https://psaltery.org');
    });

    it('sert les vignettes pré-générées sans passer par Photon', async () => {
        const response = await worker.fetch(request('/w_400/astrophotographies/mini/2025/1.jpg'), makeEnv(), ctx);
        expect(response.status).toBe(200);
        expect(response.headers.get('Cache-Control')).toContain('max-age=31536000');
        expect(photon.newFromByteslice).not.toHaveBeenCalled();
    });

    it('sert l’original au-delà de 1,8 MP en libérant l’image décodée', async () => {
        const huge = photon.makeImage(2000, 1000);
        photon.newFromByteslice.mockReturnValue(huge);
        const response = await worker.fetch(request('/w_400/a.jpg'), makeEnv(), ctx);
        expect(response.status).toBe(200);
        expect(photon.resize).not.toHaveBeenCalled();
        expect(huge.free).toHaveBeenCalled();
    });

    it('ne met pas en cache l’original servi après un échec d’encodage', async () => {
        const image = photon.makeImage(800, 600);
        image.get_bytes_jpeg.mockImplementation(() => {
            throw new Error('wasm trap');
        });
        photon.newFromByteslice.mockReturnValue(image);
        photon.resize.mockReturnValue(image);
        const response = await worker.fetch(request('/w_400/a.jpg'), makeEnv(), ctx);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        expect(cache.put).not.toHaveBeenCalled();
    });

    it('renvoie 404 sans recopier la clé demandée', async () => {
        const response = await worker.fetch(request('/w_400/<script>.jpg'), makeEnv(null), ctx);
        expect(response.status).toBe(404);
        expect(await response.text()).not.toContain('script');
    });
});
