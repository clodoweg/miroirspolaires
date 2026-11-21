/**
 * Accès disque aux récits de voyage pour l'admin : lecture, écriture et suppression des
 * markdown `src/content/voyages/<année>/<slug>.md` et de leurs images (corbeille `.admin-trash/`).
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
    contentRelativePath,
    createContentLocator,
    deleteContentEntry,
    listMarkdownEntriesWith,
    saveImageInDir,
} from './content-files';
import { getContentReader } from './stores/content-reader';
import { assertRevision, computeRevision, getContentWriter } from './stores/content-writer';
import { getAdminAccessMode } from './auth/config';
import { imageManifestChangesForSave } from './remote-images';
import { ensureDir, fileExists, parseFrontmatter, yamlString } from './shared';

const voyagesLocator = createContentLocator('voyages');

export const { postFilePath, postAssetsDir, assetFilePath } = voyagesLocator;

export type Season = 'Hiver' | 'Printemps' | 'Été' | 'Automne';

export interface VoyageFrontmatter {
    title: string;
    date?: string;
    description?: string;
    image: string;
    gallery: string[];
    country?: string | string[];
    season?: Season;
    year?: number;
    draft?: boolean;
}

export interface VoyageListEntry {
    year: string;
    slug: string;
    title: string;
    description: string;
    image: string;
    country?: string | string[];
    season?: Season;
    yearMeta?: number;
    draft?: boolean;
}

export interface VoyageFull extends VoyageFrontmatter {
    dirYear: string;
    slug: string;
    body: string;
    /** Empreinte Git du fichier lu, renvoyée à l'enregistrement pour détecter une modification concurrente. */
    revision: string;
}

export function relImagePath(year: string, slug: string, filename: string): string {
    // Frontmatter uses paths like "../../../assets/voyages/<year>/<slug>/<file>"
    return `../../../assets/voyages/${year}/${slug}/${filename}`;
}

export async function listVoyages(): Promise<VoyageListEntry[]> {
    const entries: VoyageListEntry[] = (await listMarkdownEntriesWith(getContentReader(), 'src/content/voyages')).map(
        ({ year, slug, data }) => ({
            year,
            slug,
            title: String(data.title ?? slug),
            description: String(data.description ?? ''),
            image: String(data.image ?? ''),
            country: data.country as string | string[] | undefined,
            season: data.season as Season | undefined,
            yearMeta: typeof data.year === 'number' ? data.year : undefined,
            draft: data.draft === true,
        }),
    );
    entries.sort((a, b) => `${b.year}/${b.slug}`.localeCompare(`${a.year}/${a.slug}`));
    return entries;
}

export async function readVoyage(year: string, slug: string): Promise<VoyageFull | null> {
    const raw = await getContentReader().readText(contentRelativePath('voyages', year, slug));
    if (raw === null) return null;
    const { data, body } = parseFrontmatter(raw);
    const gallery = Array.isArray(data.gallery) ? (data.gallery as unknown[]).map(String) : [];
    return {
        dirYear: year,
        slug,
        title: String(data.title ?? ''),
        date: data.date ? String(data.date) : undefined,
        description: data.description ? String(data.description) : '',
        image: String(data.image ?? ''),
        gallery,
        country: data.country as string | string[] | undefined,
        season: data.season as Season | undefined,
        year: typeof data.year === 'number' ? data.year : undefined,
        draft: data.draft === true,
        body,
        revision: computeRevision(raw),
    };
}

function stringify(fm: VoyageFrontmatter, body: string): string {
    const out: string[] = ['---'];
    out.push(`title: ${yamlString(fm.title)}`);
    if (fm.date) out.push(`date: ${yamlString(fm.date)}`);
    out.push(`description: ${yamlString(fm.description ?? '')}`);
    out.push(`image: ${yamlString(fm.image)}`);
    if (fm.gallery.length > 0) {
        out.push('gallery:');
        for (const g of fm.gallery) out.push(`  - ${yamlString(g)}`);
    }
    if (fm.country !== undefined) {
        if (Array.isArray(fm.country)) {
            out.push('country:');
            for (const c of fm.country) out.push(`  - ${yamlString(c)}`);
        } else {
            out.push(`country: ${yamlString(fm.country)}`);
        }
    }
    if (fm.season) out.push(`season: ${yamlString(fm.season)}`);
    if (typeof fm.year === 'number') out.push(`year: ${fm.year}`);
    if (fm.draft === true) out.push(`draft: true`);
    out.push('---');
    out.push('');
    out.push(body.replace(/\r\n/g, '\n').replace(/^\n+/, ''));
    return out.join('\n');
}

