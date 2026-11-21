// @vitest-environment node
/**
 * Route des images d'article : vrai dossier temporaire (process.cwd() redirigé),
 * compressImage mocké.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';

const imageProcess = vi.hoisted(() => ({ compressImage: vi.fn() }));
vi.mock('@/lib/admin/image-process', () => imageProcess);

type Route = typeof import('./[filename]');
type Context = Parameters<Route['GET']>[0];

let root: string;
let route: Route;
let dir: string;

function context(filename: string, year = '2026', slug = 'tromso') {
    return { params: { year, slug, filename } } as unknown as Context;
}

beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'mp-images-route-'));
    dir = path.join(root, 'src/assets/blog/2026/tromso');
    await fs.mkdir(dir, { recursive: true });
    vi.spyOn(process, 'cwd').mockReturnValue(root);
    vi.stubEnv('DEV', true);
    vi.stubEnv('PUBLIC_R2_URL', '');
    imageProcess.compressImage.mockReset();
    vi.resetModules();
    route = await import('./[filename]');
});

afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await fs.rm(root, { recursive: true, force: true });
});

describe('GET /api/admin/images/[year]/[slug]/[filename]', () => {
    it('sert le fichier local avec son type MIME', async () => {
        await fs.writeFile(path.join(dir, 'a.PNG'), 'png');
        await fs.writeFile(path.join(dir, 'b.raw'), 'raw');
        const png = await route.GET(context('a.PNG'));
        expect(png.status).toBe(200);
        expect(png.headers.get('Content-Type')).toBe('image/png');
        expect(png.headers.get('Cache-Control')).toBe('no-store');
        expect(await png.text()).toBe('png');
        expect((await route.GET(context('b.raw'))).headers.get('Content-Type')).toBe('application/octet-stream');
    });

    it('redirige vers R2 si le fichier manque localement, sinon 404', async () => {
        expect((await route.GET(context('absent.jpg'))).status).toBe(404);
        vi.stubEnv('PUBLIC_R2_URL', 'https://r2.example/');
        const response = await route.GET(context('absent.jpg'));
        expect(response.status).toBe(302);
        expect(response.headers.get('Location')).toBe('https://r2.example/blog/2026/tromso/absent.jpg');
    });

    it('renvoie 400 pour un paramètre invalide et 404 hors dev', async () => {
        expect((await route.GET(context('.env'))).status).toBe(400);
        expect((await route.PUT(context('a.jpg', '26'))).status).toBe(400);
        expect((await route.DELETE(context('a.jpg', '2026', 'A'))).status).toBe(400);
        vi.stubEnv('DEV', false);
        for (const handler of [route.GET, route.PUT, route.DELETE]) {
            expect((await handler(context('a.jpg'))).status).toBe(404);
        }
    });
});

describe('PUT /api/admin/images/[year]/[slug]/[filename] (couverture)', () => {
    it('génère la miniature de la couverture et supprime les autres miniatures', async () => {
        await fs.writeFile(path.join(dir, 'cover.png'), 'source');
        await fs.writeFile(path.join(dir, 'ancienne-thumb.jpg'), 'x');
        await fs.writeFile(path.join(dir, 'autre.jpg'), 'x');
        imageProcess.compressImage.mockResolvedValue({ full: {}, thumb: { buffer: Buffer.from('mini') } });

        const response = await route.PUT(context('cover.png'));

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            ok: true,
            cover: '/assets/blog/2026/tromso/cover.png',
            thumb: '/assets/blog/2026/tromso/cover-thumb.jpg',
        });
        const [buffer, name] = imageProcess.compressImage.mock.calls[0];
        expect([String(buffer), name]).toEqual(['source', 'cover.png']);
        expect(await fs.readFile(path.join(dir, 'cover-thumb.jpg'), 'utf-8')).toBe('mini');
        expect((await fs.readdir(dir)).sort()).toEqual(['autre.jpg', 'cover-thumb.jpg', 'cover.png']);
    });

    it('renvoie 404 si la source manque et 400 si aucune miniature n’est possible', async () => {
        expect((await route.PUT(context('absent.jpg'))).status).toBe(404);
        await fs.writeFile(path.join(dir, 'logo.svg'), '<svg/>');
        imageProcess.compressImage.mockResolvedValue({ full: {}, thumb: null });
        const response = await route.PUT(context('logo.svg'));
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: 'Thumbnail generation not supported for this file type' });
    });

    it('renvoie 500 si la compression échoue', async () => {
        await fs.writeFile(path.join(dir, 'casse.jpg'), 'x');
        imageProcess.compressImage.mockRejectedValue(new Error('sharp KO'));
        const response = await route.PUT(context('casse.jpg'));
        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: 'sharp KO' });
    });
});

describe('DELETE /api/admin/images/[year]/[slug]/[filename]', () => {
    it('supprime l’image et sa miniature', async () => {
        await fs.writeFile(path.join(dir, 'a.jpg'), 'x');
        await fs.writeFile(path.join(dir, 'a-thumb.jpg'), 'x');
        await fs.writeFile(path.join(dir, 'b.jpg'), 'x');
        const response = await route.DELETE(context('a.jpg'));
        expect(await response.json()).toEqual({ ok: true });
        expect(await fs.readdir(dir)).toEqual(['b.jpg']);
    });
});
