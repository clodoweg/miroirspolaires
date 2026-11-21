// @vitest-environment node
/**
 * Tests de voyages-files.ts sur un vrai dossier temporaire (process.cwd() redirigé).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';

type VoyagesModule = typeof import('./voyages-files');

let root: string;
let lib: VoyagesModule;

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
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'mp-voyages-'));
    vi.spyOn(process, 'cwd').mockReturnValue(root);
    vi.resetModules();
    lib = await import('./voyages-files');
});

afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(root, { recursive: true, force: true });
});

describe('chemins', () => {
    it('construit les chemins de contenu, d’assets et relatifs', () => {
        expect(lib.postFilePath('2025', 'troms')).toBe(path.join(root, 'src/content/voyages/2025/troms.md'));
        expect(lib.postAssetsDir('2025', 'troms')).toBe(path.join(root, 'src/assets/voyages/2025/troms'));
        expect(lib.assetFilePath('2025', 'troms', 'a.jpg')).toBe(
            path.join(root, 'src/assets/voyages/2025/troms/a.jpg'),
        );
        expect(lib.relImagePath('2025', 'troms', 'a.jpg')).toBe('../../../assets/voyages/2025/troms/a.jpg');
    });

    it('refuse les paramètres invalides', () => {
        expect(() => lib.postFilePath('25', 'troms')).toThrow('Invalid year/slug');
        expect(() => lib.postAssetsDir('2025', 'Troms')).toThrow('Invalid year/slug');
        expect(() => lib.assetFilePath('2025', 'troms', '../x')).toThrow('Invalid filename');
    });
});

describe('writeVoyage et readVoyage', () => {
    it('écrit tous les champs puis les relit à l’identique', async () => {
        const frontmatter = {
            title: 'Troms en hiver',
            date: '2025-02-01',
            description: 'Nuits polaires',
            image: '../../../assets/voyages/2025/troms/cover.jpg',
            gallery: ['../../../assets/voyages/2025/troms/a.jpg', '../../../assets/voyages/2025/troms/b.jpg'],
            country: ['Norvège', 'Suède'],
            season: 'Hiver' as const,
            year: 2025,
            draft: true,
        };
        const { revision } = await lib.writeVoyage('2025', 'troms', frontmatter, '\r\n\nRécit\r\nfin');

        const raw = await fs.readFile(path.join(root, 'src/content/voyages/2025/troms.md'), 'utf-8');
        expect(raw).toBe(
            [
                '---',
                'title: Troms en hiver',
                'date: "2025-02-01"',
                'description: Nuits polaires',
                'image: "../../../assets/voyages/2025/troms/cover.jpg"',
                'gallery:',
                '  - "../../../assets/voyages/2025/troms/a.jpg"',
                '  - "../../../assets/voyages/2025/troms/b.jpg"',
                'country:',
                '  - Norvège',
                '  - Suède',
                'season: Hiver',
                'year: 2025',
                'draft: true',
                '---',
                '',
                'Récit\nfin',
            ].join('\n'),
        );
        expect(await exists('src/assets/voyages/2025/troms')).toBe(true);
        expect(await lib.readVoyage('2025', 'troms')).toEqual({
            ...frontmatter,
            dirYear: '2025',
            slug: 'troms',
            body: '\nRécit\nfin',
            revision,
        });
        await expect(
            lib.writeVoyage('2025', 'troms', frontmatter, 'x', { expectedRevision: 'f'.repeat(40) }),
        ).rejects.toThrow('modifié ailleurs');
    });

    it('omet les champs facultatifs et accepte un pays unique', async () => {
        await lib.writeVoyage('2024', 'islande', { title: 'Islande', image: '', gallery: [], country: 'Islande' }, 'x');
        const raw = await fs.readFile(path.join(root, 'src/content/voyages/2024/islande.md'), 'utf-8');
        expect(raw).toBe('---\ntitle: Islande\ndescription: ""\nimage: ""\ncountry: Islande\n---\n\nx');
        expect(await lib.readVoyage('2024', 'islande')).toEqual({
            dirYear: '2024',
            slug: 'islande',
            title: 'Islande',
            date: undefined,
            description: '',
            image: '',
            gallery: [],
            country: 'Islande',
            season: undefined,
            year: undefined,
            draft: false,
            body: '\nx',
            revision: expect.stringMatching(/^[0-9a-f]{40}$/),
        });
    });

    it('renvoie null pour un voyage absent et des valeurs vides sans front-matter', async () => {
        expect(await lib.readVoyage('2025', 'absent')).toBeNull();
        await write('src/content/voyages/2025/brut.md', 'Texte seul');
        expect(await lib.readVoyage('2025', 'brut')).toMatchObject({
            title: '',
            image: '',
            gallery: [],
            body: 'Texte seul',
        });
    });
});

describe('listVoyages', () => {
    it('renvoie une liste vide sans dossier', async () => {
        expect(await lib.listVoyages()).toEqual([]);
    });

    it('liste les voyages triés par année et slug décroissants', async () => {
        await write('src/content/voyages/2024/islande.md', '---\ntitle: Islande\nyear: 2024\nseason: Été\n---\n');
        await write(
            'src/content/voyages/2025/troms.md',
            '---\ndescription: D\nimage: c.jpg\ncountry: Norvège\ndraft: true\n---\n',
        );
        await write('src/content/voyages/2025/notes.txt', 'ignoré');
        await write('src/content/voyages/divers/x.md', '');
        await write('src/content/voyages/2023', 'fichier');

        expect(await lib.listVoyages()).toEqual([
            {
                year: '2025',
                slug: 'troms',
                title: 'troms',
                description: 'D',
                image: 'c.jpg',
                country: 'Norvège',
                season: undefined,
                yearMeta: undefined,
                draft: true,
            },
            {
                year: '2024',
                slug: 'islande',
                title: 'Islande',
                description: '',
                image: '',
                country: undefined,
                season: 'Été',
                yearMeta: 2024,
                draft: false,
            },
        ]);
    });
});

describe('deleteVoyage', () => {
    it('supprime le markdown et, sur demande, les assets', async () => {
        await write('src/content/voyages/2025/troms.md', 'x');
        await write('src/assets/voyages/2025/troms/a.jpg', 'x');
        await lib.deleteVoyage('2025', 'troms', false);
        expect(await exists('src/content/voyages/2025/troms.md')).toBe(false);
        expect(await exists('src/assets/voyages/2025/troms/a.jpg')).toBe(true);
        await lib.deleteVoyage('2025', 'troms', true);
        expect(await exists('src/assets/voyages/2025/troms')).toBe(false);
        await expect(lib.deleteVoyage('2025', 'troms', true)).resolves.toBeUndefined();
    });
});

describe('images de voyage', () => {
    const DIR = 'src/assets/voyages/2025/troms';

    it('liste les images par ordre naturel, sans miniatures ni fichiers cachés', async () => {
        expect(await lib.listImages('2025', 'troms')).toEqual([]);
        await write(`${DIR}/img-10.jpg`, '1234');
        await write(`${DIR}/img-2.jpg`, '12');
        await write(`${DIR}/cover.jpg`, '1');
        await write(`${DIR}/cover-thumb.jpg`, '1');
        await write(`${DIR}/.DS_Store`, '1');
        await fs.mkdir(path.join(root, DIR, 'sous-dossier'));

        expect(await lib.listImages('2025', 'troms')).toEqual([
            { name: 'cover.jpg', size: 1, rel: '../../../assets/voyages/2025/troms/cover.jpg' },
            { name: 'img-2.jpg', size: 2, rel: '../../../assets/voyages/2025/troms/img-2.jpg' },
            { name: 'img-10.jpg', size: 4, rel: '../../../assets/voyages/2025/troms/img-10.jpg' },
        ]);
    });

    it('saveImage nettoie le nom et gère doublons et écrasement', async () => {
        const data = new Uint8Array([1]);
        expect(await lib.saveImage('2025', 'troms', 'Fjord Été.JPG', data)).toBe('fjord-ete.jpg');
        expect(await lib.saveImage('2025', 'troms', 'Fjord Été.JPG', data)).toBe('fjord-ete-2.jpg');
        expect(await lib.saveImage('2025', 'troms', 'Fjord Été.JPG', new Uint8Array([7]), true)).toBe('fjord-ete.jpg');
        expect([...(await fs.readFile(path.join(root, DIR, 'fjord-ete.jpg')))]).toEqual([7]);
        await expect(lib.saveImage('2025', 'troms', '.cache', data)).rejects.toThrow('Invalid filename');
    });

    it('deleteImage déplace l’image dans la corbeille, avec suffixe en cas de collision', async () => {
        vi.spyOn(Date, 'now').mockReturnValue(1234);
        await write(`${DIR}/a.jpg`, 'premier');
        await lib.deleteImage('2025', 'troms', 'a.jpg');
        await write(`${DIR}/a.jpg`, 'second');
        await lib.deleteImage('2025', 'troms', 'a.jpg');
        await lib.deleteImage('2025', 'troms', 'absent.jpg');

        expect(await exists(`${DIR}/a.jpg`)).toBe(false);
        const trash = path.join(root, '.admin-trash/voyages/2025/troms');
        expect((await fs.readdir(trash)).sort()).toEqual(['a-1234.jpg', 'a.jpg']);
        expect(await fs.readFile(path.join(trash, 'a-1234.jpg'), 'utf-8')).toBe('second');
    });
});
