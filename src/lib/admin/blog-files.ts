/**
 * Accès disque aux articles de blog pour l'admin : lecture, écriture et suppression des
 * markdown `src/content/blog/<année>/<slug>.md`, gestion des images (manifeste 360°,
 * miniatures) et enrichissement automatique (temps de lecture, alts déjà connus de `alt.json`).
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
import { computeReadingTime } from './reading-time';
import { ensureDir, fileExists, parseFrontmatter } from './shared';

const blogLocator = createContentLocator('blog');

export const { postFilePath, postAssetsDir, assetFilePath } = blogLocator;

export interface PostFrontmatter {
    title: string;
    date: string;
    categories: string[];
    description: string;
    seoDescription?: string;
    image: string;
    showImage?: boolean;
    draft?: boolean;
    hideImageCaptions?: boolean;
}

export interface PostListEntry {
    year: string;
    slug: string;
    title: string;
    date: string;
    description: string;
    image: string;
    categories?: string[];
    draft?: boolean;
}

export interface PostFull extends PostFrontmatter {
    year: string;
    slug: string;
    body: string;
    /** Empreinte Git du fichier lu, renvoyée à l'enregistrement pour détecter une modification concurrente. */
    revision: string;
}

export function stringifyFrontmatter(data: PostFrontmatter, body: string): string {
    const yaml: string[] = [];
    yaml.push('---');
    if (data.categories.length > 0) {
        yaml.push(`categories:`);
        for (const c of data.categories) yaml.push(`- ${blogYamlString(c)}`);
    } else {
        yaml.push(`categories: []`);
    }
    yaml.push(`date: "${data.date}"`);
    yaml.push(`description: ${blogYamlString(data.description)}`);
    if (data.seoDescription) yaml.push(`seoDescription: ${blogYamlString(data.seoDescription)}`);
    yaml.push(`image: ${blogYamlString(data.image)}`);
    if (data.showImage === false) yaml.push(`showImage: false`);
    if (data.draft === true) yaml.push(`draft: true`);
    if (data.hideImageCaptions === true) yaml.push(`hideImageCaptions: true`);
    yaml.push(`title: ${blogYamlString(data.title)}`);
    yaml.push('---');
    yaml.push('');
    yaml.push(body.replace(/\r\n/g, '\n').replace(/^\n+/, ''));
    return yaml.join('\n');
}

/**
 * Sérialise une valeur scalaire du frontmatter d'un article de blog.
 *
 * POURQUOI : variante volontairement distincte de `yamlString` (`shared.ts`). Elle laisse sans
 * guillemets les valeurs contenant `-`, `œ` ou des majuscules accentuées, et celles qui
 * commencent par un chiffre. Comparée sur tous les articles de `src/content/blog`, la version
 * partagée ajouterait des guillemets à des descriptions existantes (« est-il », « Cluj-Napoca ») :
 * chaque sauvegarde depuis l'admin produirait alors un diff sans changement de contenu.
 *
 * @param v - Valeur à écrire.
 * @returns La valeur telle qu'elle doit apparaître après `clé: `.
 */
