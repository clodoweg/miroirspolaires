// @vitest-environment node
/**
 * Tests de blog-files.ts sur un vrai dossier temporaire (process.cwd() redirigé).
 * sharp est mocké : aucun traitement d'image réel.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';

interface SharpChain {
    resize: () => SharpChain;
    jpeg: () => SharpChain;
    toBuffer: () => Promise<Buffer>;
}

const mocks = vi.hoisted(() => ({ toBuffer: vi.fn() }));

vi.mock('sharp', () => ({
    default: vi.fn(() => {
        const chain: SharpChain = {
            resize: () => chain,
            jpeg: () => chain,
            toBuffer: mocks.toBuffer,
        };
        return chain;
    }),
}));

type BlogModule = typeof import('./blog-files');
type SharedModule = typeof import('./shared');

const FM = {
    title: 'Aurores à Tromsø',
    date: '2026-02-01',
    categories: ['Voyages'],
    description: 'Une nuit sous les aurores.',
    image: '',
};

let root: string;
let lib: BlogModule;
let shared: SharedModule;

async function write(relative: string, content: string | Buffer = '') {
    const file = path.join(root, relative);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content);
    return file;
}

async function readJson(relative: string) {
    return JSON.parse(await fs.readFile(path.join(root, relative), 'utf-8'));
}

beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'mp-blog-'));
    // POURQUOI : src/data existe toujours dans le dépôt ; blog.json y est écrit sans mkdir.
    await fs.mkdir(path.join(root, 'src/data'), { recursive: true });
    vi.spyOn(process, 'cwd').mockReturnValue(root);
    mocks.toBuffer.mockReset();
    vi.resetModules();
    lib = await import('./blog-files');
    shared = await import('./shared');
});

afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await fs.rm(root, { recursive: true, force: true });
});

describe('gardes et chemins', () => {
    it('requireAdmin renvoie 404 hors dev sans accès accordé et null en dev', () => {
        vi.stubEnv('DEV', false);
        expect(shared.requireAdmin({})?.status).toBe(404);
        vi.stubEnv('DEV', true);
        expect(shared.requireAdmin({})).toBeNull();
    });

    it('construit les chemins sous src/content et src/assets', () => {
        expect(lib.postFilePath('2026', 'tromso')).toBe(path.join(root, 'src/content/blog/2026/tromso.md'));
        expect(lib.postAssetsDir('2026', 'tromso')).toBe(path.join(root, 'src/assets/blog/2026/tromso'));
        expect(lib.assetFilePath('2026', 'tromso', 'a.jpg')).toBe(path.join(root, 'src/assets/blog/2026/tromso/a.jpg'));
        expect(lib.publicImagePath('2026', 'tromso', 'a.jpg')).toBe('/assets/blog/2026/tromso/a.jpg');
    });

    it('refuse année, slug ou nom de fichier invalides', () => {
        expect(() => lib.postFilePath('26', 'tromso')).toThrow('Invalid year/slug');
        expect(() => lib.postAssetsDir('2026', '../x')).toThrow('Invalid year/slug');
        expect(() => lib.assetFilePath('2026', 'tromso', '.env')).toThrow('Invalid filename');
        expect(shared.validateSlug('a'.repeat(121))).toBe(false);
        expect(shared.validateFilename('a'.repeat(201))).toBe(false);
    });
});

describe('parseFrontmatter et stringifyFrontmatter', () => {
    it('ignore commentaires, lignes vides et lignes non clé-valeur', () => {
        const { data, body } = shared.parseFrontmatter(
            "---\n# commentaire\n\ntitle: 'Nuit'\n  orphelin\ndraft: false\nshowImage: true\n---\nCorps",
        );
        expect(data).toEqual({ title: 'Nuit', draft: false, showImage: true });
        expect(body).toBe('Corps');
    });

    it('écrit toutes les options et cite les valeurs à risque', () => {
        const out = lib.stringifyFrontmatter(
            {
                ...FM,
                categories: ['Voyages', 'Titre: piège'],
                seoDescription: 'SEO',
                image: '',
                showImage: false,
                draft: true,
                hideImageCaptions: true,
                title: '-tiret "guillemet"',
            },
            '\r\n\nCorps\r\nligne 2',
        );
        expect(out).toBe(
            [
                '---',
                'categories:',
                '- Voyages',
                '- "Titre: piège"',
                'date: "2026-02-01"',
                'description: Une nuit sous les aurores.',
                'seoDescription: SEO',
                'image: ""',
                'showImage: false',
                'draft: true',
                'hideImageCaptions: true',
                'title: "-tiret \\"guillemet\\""',
                '---',
                '',
                'Corps\nligne 2',
            ].join('\n'),
        );
    });

    it('écrit une liste de catégories vide en ligne', () => {
        expect(lib.stringifyFrontmatter({ ...FM, categories: [] }, 'x')).toContain('categories: []');
    });
});

describe('listPosts et readPost', () => {
    it('renvoie une liste vide sans dossier de contenu', async () => {
        expect(await lib.listPosts()).toEqual([]);
    });

    it('liste les articles par date décroissante en ignorant ce qui n’est pas un article', async () => {
        await write('src/content/blog/2025/ancien.md', '---\ntitle: Ancien\ndate: "2025-01-01"\n---\nA');
        await write(
            'src/content/blog/2026/recent.md',
            '---\ncategories:\n- Nuit\ndate: "2026-03-01"\ndraft: true\nimage: img.jpg\n---\nB',
        );
        await write('src/content/blog/2026/notes.txt', 'ignoré');
        await write('src/content/blog/brouillons/x.md', '---\ntitle: X\n---\n');
        await write('src/content/blog/2024', 'un fichier, pas un dossier');

        const posts = await lib.listPosts();

        expect(posts).toEqual([
            {
                year: '2026',
                slug: 'recent',
                title: 'recent',
                date: '2026-03-01',
                description: '',
                image: 'img.jpg',
                categories: ['Nuit'],
                draft: true,
            },
            {
                year: '2025',
                slug: 'ancien',
                title: 'Ancien',
                date: '2025-01-01',
                description: '',
                image: '',
                categories: [],
                draft: false,
            },
        ]);
    });

    it('lit un article complet et renvoie null s’il manque', async () => {
        expect(await lib.readPost('2026', 'absent')).toBeNull();
        await write(
            'src/content/blog/2026/complet.md',
            '---\ntitle: Complet\ndate: "2026-01-02"\ndescription: Desc\nseoDescription: Seo\nimage: a.jpg\nshowImage: false\ndraft: true\nhideImageCaptions: true\n---\nCorps',
        );
        expect(await lib.readPost('2026', 'complet')).toEqual({
            year: '2026',
            slug: 'complet',
            title: 'Complet',
            date: '2026-01-02',
            categories: [],
            description: 'Desc',
            seoDescription: 'Seo',
            image: 'a.jpg',
            showImage: false,
            draft: true,
            hideImageCaptions: true,
            body: 'Corps',
            revision: expect.stringMatching(/^[0-9a-f]{40}$/),
        });
        await write('src/content/blog/2026/vide.md', 'Sans front-matter');
        expect(await lib.readPost('2026', 'vide')).toMatchObject({
            title: '',
            seoDescription: undefined,
            showImage: true,
            draft: false,
            body: 'Sans front-matter',
        });
    });
});

describe('enrichPostMetadataAndAlts', () => {
    it('calcule le temps de lecture par formule sans rien écrire', async () => {
        const body = Array.from({ length: 400 }, () => 'mot').join(' ');

        const result = await lib.enrichPostMetadataAndAlts('2026', 'tromso', FM, body);

        expect(result.readingTime).toBe('2 min');
        expect(result.frontmatter.seoDescription).toBe(FM.description);
        expect(await shared.fileExists(path.join(root, 'src/data/blog.json'))).toBe(false);
    });

    it('normalise les URL d’images pour retrouver l’alt dans alt.json', async () => {
        await write(
            'src/data/alt.json',
            JSON.stringify({
                '/assets/blog/x/a.jpg': 'Alt A',
                '/assets/blog/x/b.jpg': 'Alt B',
                '/assets/blog/x/c.jpg': 'Alt C\tavec tabulation',
                'https://cdn.example/d.jpg': 'Alt D',
                '/assets/blog/x/e.jpg': 'Alt <think>corrompu</think>',
            }),
        );
        const body = [
            '![](src/assets/blog/x/a.jpg)',
            '![ ](assets/blog/x/b.jpg)',
            '![](/r2/assets/blog/x/c.jpg?w=3)',
            '![](https://cdn.example/d.jpg)',
            '![](/assets/blog/x/e.jpg)',
            '![vieux <think>raisonnement</think>](/assets/blog/x/f.jpg)',
        ].join('\n');

        const result = await lib.enrichPostMetadataAndAlts('2026', 'tromso', FM, body);

        expect(result.body.split('\n')).toEqual([
            '![Alt A](src/assets/blog/x/a.jpg)',
            '![Alt B](assets/blog/x/b.jpg)',
            '![Alt C\tavec tabulation](/r2/assets/blog/x/c.jpg?w=3)',
            '![Alt D](https://cdn.example/d.jpg)',
            '![](/assets/blog/x/e.jpg)',
            '![](/assets/blog/x/f.jpg)',
        ]);
    });
});

describe('enrichPostMetadataAndAlts sans alt connu', () => {
    it('laisse l’alt vide et n’écrit pas alt.json', async () => {
        await write('src/assets/blog/2026/tromso/aurore.jpg', 'brut');

        const result = await lib.enrichPostMetadataAndAlts(
            '2026',
            'tromso',
            FM,
            'Texte ![](/assets/blog/2026/tromso/aurore.jpg)',
        );

        expect(result.body).toBe('Texte ![](/assets/blog/2026/tromso/aurore.jpg)');
        await expect(fs.access(path.join(root, 'src/data/alt.json'))).rejects.toThrow();
    });

    it('ne touche pas à un alt déjà écrit dans le Markdown', async () => {
        const body = '![Mon alt relu](/assets/blog/2026/tromso/a.jpg)';
        const result = await lib.enrichPostMetadataAndAlts('2026', 'tromso', FM, body);
        expect(result.body).toBe(body);
    });
});

describe('écriture, suppression et renommage d’articles', () => {
    it('writePost écrit le fichier enrichi et crée le dossier d’assets', async () => {
        await write('src/data/blog.json', JSON.stringify({ '2025/autre': { id: '2025/autre', readingTime: '3 min' } }));
        const result = await lib.writePost('2026', 'tromso', FM, 'Corps');

        expect(await readJson('src/data/blog.json')).toEqual({
            '2025/autre': { id: '2025/autre', readingTime: '3 min' },
            '2026/tromso': { id: '2026/tromso', readingTime: '1 min' },
        });
        expect((await lib.readPost('2026', 'tromso'))?.revision).toBe(result.revision);

        const content = await fs.readFile(path.join(root, 'src/content/blog/2026/tromso.md'), 'utf-8');
        expect(content).toContain('title: "Aurores à Tromsø"');
        expect(content).toContain('seoDescription: Une nuit sous les aurores.');
        expect(content.endsWith('\nCorps')).toBe(true);
        expect((await fs.stat(path.join(root, 'src/assets/blog/2026/tromso'))).isDirectory()).toBe(true);
        expect(result.frontmatter.seoDescription).toBe(FM.description);
    });

    it('writePost refuse une révision périmée sans rien écrire', async () => {
        await lib.writePost('2026', 'tromso', FM, 'Corps');
        await expect(
            lib.writePost('2026', 'tromso', FM, 'Autre', { expectedRevision: 'f'.repeat(40) }),
        ).rejects.toThrow('modifié ailleurs');
        expect(await fs.readFile(path.join(root, 'src/content/blog/2026/tromso.md'), 'utf-8')).toMatch(/Corps$/);
        const current = await lib.readPost('2026', 'tromso');
        await expect(
            lib.writePost('2026', 'tromso', FM, 'Autre', { expectedRevision: current?.revision }),
        ).resolves.toMatchObject({ body: 'Autre' });
    });

    it('deletePost supprime l’article et, sur demande, ses assets', async () => {
        await write('src/content/blog/2026/a.md', 'x');
        await write('src/assets/blog/2026/a/img.jpg', 'x');
        await lib.deletePost('2026', 'a', false);
        expect(await shared.fileExists(path.join(root, 'src/content/blog/2026/a.md'))).toBe(false);
        expect(await shared.fileExists(path.join(root, 'src/assets/blog/2026/a/img.jpg'))).toBe(true);

        await lib.deletePost('2026', 'a', true);
        expect(await shared.fileExists(path.join(root, 'src/assets/blog/2026/a'))).toBe(false);
        await expect(lib.deletePost('2026', 'a', true)).resolves.toBeUndefined();
    });

    it('renamePostAssets déplace le dossier sauf si la cible existe déjà', async () => {
        await write('src/assets/blog/2025/brouillon/a.jpg', 'a');
        await lib.renamePostAssets('2025', 'brouillon', '2026', 'final');
        expect(await fs.readFile(path.join(root, 'src/assets/blog/2026/final/a.jpg'), 'utf-8')).toBe('a');
        expect(await shared.fileExists(path.join(root, 'src/assets/blog/2025/brouillon'))).toBe(false);

        await write('src/assets/blog/2026/autre/b.jpg', 'b');
        await lib.renamePostAssets('2026', 'autre', '2026', 'final');
        expect(await shared.fileExists(path.join(root, 'src/assets/blog/2026/autre/b.jpg'))).toBe(true);
        expect(await shared.fileExists(path.join(root, 'src/assets/blog/2026/final/b.jpg'))).toBe(false);
    });
});

describe('images d’article', () => {
    const DIR = 'src/assets/blog/2026/tromso';

    it('liste vide sans dossier, puis trie par date de prise de vue', async () => {
        expect(await lib.listImages('2026', 'tromso')).toEqual([]);

        const mtime = new Date('2020-01-01T00:00:00Z');
        await write(`${DIR}/dji_20250314123045.jpg`, 'x');
        await write(`${DIR}/PXL_20240101_080910.jpg`, 'x');
        await write(`${DIR}/signal-2023-05-06-101112.jpg`, 'x');
        await write(`${DIR}/exif.jpg`, 'aa 1970:01:01 00:00:00 bb 2022:07:08 09:10:11 cc 2022-07-09 10:00:00');
        const zero = await write(`${DIR}/zero.jpg`, '1970:01:01 00:00:00');
        const plain = await write(`${DIR}/plain.jpg`, '');
        await fs.utimes(zero, mtime, mtime);
        await fs.utimes(plain, mtime, mtime);
        await write(`${DIR}/vue-360.jpg`, 'x');
        await write(`${DIR}/couverture-thumb.jpg`, 'x');
        await fs.mkdir(path.join(root, DIR, 'sous-dossier'));
        await lib.mark360Image('2026', 'tromso', 'plain.jpg');

        const images = await lib.listImages('2026', 'tromso');

        expect(images.map((image) => [image.name, image.capturedAt, image.is360])).toEqual([
            ['plain.jpg', '2020-01-01T00:00:00', true],
            ['zero.jpg', '2020-01-01T00:00:00', false],
            ['exif.jpg', '2022-07-08T09:10:11', false],
            ['signal-2023-05-06-101112.jpg', '2023-05-06T10:11:12', false],
            ['PXL_20240101_080910.jpg', '2024-01-01T08:09:10', false],
            ['dji_20250314123045.jpg', '2025-03-14T12:30:45', false],
            ['vue-360.jpg', images.at(-1)?.capturedAt, true],
        ]);
        expect(images[0]).toMatchObject({ size: 0, dayKey: '2020-01-01', timeStr: '00:00' });
    });

    it('get360Manifest ignore un manifeste invalide ou qui n’est pas une liste', async () => {
        await write(`${DIR}/.360-manifest.json`, '{ invalide');
        expect(await lib.get360Manifest('2026', 'tromso')).toEqual(new Set());
        await write(`${DIR}/.360-manifest.json`, '{"a": 1}');
        expect(await lib.get360Manifest('2026', 'tromso')).toEqual(new Set());
        await lib.mark360Image('2026', 'tromso', 'b.jpg');
        expect(await readJson(`${DIR}/.360-manifest.json`)).toEqual(['b.jpg']);
    });

    it('saveImage nettoie le nom, évite les doublons sauf en mode écrasement', async () => {
        const data = new Uint8Array([1, 2, 3]);
        expect(await lib.saveImage('2026', 'tromso', 'Ma Photo É.JPG', data)).toBe('ma-photo-e.jpg');
        expect(await lib.saveImage('2026', 'tromso', 'Ma Photo É.JPG', data)).toBe('ma-photo-e-2.jpg');
        expect(await lib.saveImage('2026', 'tromso', 'Ma Photo É.JPG', new Uint8Array([9]), true)).toBe(
            'ma-photo-e.jpg',
        );
        expect([...(await fs.readFile(path.join(root, DIR, 'ma-photo-e.jpg')))]).toEqual([9]);
        await expect(lib.saveImage('2026', 'tromso', '...', data)).rejects.toThrow('Invalid filename');
    });

    it('deleteImage supprime l’image et sa miniature', async () => {
        await write(`${DIR}/a.png`, 'x');
        await write(`${DIR}/a-thumb.jpg`, 'x');
        await write(`${DIR}/b.jpg`, 'x');
        await lib.deleteImage('2026', 'tromso', 'a.png');
        await lib.deleteImage('2026', 'tromso', 'absent.jpg');
        expect((await fs.readdir(path.join(root, DIR))).sort()).toEqual(['b.jpg']);
    });
});
