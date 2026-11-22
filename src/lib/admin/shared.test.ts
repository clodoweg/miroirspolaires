// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import {
    isAcceptedArticleImage,
    requireAdmin,
    validateYear,
    validateSlug,
    validateFilename,
    safeResolve,
    fileExists,
    parseFrontmatter,
    yamlString,
    sanitizeFilename,
    uniqueFilename,
    jsonResponse,
    parseDeletableFolder,
    createUniqueHeaderTransform,
    ensureDir,
} from './shared';

describe('requireAdmin', () => {
    afterEach(() => vi.unstubAllEnvs());

    it('renvoie 404 hors dev et null en dev', async () => {
        vi.stubEnv('DEV', false);
        expect(requireAdmin({})?.status).toBe(404);
        expect(requireAdmin({ adminAccess: { mode: 'local' } })).toBeNull();
        vi.stubEnv('DEV', true);
        expect(requireAdmin({})).toBeNull();
    });
});

describe('validateurs de chemin', () => {
    it('valide année, slug et nom de fichier', () => {
        expect(validateYear('2026')).toBe(true);
        expect(validateYear('26')).toBe(false);
        expect(validateSlug('la-route-des-fjords')).toBe(true);
        expect(validateSlug('../etc')).toBe(false);
        expect(validateSlug('-debut')).toBe(false);
        expect(validateFilename('img-4.jpg')).toBe(true);
        expect(validateFilename('.env')).toBe(false);
        expect(validateFilename('a/b.jpg')).toBe(false);
    });
});

describe('safeResolve', () => {
    const root = path.resolve('/tmp/racine');

    it('résout un chemin sous la racine', () => {
        expect(safeResolve(root, 'blog', '2026')).toBe(path.join(root, 'blog', '2026'));
    });

    it('bloque toute sortie de la racine', () => {
        expect(() => safeResolve(root, '..', 'secret')).toThrow('Path traversal blocked');
        expect(() => safeResolve(root, 'blog/../../secret')).toThrow('Path traversal blocked');
        expect(() => safeResolve(root, '/etc/passwd')).toThrow('Path traversal blocked');
    });
});

describe('parseDeletableFolder', () => {
    it('accepte un dossier de média autorisé', () => {
        expect(parseDeletableFolder('blog/2025/sermilik')).toBe('blog/2025/sermilik');
        expect(parseDeletableFolder('voyages/')).toBe('voyages');
    });

    it.each([
        ['blog/..', 'remonterait à src/assets entier'],
        ['blog/../index', 'viserait un dossier versionné'],
        ['blog/../../assetsX', 'sortirait de src/assets'],
        ['blog\\..\\index', 'séparateurs Windows'],
        ['index/hero', 'dossier non autorisé'],
        ['blog//2025', 'segment vide'],
        ['blog/./2025', 'segment point'],
    ])('refuse %s (%s)', (folder) => {
        expect(parseDeletableFolder(folder)).toBeNull();
    });

    it('refuse une valeur non textuelle', () => {
        expect(parseDeletableFolder({ folder: 'blog' })).toBeNull();
    });
});

describe('parseFrontmatter', () => {
    it('lit scalaires, nombres, booléens, listes et le corps', () => {
        const source =
            '---\ntitle: "Mon titre"\nyear: 2026\ndraft: true\ncategories:\n  - Voyage\n  - "Nuit"\n---\nCorps du texte';
        const { data, body } = parseFrontmatter(source);
        expect(data).toMatchObject({ title: 'Mon titre', year: 2026, draft: true, categories: ['Voyage', 'Nuit'] });
        expect(body).toBe('Corps du texte');
    });

    it('renvoie le texte tel quel sans front-matter', () => {
        expect(parseFrontmatter('Pas de front-matter')).toEqual({ data: {}, body: 'Pas de front-matter' });
    });
});