function blogYamlString(v: string): string {
    if (v === '') return '""';
    if (/^[A-Za-z0-9 _\-.,!?àâäéèêëîïôöùûüç'œ]+$/i.test(v) && !v.startsWith('-')) {
        return v;
    }
    return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export async function listPosts(): Promise<PostListEntry[]> {
    const entries: PostListEntry[] = (await listMarkdownEntriesWith(getContentReader(), 'src/content/blog')).map(
        ({ year, slug, data }) => ({
            year,
            slug,
            title: String(data.title ?? slug),
            date: String(data.date ?? ''),
            description: String(data.description ?? ''),
            image: String(data.image ?? ''),
            categories: Array.isArray(data.categories) ? data.categories.map(String) : [],
            draft: data.draft === true,
        }),
    );
    entries.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return entries;
}

export async function readPost(year: string, slug: string): Promise<PostFull | null> {
    const raw = await getContentReader().readText(contentRelativePath('blog', year, slug));
    if (raw === null) return null;
    const { data, body } = parseFrontmatter(raw);
    return {
        year,
        slug,
        title: String(data.title ?? ''),
        date: String(data.date ?? ''),
        categories: Array.isArray(data.categories) ? data.categories.map(String) : [],
        description: String(data.description ?? ''),
        seoDescription: data.seoDescription ? String(data.seoDescription) : undefined,
        image: String(data.image ?? ''),
        showImage: data.showImage === false ? false : true,
        draft: data.draft === true,
        hideImageCaptions: data.hideImageCaptions === true,
        body,
        revision: computeRevision(raw),
    };
}

const BLOG_JSON_PATH = 'src/data/blog.json';
const ALT_JSON_PATH = 'src/data/alt.json';

/**
 * Normalise l'URL d'une image pour servir de clé unique dans le fichier centralisé alt.json.
 *
 * POURQUOI : Les chemins dans les fichiers Markdown peuvent adopter plusieurs formes selon
 * le contexte d'édition (par exemple, des chemins relatifs, des chemins complets vers src, ou
 * des chemins absolus virtuels). Cette normalisation garantit la cohérence des clés.
 *
 * @param urlPath - L'URL brute de l'image extraite du fichier Markdown.
 * @returns La clé normalisée commençant par '/assets/'.
 *
 * @example
 * normalizeImageUrl('src/assets/blog/2026/test/img.jpg') // => '/assets/blog/2026/test/img.jpg'
 */
function normalizeImageUrl(urlPath: string): string {
    const pathStr = urlPath.split('?')[0].trim();
    const assetsIndex = pathStr.indexOf('/assets/');
    if (assetsIndex !== -1) {
        return pathStr.substring(assetsIndex);
    }
    const srcAssetsIndex = pathStr.indexOf('src/assets/');
    if (srcAssetsIndex !== -1) {
        return '/' + pathStr.substring(srcAssetsIndex + 4);
    }
    if (!pathStr.startsWith('/') && !pathStr.includes('://')) {
        if (pathStr.startsWith('assets/')) {
            return '/' + pathStr;
        }
    }
    return pathStr;
}

/**
 * Pipeline complet d'enrichissement automatique d'un article de blog lors de sa sauvegarde.
 *
 * POURQUOI : Automatise les tâches répétitives de SEO, d'accessibilité et de métadonnées pour l'éditeur.
 * Calcule le temps de lecture, aligne la description SEO et complète les alts vides du corps du
 * markdown avec ceux déjà connus de `alt.json`. N'écrit rien : `writePost` enregistre le markdown et
 * `blog.json` ensemble (un seul commit sur l'admin distant).
 *
 * @param year - L'année de publication de l'article (ex: "2026").
 * @param slug - Le slug unique identifiant l'article (ex: "mon-premier-article").
 * @param frontmatter - Les métadonnées YAML d'origine.
 * @param body - Le corps Markdown d'origine de l'article.
 * @returns Le frontmatter enrichi, le corps Markdown mis à jour et le temps de lecture.
 */
export async function enrichPostMetadataAndAlts(
    year: string,
    slug: string,
    frontmatter: PostFrontmatter,
    body: string,
): Promise<{ frontmatter: PostFrontmatter; body: string; readingTime: string }> {
    // 1. Calcul du temps de lecture (enregistré dans blog.json par writePost)
    const readingTime = computeReadingTime(body);

    // COMMENTAIRE : La description SEO (seoDescription) doit toujours être strictement identique
    // à la description courte (description / excerpt) de l'article pour des raisons de cohérence SEO et éditoriale.
    // Cette affectation directe garantit que les deux champs restent parfaitement synchronisés à chaque sauvegarde,
    // sans divergences et sans dépendance à une génération d'IA asynchrone pour ce champ.
    const enrichedFrontmatter = { ...frontmatter };
    enrichedFrontmatter.seoDescription = enrichedFrontmatter.description;

    // 3. Reprise des alts déjà connus. POURQUOI : aucun n'est généré ici ; sans le récit, un modèle se trompe
    // de lieu ou de sujet. Les manquants sont signalés par l'admin et s'écrivent avec /generate-alts.
    // Nettoie d'éventuelles balises d'images Markdown corrompues (ex: résidus de balises <think> générées par un modèle de raisonnement)
    let enrichedBody = body.replace(/!\[[^\]]*<think>[\s\S]*?\]\(([^)]+)\)/gi, '![]($1)');
    const matches = [...enrichedBody.matchAll(/!\[\s*\]\(([^)]+)\)/g)];

    if (matches.length > 0) {
        let altData: Record<string, string> = {};
        try {
            altData = JSON.parse((await getContentReader().readText(ALT_JSON_PATH)) ?? '{}');
        } catch {
            // En cas d'absence de fichier alt.json
        }

        for (const match of matches) {
            const fullMatch = match[0];
            const imageUrl = match[1].trim();
            const altKey = normalizeImageUrl(imageUrl);

            const altText = altData[altKey];
            const isCorrupted = altText?.includes('<think>') || altText?.includes('\n');

            if (altText && !isCorrupted) {
                const cleanAlt = altText.replace(/[\r\n]+/g, ' ').trim();
                enrichedBody = enrichedBody.replace(fullMatch, `![${cleanAlt}](${imageUrl})`);
            }
        }
    }

    return { frontmatter: enrichedFrontmatter, body: enrichedBody, readingTime };
}

