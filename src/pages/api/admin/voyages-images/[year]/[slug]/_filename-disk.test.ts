// @vitest-environment node
/**
 * Route des images de voyage : GET, PUT (couverture) et cas de DELETE sur un vrai dossier
 * temporaire (process.cwd() redirigé), compressImage mocké. La réécriture de la galerie
 * à la suppression est couverte par _filename.test.ts.
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

function context(filename: string, year = '2025', slug = 'troms') {
    return { params: { year, slug, filename } } as unknown as Context;
}

beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'mp-voyages-images-'));
    dir = path.join(root, 'src/assets/voyages/2025/troms');
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

describe('GET /api/admin/voyages-images/[year]/[slug]/[filename]', () => {
    it('sert le fichier local avec son type MIME', async () => {
        await fs.writeFile(path.join(dir, 'a.webp'), 'webp');
        await fs.writeFile(path.join(dir, 'b.bin'), 'bin');
        const response = await route.GET(context('a.webp'));
        expect(response.headers.get('Content-Type')).toBe('image/webp');
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        expect(await response.text()).toBe('webp');
        expect((await route.GET(context('b.bin'))).headers.get('Content-Type')).toBe('application/octet-stream');
    });

    it('redirige vers R2 si le fichier manque localement, sinon 404', async () => {
        expect((await route.GET(context('absent.jpg'))).status).toBe(404);
        vi.stubEnv('PUBLIC_R2_URL', 'https://r2.example');
        const response = await route.GET(context('absent.jpg'));
        expect(response.status).toBe(302);
        expect(response.headers.get('Location')).toBe('https://r2.example/voyages/2025/troms/absent.jpg');
    });

    it('renvoie 400 pour un paramètre invalide et 404 hors dev', async () => {
        expect((await route.GET(context('../a.jpg'))).status).toBe(400);
        expect((await route.PUT(context('a.jpg', '25'))).status).toBe(400);
        vi.stubEnv('DEV', false);
        for (const handler of [route.GET, route.PUT, route.DELETE]) {
            expect((await handler(context('a.jpg'))).status).toBe(404);
        }
    });
});

describe('PUT /api/admin/voyages-images/[year]/[slug]/[filename] (couverture)', () => {
    it('copie la source en cover.jpg, régénère cover-thumb.jpg et purge les autres miniatures', async () => {
        await fs.writeFile(path.join(dir, 'fjord.jpg'), 'source');
        await fs.writeFile(path.join(dir, 'cover.jpg'), 'ancienne');
        await fs.writeFile(path.join(dir, 'cover-thumb.jpg'), 'ancienne');
        await fs.writeFile(path.join(dir, 'vieux-thumb.jpg'), 'x');
        imageProcess.compressImage.mockResolvedValue({ full: {}, thumb: { buffer: Buffer.from('mini') } });

        const response = await route.PUT(context('fjord.jpg'));

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ ok: true });
        expect(await fs.readFile(path.join(dir, 'cover.jpg'), 'utf-8')).toBe('source');
        expect(await fs.readFile(path.join(dir, 'cover-thumb.jpg'), 'utf-8')).toBe('mini');
        expect((await fs.readdir(dir)).sort()).toEqual(['cover-thumb.jpg', 'cover.jpg', 'fjord.jpg']);
        const [buffer, name] = imageProcess.compressImage.mock.calls[0];
        expect([String(buffer), name]).toEqual(['source', 'cover.jpg']);
    });

    it('garde l’image quand on re-choisit la couverture actuelle (cover.jpg)', async () => {
        await fs.writeFile(path.join(dir, 'cover.jpg'), 'couverture');
        imageProcess.compressImage.mockResolvedValue({ full: {}, thumb: { buffer: Buffer.from('mini') } });

        const response = await route.PUT(context('cover.jpg'));

        expect(response.status).toBe(200);
        expect(await fs.readFile(path.join(dir, 'cover.jpg'), 'utf-8')).toBe('couverture');
        expect(await fs.readFile(path.join(dir, 'cover-thumb.jpg'), 'utf-8')).toBe('mini');
    });

    it('n’écrit pas de miniature si compressImage n’en produit pas', async () => {
        await fs.writeFile(path.join(dir, 'anim.gif'), 'gif');
        imageProcess.compressImage.mockResolvedValue({ full: {}, thumb: null });
        expect((await route.PUT(context('anim.gif'))).status).toBe(200);
        expect((await fs.readdir(dir)).sort()).toEqual(['anim.gif', 'cover.jpg']);
    });

    it('renvoie 404 sans source et 500 si la compression échoue', async () => {
        expect((await route.PUT(context('absent.jpg'))).status).toBe(404);
        await fs.writeFile(path.join(dir, 'casse.jpg'), 'x');
        imageProcess.compressImage.mockRejectedValue(new Error('sharp KO'));
        const response = await route.PUT(context('casse.jpg'));
        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: 'Impossible de définir la couverture' });
    });
});

describe('DELETE /api/admin/voyages-images/[year]/[slug]/[filename] (disque réel)', () => {
    it('met l’image à la corbeille sans réécrire le markdown si elle n’y figure pas', async () => {
        const content = path.join(root, 'src/content/voyages/2025/troms.md');
        await fs.mkdir(path.dirname(content), { recursive: true });
        await fs.writeFile(content, '---\ntitle: Troms\nimage: ""\n---\nRécit');
        await fs.writeFile(path.join(dir, 'a.jpg'), 'x');

        const response = await route.DELETE(context('a.jpg'));

        expect(await response.json()).toEqual({ ok: true, mdPruned: false });
        expect(await fs.readdir(dir)).toEqual([]);
        expect(await fs.readdir(path.join(root, '.admin-trash/voyages/2025/troms'))).toEqual(['a.jpg']);
        expect(await fs.readFile(content, 'utf-8')).toBe('---\ntitle: Troms\nimage: ""\n---\nRécit');
    });

    it('fonctionne sans markdown associé', async () => {
        await fs.writeFile(path.join(dir, 'b.png'), 'x');
        const response = await route.DELETE(context('b.png'));
        expect(await response.json()).toEqual({ ok: true, mdPruned: false });
        expect(await fs.readdir(dir)).toEqual([]);
    });
});