/**
 * Enregistre un voyage (écriture disque en local, commit sur la branche de contenu à distance).
 *
 * @param year - Année du dossier.
 * @param slug - Slug du voyage.
 * @param fm - Frontmatter saisi.
 * @param body - Corps Markdown saisi.
 * @param options - `expectedRevision` : révision lue par l'éditeur ; `isNew` : création (message de commit).
 * @returns La nouvelle révision du fichier.
 * @throws ContentConflictError si le fichier a changé depuis `expectedRevision`.
 */
export async function writeVoyage(
    year: string,
    slug: string,
    fm: VoyageFrontmatter,
    body: string,
    options: { expectedRevision?: string; isNew?: boolean } = {},
): Promise<{ revision: string }> {
    const markdownPath = contentRelativePath('voyages', year, slug);
    const reader = getContentReader();
    assertRevision(await reader.readText(markdownPath), options.expectedRevision, markdownPath);
    if (getAdminAccessMode() === 'local') await ensureDir(postAssetsDir(year, slug));
    const content = stringify(fm, body);
    // POURQUOI : à distance, dimensions et versions web des images envoyées partent avec le texte.
    const imageManifests =
        getAdminAccessMode() === 'remote' ? await imageManifestChangesForSave('voyages', year, slug, reader) : [];
    await getContentWriter().commit(
        [{ path: markdownPath, content }, ...imageManifests],
        `chore: ${options.isNew ? 'create' : 'update'} travel story ${year}/${slug} from admin`,
    );
    return { revision: computeRevision(content) };
}

/**
 * Supprime un voyage. Sur l'admin distant, seul le markdown est supprimé (commit) : les images vivent
 * sur R2 et `deleteAssets` est ignoré.
 *
 * @param year - Année du dossier.
 * @param slug - Slug du voyage.
 * @param deleteAssets - Supprimer aussi le dossier d'images local.
 */
export async function deleteVoyage(year: string, slug: string, deleteAssets: boolean): Promise<void> {
    if (getAdminAccessMode() === 'local') {
        await deleteContentEntry(voyagesLocator, year, slug, deleteAssets);
        return;
    }
    const markdownPath = contentRelativePath('voyages', year, slug);
    if ((await getContentReader().readText(markdownPath)) === null) return;
    await getContentWriter().commit(
        [{ path: markdownPath, content: null }],
        `chore: delete travel story ${year}/${slug} from admin`,
    );
}

/**
 * Liste les images valides pour la galerie d'un voyage en excluant toutes les miniatures (-thumb)
 * afin d'éviter les doublons d'affichage.
 *
 * @param year - L'année du voyage (ex: "2022")
 * @param slug - Le slug du voyage (ex: "la-baie-du-roi-au-spitzberg")
 * @returns Une promesse contenant la liste des objets image avec leur nom, taille et chemin relatif.
 */
export async function listImages(year: string, slug: string): Promise<{ name: string; size: number; rel: string }[]> {
    const dir = postAssetsDir(year, slug);
    if (!(await fileExists(dir))) return [];
    const files = await fs.readdir(dir);
    const out: { name: string; size: number; rel: string }[] = [];
    for (const name of files) {
        if (name.startsWith('.')) continue;

        // POURQUOI : Les miniatures (-thumb) ne doivent pas être affichées dans la galerie.
        // L'image cover.jpg en revanche est affichée comme une image classique de la galerie.
        const lowerName = name.toLowerCase();
        if (lowerName.includes('-thumb')) {
            continue;
        }

        const stat = await fs.stat(path.join(dir, name));
        if (stat.isFile()) out.push({ name, size: stat.size, rel: relImagePath(year, slug, name) });
    }
    out.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    return out;
}

export async function saveImage(
    year: string,
    slug: string,
    filename: string,
    data: Uint8Array,
    overwrite: boolean = false,
): Promise<string> {
    return saveImageInDir(postAssetsDir(year, slug), filename, data, overwrite);
}

const TRASH_ROOT = path.join(process.cwd(), '.admin-trash/voyages');

/**
 * Moves the image into `.admin-trash/voyages/<year>/<slug>/` instead of unlinking.
 * The trash sits outside Astro's `src/assets` glob, so Vite's watcher doesn't try to
 * load the (gone) file before the markdown change propagates, which would emit
 * ImageNotFound errors in dev. Safe to delete the `.admin-trash` folder anytime.
 */
export async function deleteImage(year: string, slug: string, filename: string): Promise<void> {
    const file = assetFilePath(year, slug, filename);
    if (!(await fileExists(file))) return;
    const trashDir = path.join(TRASH_ROOT, year, slug);
    await fs.mkdir(trashDir, { recursive: true });
    let dest = path.join(trashDir, filename);
    if (await fileExists(dest)) {
        const ext = path.extname(filename);
        const base = filename.slice(0, filename.length - ext.length);
        dest = path.join(trashDir, `${base}-${Date.now()}${ext}`);
    }
    await fs.rename(file, dest);
}