/**
 * Déplace et renomme le dossier d'assets d'un article si l'année ou le slug a été modifié.
 *
 * POURQUOI : Si l'utilisateur a téléversé des images pour un article dont le slug n'était
 * pas définitif, les fichiers physiques doivent être déplacés dans le bon répertoire correspondant
 * au slug final lors de la première sauvegarde.
 */
export async function renamePostAssets(
    oldYear: string,
    oldSlug: string,
    newYear: string,
    newSlug: string,
): Promise<void> {
    if (oldYear === newYear && oldSlug === newSlug) return;
    const oldDir = postAssetsDir(oldYear, oldSlug);
    const newDir = postAssetsDir(newYear, newSlug);

    if ((await fileExists(oldDir)) && !(await fileExists(newDir))) {
        await ensureDir(path.dirname(newDir));
        await fs.rename(oldDir, newDir);
    }
}

/**
 * Enregistre un article : markdown enrichi et temps de lecture dans `blog.json`, en une seule opération
 * (écriture disque en local, commit sur la branche de contenu à distance).
 *
 * @param year - Année du dossier.
 * @param slug - Slug de l'article.
 * @param fm - Frontmatter saisi.
 * @param body - Corps Markdown saisi.
 * @param options - `expectedRevision` : révision lue par l'éditeur, pour refuser d'écraser une
 *   modification faite ailleurs ; `isNew` : création (message de commit).
 * @returns Le frontmatter et le corps enrichis, et la nouvelle révision du fichier.
 * @throws ContentConflictError si le fichier a changé depuis `expectedRevision`.
 */
export async function writePost(
    year: string,
    slug: string,
    fm: PostFrontmatter,
    body: string,
    options: { expectedRevision?: string; isNew?: boolean } = {},
): Promise<{ frontmatter: PostFrontmatter; body: string; revision: string }> {
    const markdownPath = contentRelativePath('blog', year, slug);
    const reader = getContentReader();
    assertRevision(await reader.readText(markdownPath), options.expectedRevision, markdownPath);

    if (getAdminAccessMode() === 'local') await ensureDir(postAssetsDir(year, slug));

    const enriched = await enrichPostMetadataAndAlts(year, slug, fm, body);
    const content = stringifyFrontmatter(enriched.frontmatter, enriched.body);

    let blogData: Record<string, { id: string; readingTime: string }> = {};
    try {
        blogData = JSON.parse((await reader.readText(BLOG_JSON_PATH)) ?? '{}');
    } catch {
        // POURQUOI : un blog.json illisible est reconstruit plutôt que de bloquer la sauvegarde.
    }
    const blogKey = `${year}/${slug}`;
    blogData[blogKey] = { id: blogKey, readingTime: enriched.readingTime };

    // POURQUOI : à distance, les images envoyées depuis la dernière sauvegarde n'ont encore ni dimensions ni
    // versions web dans les manifestes ; elles partent dans le même commit que le texte.
    const imageManifests =
        getAdminAccessMode() === 'remote' ? await imageManifestChangesForSave('blog', year, slug, reader) : [];
    await getContentWriter().commit(
        [
            { path: markdownPath, content },
            { path: BLOG_JSON_PATH, content: JSON.stringify(blogData, null, 2) },
            ...imageManifests,
        ],
        `chore: ${options.isNew ? 'create' : 'update'} blog post ${blogKey} from admin`,
    );
    return { frontmatter: enriched.frontmatter, body: enriched.body, revision: computeRevision(content) };
}

