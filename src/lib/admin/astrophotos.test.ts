// @vitest-environment node
/**
 * Tests de astrophotos.ts sur un vrai dossier temporaire (process.cwd() redirigé) :
 * CSV AstroBin, JSON de métadonnées et fichiers d'images factices.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';

type AstroModule = typeof import('./astrophotos');

let root: string;
let lib: AstroModule;

async function write(relative: string, content = '') {
    const file = path.join(root, relative);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content);
}

async function readJson(relative: string) {
    return JSON.parse(await fs.readFile(path.join(root, relative), 'utf-8'));
}

const CSV = [
    'ID,Title,Uploaded,Type,Constellation,Url,Title',
    '123,Nébuleuse d’Orion,2024-01-05,Nebula,Orion,https://astrobin.com/123,doublon',
    ',Sans identifiant,2024-01-01,,,,',
    '456,Galaxie M31,2023-11-02,Galaxy,Andromeda,https://astrobin.com/456,',
].join('\n');

beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'mp-astro-'));
    await fs.mkdir(path.join(root, 'src/data'), { recursive: true });
    vi.spyOn(process, 'cwd').mockReturnValue(root);
    vi.resetModules();
    lib = await import('./astrophotos');
});

afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(root, { recursive: true, force: true });
});

describe('listRecentPhotos', () => {
    it('renvoie une liste vide sans CSV', async () => {
        expect(await lib.listRecentPhotos()).toEqual([]);
    });

    it('croise le CSV avec les fichiers et les JSON de métadonnées', async () => {
        await write('data/astrobin_clodoweg_gallery_python.csv', CSV);
        await write('src/assets/astrophotographies/mini/2024/456_raw.jpg');
        await write('src/assets/astrophotographies/2024/orion/123_raw.jpg');
        await write('src/assets/astrophotographies/mini/2024/123_raw.jpg');
        await write('src/assets/astrophotographies/annotations/2024/123_annotation.svg');
        await write(
            'src/data/alt.json',
            JSON.stringify({ '/assets/astrophotographies/2024/123_raw.jpg': 'Orion en couleurs' }),
        );
        await write(
            'src/data/wikipedia.json',
            JSON.stringify({ '123': { description: 'Région HII', source: 'https://fr.wikipedia.org' }, '456': {} }),
        );
        await write(
            'src/data/astro_details.json',
            JSON.stringify({ '123': { object_type: 'Nébuleuse', distance_ly: 1344 } }),
        );
        await write('src/data/seo.json', JSON.stringify({ 'astrophotographies/nebuleuse-d-orion-123': 'SEO Orion' }));
        await write('src/data/drafts.json', JSON.stringify({ '456': true }));

        const photos = await lib.listRecentPhotos();

        expect(photos).toHaveLength(2);
        expect(photos[0]).toEqual({
            ID: '123',
            Title: 'Nébuleuse d’Orion',
            Uploaded: '2024-01-05',
            Type: 'Nebula',
            Constellation: 'Orion',
            Url: 'https://astrobin.com/123',
            year: '2024',
            hasRaw: true,
            hasMini: true,
            hasAlt: true,
            hasWiki: true,
            hasDetails: true,
            hasSeo: true,
            hasAnnotation: true,
            altText: 'Orion en couleurs',
            wikiDesc: 'Région HII',
            wikiSource: 'https://fr.wikipedia.org',
            techDetails: {
                discovery: null,
                object_type: 'Nébuleuse',
                dimensions_ly: null,
                distance_ly: 1344,
                apparent_dimensions: null,
                apparent_magnitude: null,
                apparent_radius: null,
                source_url: null,
            },
            seoDesc: 'SEO Orion',
            rawPath: path.join('src/assets/astrophotographies/2024/orion/123_raw.jpg'),
            miniPath: path.join('src/assets/astrophotographies/mini/2024/123_raw.jpg'),
            annotationPath: path.join('src/assets/astrophotographies/annotations/2024/123_annotation.svg'),
            draft: false,
        });
        expect(photos[1]).toMatchObject({
            ID: '456',
            year: '2023',
            hasRaw: false,
            hasMini: false,
            hasAlt: false,
            hasWiki: true,
            wikiDesc: '',
            hasDetails: false,
            techDetails: undefined,
            hasSeo: false,
            hasAnnotation: false,
            rawPath: undefined,
            miniPath: undefined,
            annotationPath: undefined,
            draft: true,
        });
    });

    it('respecte la limite et tolère des JSON illisibles', async () => {
        await write('data/astrobin_clodoweg_gallery_python.csv', CSV);
        await write('src/data/alt.json', '{ invalide');
        const photos = await lib.listRecentPhotos(1);
        expect(photos.map((photo) => photo.ID)).toEqual(['123']);
        expect(photos[0].hasAlt).toBe(false);
    });
});

describe('updatePhotoMetadata', () => {
    const TECH = {
        discovery: ' Messier ',
        object_type: '',
        dimensions_ly: 24,
        distance_ly: Number.NaN,
        apparent_dimensions: null,
        apparent_magnitude: 4,
        apparent_radius: null,
        source_url: ' https://source ',
    };

    it('écrit alt, wiki, détails, SEO et brouillon', async () => {
        await lib.updatePhotoMetadata('123', '2024', 'Nébuleuse d’Orion', {
            alt: ' Orion ',
            wiki: { description: ' Desc ', source: '' },
            tech: TECH,
            seo: ' SEO ',
            draft: true,
        });

        expect(await readJson('src/data/alt.json')).toEqual({ '/assets/astrophotographies/2024/123_raw.jpg': 'Orion' });
        expect(await readJson('src/data/wikipedia.json')).toEqual({
            '123': { id: '123', description: 'Desc', source: '' },
        });
        expect(await readJson('src/data/astro_details.json')).toEqual({
            '123': {
                id: '123',
                discovery: 'Messier',
                object_type: null,
                dimensions_ly: 24,
                distance_ly: null,
                apparent_dimensions: null,
                apparent_magnitude: 4,
                apparent_radius: null,
                source_url: 'https://source',
            },
        });
        expect(await readJson('src/data/seo.json')).toEqual({ 'astrophotographies/nebuleuse-d-orion-123': 'SEO' });
        expect(await readJson('src/data/drafts.json')).toEqual({ '123': true });
    });

    it('supprime les entrées quand les valeurs sont vides', async () => {
        await lib.updatePhotoMetadata('123', '2024', 'M42', {
            alt: 'a',
            wiki: { source: 's' },
            tech: TECH,
            seo: 's',
            draft: true,
        });
        await write(
            'src/data/alt.json',
            JSON.stringify({ '/assets/astrophotographies/2024/123_raw.jpg': 'a', autre: 'b' }),
        );

        await lib.updatePhotoMetadata('123', '2024', 'M42', {
            alt: '  ',
            wiki: {},
            tech: null as unknown as typeof TECH,
            seo: '',
            draft: false,
        });

        expect(await readJson('src/data/alt.json')).toEqual({ autre: 'b' });
        expect(await readJson('src/data/wikipedia.json')).toEqual({});
        expect(await readJson('src/data/astro_details.json')).toEqual({});
        expect(await readJson('src/data/seo.json')).toEqual({});
        expect(await readJson('src/data/drafts.json')).toEqual({});
    });

    it('ne touche à aucun fichier sans données et refuse id ou année invalides', async () => {
        await lib.updatePhotoMetadata('123', '2024', 'M42', {});
        expect(await fs.readdir(path.join(root, 'src/data'))).toEqual([]);
        await expect(lib.updatePhotoMetadata('12a', '2024', 'M42', {})).rejects.toThrow('ID invalide');
        await expect(lib.updatePhotoMetadata('123', '24', 'M42', {})).rejects.toThrow('Année invalide');
    });
});

describe('uploadRaw', () => {
    it('écrit le fichier brut dans le dossier de l’année', async () => {
        const result = await lib.uploadRaw('123', '2024', new Uint8Array([1, 2]));
        expect(result).toEqual({ path: path.join('src/assets/astrophotographies/2024/123_raw.jpg') });
        expect([...(await fs.readFile(path.join(root, result.path)))]).toEqual([1, 2]);
    });

    it('refuse id ou année invalides', async () => {
        await expect(lib.uploadRaw('../1', '2024', new Uint8Array())).rejects.toThrow('Invalid ID');
        await expect(lib.uploadRaw('1', '20xx', new Uint8Array())).rejects.toThrow('Invalid year');
    });
});

describe('sources de l’admin distant', () => {
    const memoryReader = (files: Record<string, string>) => ({
        readText: async (relativePath: string) => files[relativePath] ?? null,
        listDir: async () => null,
    });

    it('lit le CSV et les JSON par le lecteur, et les fichiers par l’index R2', async () => {
        const { buildAstroAssetIndex } = await import('./astro-asset-index');
        const photos = await lib.listRecentPhotos(10, {
            reader: memoryReader({
                'data/astrobin_clodoweg_gallery_python.csv': CSV,
                'src/data/drafts.json': JSON.stringify({ '123': true }),
            }),
            assets: buildAstroAssetIndex(
                ['astrophotographies/2024/123_raw.jpg', 'astrophotographies/mini/2023/456_raw.jpg'],
                'r2',
            ),
        });
        expect(photos[0]).toMatchObject({
            ID: '123',
            hasRaw: true,
            rawPath: 'R2 : astrophotographies/2024/123_raw.jpg',
            hasMini: false,
            draft: true,
        });
        expect(photos[1]).toMatchObject({ ID: '456', hasRaw: false, hasMini: true });
    });

    it('enregistre toute la fiche en un seul commit, sans toucher au CSV', async () => {
        const commit = vi.fn().mockResolvedValue({ commitSha: 'abc' });
        await lib.updatePhotoMetadata(
            '123',
            '2024',
            'M42',
            { alt: 'Orion', seo: 'Description', draft: false },
            { reader: memoryReader({ 'src/data/alt.json': JSON.stringify({ autre: 'b' }) }), writer: { commit } },
        );
        expect(commit).toHaveBeenCalledTimes(1);
        const [changes, message] = commit.mock.calls[0];
        expect(message).toBe("Admin : fiche de l'astrophoto 123");
        expect(changes.map((change: { path: string }) => change.path)).toEqual([
            'src/data/alt.json',
            'src/data/seo.json',
            'src/data/drafts.json',
        ]);
        expect(JSON.parse(changes[0].content)).toEqual({
            autre: 'b',
            '/assets/astrophotographies/2024/123_raw.jpg': 'Orion',
        });
    });

    it('ne crée aucun commit sans champ à modifier', async () => {
        const commit = vi.fn();
        await lib.updatePhotoMetadata('123', '2024', 'M42', {}, { reader: memoryReader({}), writer: { commit } });
        expect(commit).not.toHaveBeenCalled();
    });
});