describe('yamlString', () => {
    it('laisse nu un texte simple et cite le reste', () => {
        expect(yamlString('Une nuit claire')).toBe('Une nuit claire');
        expect(yamlString('')).toBe('""');
        expect(yamlString('titre: "piège"')).toBe('"titre: \\"piège\\""');
        expect(yamlString('2026 en images')).toBe('"2026 en images"');
        expect(yamlString('- liste')).toBe('"- liste"');
    });
});

describe('sanitizeFilename et uniqueFilename', () => {
    it('nettoie accents, espaces et chemins', () => {
        expect(sanitizeFilename('../Vue du Fjord É.JPG')).toBe('vue-du-fjord-e.jpg');
    });

    it('ajoute un suffixe si le fichier existe déjà', async () => {
        const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mp-unique-'));
        await fs.writeFile(path.join(directory, 'photo.jpg'), '');
        expect(await fileExists(path.join(directory, 'photo.jpg'))).toBe(true);
        const name = await uniqueFilename(directory, 'photo.jpg');
        expect(name).not.toBe('photo.jpg');
        expect(name.endsWith('.jpg')).toBe(true);
        expect(await fileExists(path.join(directory, name))).toBe(false);
        await fs.rm(directory, { recursive: true });
    });
});

describe('jsonResponse', () => {
    it('sérialise avec statut et en-têtes', async () => {
        const response = jsonResponse({ ok: 1 }, 201, { 'X-Test': 'oui' });
        expect(response.status).toBe(201);
        expect(response.headers.get('X-Test')).toBe('oui');
        expect(await response.json()).toEqual({ ok: 1 });
    });
});

describe('createUniqueHeaderTransform', () => {
    it('rend uniques les en-têtes CSV dupliqués', () => {
        const transform = createUniqueHeaderTransform();
        const headers = ['Nom', 'Nom', 'Date', 'Nom'].map((header, index) => transform(header, index));
        expect(new Set(headers).size).toBe(4);
        expect(headers[0]).toBe('Nom');
    });
});

describe('parseFrontmatter : lignes ignorées', () => {
    it('saute commentaires, lignes vides et lignes sans clé, et lit les nombres négatifs', () => {
        const { data } = parseFrontmatter("---\n# note\n\n  texte libre\nordre: -3\ntitre: 'Nuit'\nfaux: false\n---\n");
        expect(data).toEqual({ ordre: -3, titre: 'Nuit', faux: false });
    });
});

describe('createUniqueHeaderTransform : rappel sur le même index', () => {
    it('renvoie le même nom si PapaParse rappelle un index déjà vu', () => {
        const transform = createUniqueHeaderTransform();
        expect(transform(' Nom ', 0)).toBe('Nom');
        expect(transform('Nom', 1)).toBe('Nom_1');
        expect(transform('Autre', 1)).toBe('Nom_1');
    });
});

describe('ensureDir', () => {
    it('crée récursivement un dossier', async () => {
        const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mp-ensure-'));
        const nested = path.join(directory, 'a', 'b');
        await ensureDir(nested);
        expect((await fs.stat(nested)).isDirectory()).toBe(true);
        await fs.rm(directory, { recursive: true });
    });
});

describe('isAcceptedArticleImage', () => {
    it.each([
        ['photo.jpg', 'image/jpeg'],
        ['Photo.JPEG', 'image/jpeg'],
        ['anim.gif', 'image/gif'],
        ['a.webp', 'image/webp'],
        ['a.avif', 'image/avif'],
        ['a.png', null],
    ])('accepte %s (%s)', (filename, contentType) => {
        expect(isAcceptedArticleImage(filename, contentType)).toBe(true);
    });

    it.each([
        ['logo.svg', 'image/svg+xml'],
        ['logo.SVG', 'image/png'],
        ['logo.svgz', null],
        ['photo.jpg', 'image/svg+xml'],
        ['doc.pdf', 'application/pdf'],
    ])('refuse %s (%s)', (filename, contentType) => {
        expect(isAcceptedArticleImage(filename, contentType)).toBe(false);
    });
});