/**
 * Supprime un article. Sur l'admin distant, seul le markdown est supprimé (commit) : les images vivent
 * sur R2 et `deleteAssets` est ignoré.
 *
 * @param year - Année du dossier.
 * @param slug - Slug de l'article.
 * @param deleteAssets - Supprimer aussi le dossier d'images local.
 */
export async function deletePost(year: string, slug: string, deleteAssets: boolean): Promise<void> {
    if (getAdminAccessMode() === 'local') {
        await deleteContentEntry(blogLocator, year, slug, deleteAssets);
        return;
    }
    const markdownPath = contentRelativePath('blog', year, slug);
    if ((await getContentReader().readText(markdownPath)) === null) return;
    await getContentWriter().commit(
        [{ path: markdownPath, content: null }],
        `chore: delete blog post ${year}/${slug} from admin`,
    );
}

/**
 * Liste les images associées à un article de blog spécifique.
 *
 * POURQUOI : Les images doivent être retournées dans leur ordre d'ajout
 * (la plus ancienne en premier, la plus récente à la fin de la liste) pour que
 * l'utilisateur voie ses derniers téléversements à la fin de la galerie.
 * C'est pourquoi nous trions le tableau résultant par `mtimeMs` (timestamp de
 * dernière modification) de manière croissante au lieu d'un tri alphabétique classique.
 *
 * Exemple d'utilisation :
 * const images = await listImages('2026', 'transylvanie-roadtrip');
 *
 * @param year Année de publication de l'article (ex: '2026').
 * @param slug Nom du dossier / identifiant de l'article (ex: 'transylvanie-roadtrip').
 * @returns Promesse résolvant sur un tableau d'objets image avec `name`, `size`, et `mtimeMs`.
 */
/**
 * Extrait la date de prise de vue d'une image.
 *
 * POURQUOI : Permet de classer chronologiquement les images d'un article et de les
 * regrouper par jour dans l'éditeur. La fonction teste en priorité les métadonnées EXIF,
 * puis les conventions de nommage courantes (dji_, pxl_, img_, signal-), et se replie
 * sur la date de modification du fichier si aucune information n'est disponible.
 *
 * @param filePath Chemin d'accès absolu au fichier sur le disque.
 * @param filename Nom du fichier.
 * @param fallbackMtimeMs Horodatage de repli en millisecondes.
 * @returns Date au format ISO court 'YYYY-MM-DDTHH:mm:ss'.
 */
async function extractCaptureDate(filePath: string, filename: string, fallbackMtimeMs: number): Promise<string> {
    // 1. Détection via conventions de nommage standards
    let m = filename.match(/dji_(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/i);
    if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;

    m = filename.match(/(?:pxl|img)_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/i);
    if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;

    m = filename.match(/signal-(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})/i);
    if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;

    // 2. Détection via les métadonnées EXIF (lecture optimisée des 64 premiers Ko)
    try {
        const fd = await fs.open(filePath, 'r');
        const buf = Buffer.alloc(65536);
        const { bytesRead } = await fd.read(buf, 0, 65536, 0);
        await fd.close();
        if (bytesRead > 0) {
            const str = buf.toString('latin1', 0, bytesRead);
            const matches = [...str.matchAll(/(\d{4})[:-](\d{2})[:-](\d{2}) (\d{2}):(\d{2}):(\d{2})/g)];
            if (matches.length > 0) {
                const validDates = matches
                    .map((match) => `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}`)
                    .filter((d) => !d.startsWith('1970') && !d.startsWith('0000'))
                    .sort();
                if (validDates.length > 0) {
                    return validDates[0];
                }
            }
        }
    } catch {
        /* repli silencieux */
    }

    // 3. Repli sur le mtime du fichier
    return new Date(fallbackMtimeMs).toISOString().slice(0, 19);
}

