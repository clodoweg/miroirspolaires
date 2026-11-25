/**
 * Helpers disque communs aux sections de contenu éditées par l'admin (blog et voyages).
 *
 * Responsabilité : résoudre les chemins `<année>/<slug>` du markdown et des assets, parcourir
 * les fichiers markdown d'une section, supprimer une entrée et enregistrer une image uploadée.
 * Les particularités de chaque section (frontmatter, miniatures, manifeste 360°, corbeille des
 * voyages) restent dans `blog-files.ts` et `voyages-files.ts`.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
    ensureDir,
    fileExists,
    parseFrontmatter,
    safeResolve,
    sanitizeFilename,
    uniqueFilename,
    validateFilename,
    validateSlug,
    validateYear,
} from './shared';
import { createFsContentReader, type ContentReader } from './stores/content-reader';

export type ContentSection = 'blog' | 'voyages';

export interface ContentLocator {
    /** Racine des fichiers markdown (`src/content/<section>`). */
    contentRoot: string;
    /** Racine des images (`src/assets/<section>`). */
    assetsRoot: string;
    /** Chemin du fichier markdown `<année>/<slug>.md`. Lève une erreur si l'année ou le slug est invalide. */
    postFilePath(year: string, slug: string): string;
    /** Dossier des images `<année>/<slug>/`. Lève une erreur si l'année ou le slug est invalide. */
    postAssetsDir(year: string, slug: string): string;
    /** Chemin d'une image du dossier de l'entrée. Lève une erreur si le nom de fichier est invalide. */
    assetFilePath(year: string, slug: string, filename: string): string;
}

/**
 * Construit les résolveurs de chemins d'une section de contenu.
 *
 * POURQUOI : les racines dépendent de `process.cwd()` au moment de l'appel ; chaque module de
 * section appelle cette fonction à son chargement, comme le faisaient ses constantes historiques
 * (les tests sur disque changent `cwd` puis réimportent le module).
 *
 * WARNING: chaque chemin passe par la validation de l'année, du slug ou du nom de fichier puis
 * par `safeResolve` ; ne pas contourner ces contrôles, les routes admin écrivent sur le disque.
 *
 * @param section - Section de contenu (`blog` ou `voyages`).
 * @returns Les racines et les trois résolveurs de chemins de la section.
 */
export function createContentLocator(section: ContentSection): ContentLocator {
    const contentRoot = path.join(process.cwd(), 'src/content', section);
    const assetsRoot = path.join(process.cwd(), 'src/assets', section);

    function postFilePath(year: string, slug: string): string {
        if (!validateYear(year) || !validateSlug(slug)) throw new Error('Invalid year/slug');
        return safeResolve(contentRoot, year, `${slug}.md`);
    }

    function postAssetsDir(year: string, slug: string): string {
        if (!validateYear(year) || !validateSlug(slug)) throw new Error('Invalid year/slug');
        return safeResolve(assetsRoot, year, slug);
    }

    function assetFilePath(year: string, slug: string, filename: string): string {
        if (!validateFilename(filename)) throw new Error('Invalid filename');
        return path.join(postAssetsDir(year, slug), filename);
    }

    return { contentRoot, assetsRoot, postFilePath, postAssetsDir, assetFilePath };
}

export interface MarkdownEntry {
    year: string;
    slug: string;
    data: Record<string, unknown>;
}

/**
 * Parcourt les fichiers `<année>/<slug>.md` d'une racine de contenu sur le disque et lit leur frontmatter.
 *
 * @param contentRoot - Racine de la section (`src/content/blog`, `src/content/voyages`).
 * @returns Les entrées dans l'ordre du système de fichiers (le tri revient à l'appelant), ou un
 *   tableau vide si la racine n'existe pas.
 */
export async function listMarkdownEntries(contentRoot: string): Promise<MarkdownEntry[]> {
    return listMarkdownEntriesWith(createFsContentReader(contentRoot), '');
}

/**
 * Parcourt les fichiers `<année>/<slug>.md` d'une racine lue par un `ContentReader` (disque ou GitHub).
 *
 * @param reader - Source des fichiers.
 * @param relativeRoot - Racine relative (`src/content/blog`), ou `''` si le lecteur y est déjà enraciné.
 * @returns Les entrées dans l'ordre de la source, ou un tableau vide si la racine n'existe pas.
 */
export async function listMarkdownEntriesWith(reader: ContentReader, relativeRoot: string): Promise<MarkdownEntry[]> {
    const sources = await listMarkdownSources(reader, relativeRoot);
    return sources.map(({ year, slug, markdown }) => ({ year, slug, data: parseFrontmatter(markdown).data }));
}

export interface MarkdownSource {
    year: string;
    slug: string;
    /** Contenu brut du fichier, frontmatter compris. */
    markdown: string;
}

