// @vitest-environment node
/**
 * Tests de content-files.ts sur un vrai dossier temporaire (process.cwd() redirigé).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';

type ContentModule = typeof import('./content-files');

let root: string;
let lib: ContentModule;

async function write(relative: string, content = '') {
    const file = path.join(root, relative);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content);
    return file;
}

async function exists(relative: string) {
    return fs.access(path.join(root, relative)).then(
        () => true,
        () => false,
    );
}

beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'mp-content-'));
    vi.spyOn(process, 'cwd').mockReturnValue(root);
    vi.resetModules();
    lib = await import('./content-files');
});

afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(root, { recursive: true, force: true });
});

describe('createContentLocator', () => {
    it('résout les chemins de la section sous src/content et src/assets', () => {
        const locator = lib.createContentLocator('voyages');
        expect(locator.contentRoot).toBe(path.join(root, 'src/content/voyages'));
        expect(locator.assetsRoot).toBe(path.join(root, 'src/assets/voyages'));
        expect(locator.postFilePath('2026', 'tromso')).toBe(path.join(root, 'src/content/voyages/2026/tromso.md'));
        expect(locator.postAssetsDir('2026', 'tromso')).toBe(path.join(root, 'src/assets/voyages/2026/tromso'));
        expect(locator.assetFilePath('2026', 'tromso', 'a.jpg')).toBe(
            path.join(root, 'src/assets/voyages/2026/tromso/a.jpg'),
        );
    });

    it('refuse année, slug ou nom de fichier invalides', () => {
        const locator = lib.createContentLocator('blog');
        expect(() => locator.postFilePath('26', 'x')).toThrow('Invalid year/slug');
        expect(() => locator.postAssetsDir('2026', '../x')).toThrow('Invalid year/slug');
        expect(() => locator.assetFilePath('2026', 'x', '.env')).toThrow('Invalid filename');
    });
});

describe('listMarkdownEntries', () => {
    it('renvoie un tableau vide sans racine', async () => {
        expect(await lib.listMarkdownEntries(path.join(root, 'absent'))).toEqual([]);
    });

    it('lit le frontmatter des fichiers <année>/<slug>.md et ignore le reste', async () => {
        await write('src/content/blog/2026/a.md', '---\ntitle: A\nyear: 2026\n---\nCorps');
        await write('src/content/blog/2026/notes.txt', 'x');
        await write('src/content/blog/brouillons/b.md', '---\ntitle: B\n---\n');
        await write('src/content/blog/2025', 'fichier, pas dossier');
        const entries = await lib.listMarkdownEntries(path.join(root, 'src/content/blog'));
        expect(entries).toEqual([{ year: '2026', slug: 'a', data: { title: 'A', year: 2026 } }]);
    });
});

describe('deleteContentEntry', () => {
    it('supprime le markdown et, sur demande, le dossier d’images', async () => {
        const locator = lib.createContentLocator('blog');
        await write('src/content/blog/2026/a.md', 'x');
        await write('src/assets/blog/2026/a/img.jpg', 'x');
        await lib.deleteContentEntry(locator, '2026', 'a', false);
        expect(await exists('src/content/blog/2026/a.md')).toBe(false);
        expect(await exists('src/assets/blog/2026/a/img.jpg')).toBe(true);
        await lib.deleteContentEntry(locator, '2026', 'a', true);
        expect(await exists('src/assets/blog/2026/a')).toBe(false);
        await expect(lib.deleteContentEntry(locator, '2026', 'a', true)).resolves.toBeUndefined();
    });
});

describe('saveImageInDir', () => {
    it('assainit le nom, suffixe les doublons et écrase sur demande', async () => {
        const dir = path.join(root, 'src/assets/blog/2026/a');
        expect(await lib.saveImageInDir(dir, 'Été Nuit.JPG', new Uint8Array([1]))).toBe('ete-nuit.jpg');
        expect(await lib.saveImageInDir(dir, 'ete-nuit.jpg', new Uint8Array([2]))).toBe('ete-nuit-2.jpg');
        expect(await lib.saveImageInDir(dir, 'ete-nuit.jpg', new Uint8Array([3]), true)).toBe('ete-nuit.jpg');
        expect([...(await fs.readFile(path.join(dir, 'ete-nuit.jpg')))]).toEqual([3]);
    });

    it('refuse un nom vide après assainissement', async () => {
        await expect(lib.saveImageInDir(path.join(root, 'd'), '***', new Uint8Array())).rejects.toThrow(
            'Invalid filename',
        );
    });
});