export interface ImageEntry {
    name: string;
    size: number;
    mtimeMs: number;
    capturedAt: string;
    dayKey: string;
    timeStr: string;
    is360?: boolean;
}

const MANIFEST_360 = '.360-manifest.json';

/**
 * Récupère la liste des noms de fichiers explicitement enregistrés comme photosphères 360°.
 */
export async function get360Manifest(year: string, slug: string): Promise<Set<string>> {
    const dir = postAssetsDir(year, slug);
    const manifestPath = path.join(dir, MANIFEST_360);
    try {
        if (await fileExists(manifestPath)) {
            const raw = await fs.readFile(manifestPath, 'utf8');
            const arr = JSON.parse(raw);
            if (Array.isArray(arr)) return new Set(arr);
        }
    } catch {
        // ignore
    }
    return new Set();
}

/**
 * Enregistre un fichier dans le manifeste des images 360° du dossier d'article.
 */
export async function mark360Image(year: string, slug: string, filename: string): Promise<void> {
    const dir = postAssetsDir(year, slug);
    await ensureDir(dir);
    const manifestPath = path.join(dir, MANIFEST_360);
    const set = await get360Manifest(year, slug);
    set.add(filename);
    await fs.writeFile(manifestPath, JSON.stringify(Array.from(set), null, 2), 'utf8');
}

export async function listImages(year: string, slug: string): Promise<ImageEntry[]> {
    const dir = postAssetsDir(year, slug);
    if (!(await fileExists(dir))) return [];
    const files = await fs.readdir(dir);
    const manifest360 = await get360Manifest(year, slug);
    const out: ImageEntry[] = [];
    for (const name of files) {
        if (name.startsWith('.')) continue;
        // POURQUOI : Les miniatures (-thumb) sont réservées à l'affichage des cartes de listing
        // et ne doivent pas être affichées comme des images autonomes dans la grille d'édition.
        if (name.toLowerCase().includes('-thumb')) continue;
        const filePath = path.join(dir, name);
        const stat = await fs.stat(filePath);
        if (stat.isFile()) {
            const capturedAt = await extractCaptureDate(filePath, name, stat.mtimeMs);
            const dayKey = capturedAt.slice(0, 10);
            const timeStr = capturedAt.length >= 16 ? capturedAt.slice(11, 16) : '';

            // POURQUOI : Les images 360° sont identifiées soit par le manifeste d'upload 360,
            // soit par leur nom (mot-clé 360 ou sphere).
            const is360 = manifest360.has(name) || /(?:^|[_\-.])(360|sphere)(?:[_\-.]|$)/i.test(name);

            out.push({
                name,
                size: stat.size,
                mtimeMs: stat.mtimeMs,
                capturedAt,
                dayKey,
                timeStr,
                is360,
            });
        }
    }
    // POURQUOI : Tri chronologique par date de prise de vue pour un flux d'édition naturel.
    out.sort(
        (a, b) =>
            a.capturedAt.localeCompare(b.capturedAt) || a.name.localeCompare(b.name, undefined, { numeric: true }),
    );
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

export async function deleteImage(year: string, slug: string, filename: string): Promise<void> {
    const file = assetFilePath(year, slug, filename);
    if (await fileExists(file)) await fs.unlink(file);

    // POURQUOI : Si l'image supprimée avait une miniature associée (ex: ancienne couverture),
    // on la supprime également pour ne pas laisser de fichier orphelin sur disque ou sur R2.
    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    const thumbFilename = `${base}-thumb.jpg`;
    const thumbFile = assetFilePath(year, slug, thumbFilename);
    if (await fileExists(thumbFile)) {
        try {
            await fs.unlink(thumbFile);
        } catch {
            /* suppression au mieux */
        }
    }
}

export function publicImagePath(year: string, slug: string, filename: string): string {
    return `/assets/blog/${year}/${slug}/${filename}`;
}