/**
 * Lit le contenu brut des fichiers `<année>/<slug>.md` d'une racine lue par un `ContentReader`.
 *
 * @param reader - Source des fichiers (disque ou GitHub).
 * @param relativeRoot - Racine relative (`src/content/blog`), ou `''` si le lecteur y est déjà enraciné.
 * @returns Les fichiers dans l'ordre de la source, ou un tableau vide si la racine n'existe pas.
 */
export async function listMarkdownSources(reader: ContentReader, relativeRoot: string): Promise<MarkdownSource[]> {
    const markdownFiles = await listMarkdownFiles(reader, relativeRoot);
    // POURQUOI : en lecture GitHub, chaque fichier est un appel réseau ; les lancer ensemble évite
    // d'additionner les latences (une soixantaine d'articles).
    const sources = await Promise.all(
        markdownFiles.map(async ({ year, slug, sha }) => {
            const markdown = await reader.readText(joinRelative(relativeRoot, year, `${slug}.md`), sha);
            return markdown === null ? null : { year, slug, markdown };
        }),
    );
    return sources.filter((source): source is MarkdownSource => source !== null);
}

/**
 * Compte les fichiers `<année>/<slug>.md` sans lire leur contenu.
 *
 * @param reader - Source des fichiers.
 * @param relativeRoot - Racine relative de la section.
 * @returns Le nombre d'entrées.
 */
export async function countMarkdownEntries(reader: ContentReader, relativeRoot: string): Promise<number> {
    return (await listMarkdownFiles(reader, relativeRoot)).length;
}

async function listMarkdownFiles(
    reader: ContentReader,
    relativeRoot: string,
): Promise<{ year: string; slug: string; sha?: string }[]> {
    const years = (await reader.listDir(relativeRoot)) ?? [];
    const perYear = await Promise.all(
        years
            .filter((entry) => entry.type === 'dir' && validateYear(entry.name))
            .map(async ({ name: year }) =>
                ((await reader.listDir(joinRelative(relativeRoot, year))) ?? [])
                    .filter((entry) => entry.type === 'file' && entry.name.endsWith('.md'))
                    .map((entry) => ({ year, slug: entry.name.replace(/\.md$/, ''), sha: entry.sha })),
            ),
    );
    return perYear.flat();
}

function joinRelative(...segments: string[]): string {
    return segments.filter(Boolean).join('/');
}

/**
 * Chemin relatif au projet du markdown d'une entrée, pour un `ContentReader`.
 *
 * @param section - Section de contenu.
 * @param year - Année du dossier (validée).
 * @param slug - Slug (validé).
 * @returns `src/content/<section>/<année>/<slug>.md`.
 * @throws Si l'année ou le slug est invalide.
 */
export function contentRelativePath(section: ContentSection, year: string, slug: string): string {
    if (!validateYear(year) || !validateSlug(slug)) throw new Error('Invalid year/slug');
    return `src/content/${section}/${year}/${slug}.md`;
}

/**
 * Supprime le markdown d'une entrée et, sur demande, tout son dossier d'images.
 *
 * WARNING: `deleteAssets` supprime récursivement le dossier `<année>/<slug>/` des assets.
 *
 * @param locator - Résolveurs de chemins de la section.
 * @param year - Année du dossier.
 * @param slug - Slug de l'entrée.
 * @param deleteAssets - Supprimer aussi le dossier d'images.
 */
export async function deleteContentEntry(
    locator: ContentLocator,
    year: string,
    slug: string,
    deleteAssets: boolean,
): Promise<void> {
    const file = locator.postFilePath(year, slug);
    if (await fileExists(file)) await fs.unlink(file);
    if (deleteAssets) {
        const dir = locator.postAssetsDir(year, slug);
        if (await fileExists(dir)) await fs.rm(dir, { recursive: true, force: true });
    }
}

/**
 * Enregistre une image uploadée dans le dossier d'une entrée, sous un nom assaini.
 *
 * @param dir - Dossier cible (créé au besoin), issu de `postAssetsDir`.
 * @param filename - Nom de fichier proposé par le client.
 * @param data - Contenu binaire de l'image.
 * @param overwrite - Écraser un fichier homonyme au lieu de suffixer `-2`, `-3`…
 * @returns Le nom de fichier final.
 */
export async function saveImageInDir(
    dir: string,
    filename: string,
    data: Uint8Array,
    overwrite: boolean = false,
): Promise<string> {
    await ensureDir(dir);
    const safe = sanitizeFilename(filename);
    if (!validateFilename(safe)) throw new Error('Invalid filename');
    // POURQUOI : si overwrite est activé (ex. ré-upload d'une photo 360° en pleine résolution),
    // on écrase directement l'ancienne version au lieu de créer un doublon nom-2.jpg.
    const finalName = overwrite ? safe : await uniqueFilename(dir, safe);
    await fs.writeFile(path.join(dir, finalName), data);
    return finalName;
}
