/**
 * Astrophotos de l'admin : inventaire (CSV AstroBin croisé avec les métadonnées et les fichiers) et édition des
 * métadonnées d'une photo.
 *
 * Lecture par `getContentReader()` et écriture par `getContentWriter()` : disque en `npm run dev`, branche dev
 * (lecture par l'API GitHub, écriture par commit) sur l'admin distant. Les fichiers d'images viennent de
 * `astro-asset-index.ts` (disque en local, R2 à distance).
 *
 * WARNING: le CSV n'est jamais écrit ici : il appartient au seul scrape AstroBin.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import { sanitizeFilename, createUniqueHeaderTransform } from './shared';
import { loadAstroAssetIndex, type AstroAssetIndex } from './astro-asset-index';
import { getAdminAccessMode } from './auth/config';
import { getContentReader, type ContentReader } from './stores/content-reader';
import { getContentWriter, type ContentWriter, type FileChange } from './stores/content-writer';
import { slugify } from '@/utils/normalize';

const CSV_PATH = 'data/astrobin_clodoweg_gallery_python.csv';
const ASTRO_ROOT = path.join(process.cwd(), 'src/assets/astrophotographies');

export interface CsvPhoto {
    ID: string;
    Title: string;
    Uploaded: string;
    Type: string;
    Constellation: string;
    Url: string;
    year: string;
    hasRaw: boolean;
    hasMini: boolean;
    hasAlt: boolean;
    hasWiki: boolean;
    hasDetails: boolean;
    hasSeo: boolean;
    hasAnnotation: boolean;
    altText?: string;
    wikiDesc?: string;
    wikiSource?: string;
    techDetails?: {
        discovery: string | null;
        object_type: string | null;
        dimensions_ly: number | null;
        distance_ly: number | null;
        apparent_dimensions: string | null;
        apparent_magnitude: number | null;
        apparent_radius: number | null;
        source_url: string | null;
    };
    seoDesc?: string;
    rawPath?: string;
    miniPath?: string;
    annotationPath?: string;
    draft?: boolean;
}

const ALT_PATH = 'src/data/alt.json';
const WIKI_PATH = 'src/data/wikipedia.json';
const DETAILS_PATH = 'src/data/astro_details.json';
const SEO_PATH = 'src/data/seo.json';
const DRAFTS_PATH = 'src/data/drafts.json';

async function readJsonSafely<T>(reader: ContentReader, relativePath: string, defaultVal: T): Promise<T> {
    try {
        const content = await reader.readText(relativePath);
        return content === null ? defaultVal : (JSON.parse(content) as T);
    } catch {
        // POURQUOI : un JSON illisible ne doit pas bloquer l'inventaire ; ses entrées apparaissent manquantes.
        return defaultVal;
    }
}

export interface AstroPhotoSources {
    /** Source du CSV et des JSON (défaut : `getContentReader()`). */
    reader?: ContentReader;
    /** Fichiers d'images (défaut : disque en local, R2 à distance). */
    assets?: AstroAssetIndex;
}

/**
 * Inventaire des astrophotos, dans l'ordre du CSV.
 *
 * @param limit - Nombre maximal de photos.
 * @param sources - Sources à utiliser à la place des sources par défaut (tests).
 * @returns Les photos, avec leurs métadonnées et l'état de leurs fichiers.
 */
export async function listRecentPhotos(limit = 25, sources: AstroPhotoSources = {}): Promise<CsvPhoto[]> {
    const reader = sources.reader ?? getContentReader();
    const content = await reader.readText(CSV_PATH);
    if (content === null) return [];
    const parsed = Papa.parse<Record<string, string>>(content, {
        header: true,
        skipEmptyLines: true,
        transformHeader: createUniqueHeaderTransform(),
    });

    // Load metadata files in parallel for efficiency
    const [altData, wikiData, detailsData, seoData, draftsData] = await Promise.all([
        readJsonSafely<Record<string, string>>(reader, ALT_PATH, {}),
        readJsonSafely<Record<string, any>>(reader, WIKI_PATH, {}),
        readJsonSafely<Record<string, any>>(reader, DETAILS_PATH, {}),
        readJsonSafely<Record<string, string>>(reader, SEO_PATH, {}),
        readJsonSafely<Record<string, boolean>>(reader, DRAFTS_PATH, {}),
    ]);
    const assets = sources.assets ?? (await loadAstroAssetIndex(getAdminAccessMode() === 'remote'));

    const rows = (parsed.data ?? []).slice(0, limit);
    const out: CsvPhoto[] = [];
    for (const row of rows) {
        const id = String(row.ID ?? '').trim();
        if (!id) continue;
        const uploaded = String(row.Uploaded ?? '');
        const year = uploaded.slice(0, 4);
        const rawKey = assets.findRaw(id);
        const miniKey = `astrophotographies/mini/${year}/${id}_raw.jpg`;
        const miniPath = assets.has(miniKey) ? assets.describe(miniKey) : null;
        const annotationKey = `astrophotographies/annotations/${year}/${id}_annotation.svg`;
        const hasAnnotation = assets.has(annotationKey);
        const rawPath = rawKey ? assets.describe(rawKey) : null;

        // Compute flags & extract actual values
        const hasRaw = !!rawPath;
        const hasMini = !!miniPath;

        const altKey = `/assets/astrophotographies/${year}/${id}_raw.jpg`;
        const altText = altData[altKey] || '';
        const hasAlt = !!altText;

        const wikiObj = wikiData[id];
        const hasWiki = !!wikiObj;
        const wikiDesc = wikiObj?.description || '';
        const wikiSource = wikiObj?.source || '';

        const techObj = detailsData[id];
        const hasDetails = !!techObj;

        const slug = `${slugify(String(row.Title ?? ''))}-${id}`;
        const seoKey = `astrophotographies/${slug}`;
        const seoDesc = seoData[seoKey] || '';
        const hasSeo = !!seoDesc;

        out.push({
            ID: id,
            Title: String(row.Title ?? ''),
            Uploaded: uploaded,
            Type: String(row.Type ?? ''),
            Constellation: String(row.Constellation ?? ''),
            Url: String(row.Url ?? ''),
            year,
            hasRaw,
            hasMini,
            hasAlt,
            hasWiki,
            hasDetails,
            hasSeo,
            hasAnnotation,
            altText,
            wikiDesc,
            wikiSource,
            techDetails: techObj
                ? {
                      discovery: techObj.discovery ?? null,
                      object_type: techObj.object_type ?? null,
                      dimensions_ly: techObj.dimensions_ly ?? null,
                      distance_ly: techObj.distance_ly ?? null,
                      apparent_dimensions: techObj.apparent_dimensions ?? null,
                      apparent_magnitude: techObj.apparent_magnitude ?? null,
                      apparent_radius: techObj.apparent_radius ?? null,
                      source_url: techObj.source_url ?? null,
                  }
                : undefined,
            seoDesc,
            rawPath: rawPath ?? undefined,
            miniPath: miniPath ?? undefined,
            annotationPath: hasAnnotation ? assets.describe(annotationKey) : undefined,
            draft: draftsData[id] === true,
        });
    }
    return out;
}

/**
 * Met à jour les métadonnées d'une photo (alt, Wikipedia, fiche technique, SEO, brouillon).
 *
 * Seuls les champs fournis sont modifiés ; une valeur vide supprime l'entrée.
 *
 * @param id - ID AstroBin.
 * @param year - Année du dossier (clé de l'alt).
 * @param title - Titre de la photo (clé SEO).
 * @param data - Champs à modifier.
 * @param sources - Lecteur et écrivain à utiliser à la place de ceux du mode courant (tests).
 * @returns Rien ; lève une erreur si l'ID ou l'année sont invalides, ou si l'écriture échoue.
 */
export async function updatePhotoMetadata(
    id: string,
    year: string,
    title: string,
    data: {
        alt?: string;
        wiki?: { description?: string; source?: string };
        tech?: {
            discovery: string | null;
            object_type: string | null;
            dimensions_ly: number | null;
            distance_ly: number | null;
            apparent_dimensions: string | null;
            apparent_magnitude: number | null;
            apparent_radius: number | null;
            source_url: string | null;
        };
        seo?: string;
        draft?: boolean;
    },
    sources: { reader?: ContentReader; writer?: ContentWriter } = {},
): Promise<void> {
    const reader = sources.reader ?? getContentReader();
    const changes: FileChange[] = [];
    const stage = (relativePath: string, value: unknown) =>
        changes.push({ path: relativePath, content: JSON.stringify(value, null, 2) });

    if (!/^\d+$/.test(id)) throw new Error('ID invalide');
    if (!/^\d{4}$/.test(year)) throw new Error('Année invalide');

    // 1. Update alt.json
    if (data.alt !== undefined) {
        const altData = await readJsonSafely<Record<string, string>>(reader, ALT_PATH, {});
        const altKey = `/assets/astrophotographies/${year}/${id}_raw.jpg`;
        if (data.alt.trim()) {
            altData[altKey] = data.alt.trim();
        } else {
            delete altData[altKey];
        }
        stage(ALT_PATH, altData);
    }

    // 2. Update wikipedia.json
    if (data.wiki !== undefined) {
        const wikiData = await readJsonSafely<Record<string, any>>(reader, WIKI_PATH, {});
        const wikiDesc = String(data.wiki.description ?? '').trim();
        const wikiSrc = String(data.wiki.source ?? '').trim();
        if (wikiDesc || wikiSrc) {
            wikiData[id] = {
                id,
                description: wikiDesc,
                source: wikiSrc,
            };
        } else {
            delete wikiData[id];
        }
        stage(WIKI_PATH, wikiData);
    }

    // 3. Update astro_details.json
    if (data.tech !== undefined) {
        const detailsData = await readJsonSafely<Record<string, any>>(reader, DETAILS_PATH, {});
        if (data.tech) {
            detailsData[id] = {
                id,
                discovery: data.tech.discovery?.trim() || null,
                object_type: data.tech.object_type?.trim() || null,
                dimensions_ly:
                    data.tech.dimensions_ly !== null &&
                    data.tech.dimensions_ly !== undefined &&
                    !isNaN(Number(data.tech.dimensions_ly))
                        ? Number(data.tech.dimensions_ly)
                        : null,
                distance_ly:
                    data.tech.distance_ly !== null &&
                    data.tech.distance_ly !== undefined &&
                    !isNaN(Number(data.tech.distance_ly))
                        ? Number(data.tech.distance_ly)
                        : null,
                apparent_dimensions: data.tech.apparent_dimensions?.trim() || null,
                apparent_magnitude:
                    data.tech.apparent_magnitude !== null &&
                    data.tech.apparent_magnitude !== undefined &&
                    !isNaN(Number(data.tech.apparent_magnitude))
                        ? Number(data.tech.apparent_magnitude)
                        : null,
                apparent_radius:
                    data.tech.apparent_radius !== null &&
                    data.tech.apparent_radius !== undefined &&
                    !isNaN(Number(data.tech.apparent_radius))
                        ? Number(data.tech.apparent_radius)
                        : null,
                source_url: data.tech.source_url?.trim() || null,
            };
        } else {
            delete detailsData[id];
        }
        stage(DETAILS_PATH, detailsData);
    }

    // 4. Update seo.json
    if (data.seo !== undefined) {
        const seoData = await readJsonSafely<Record<string, string>>(reader, SEO_PATH, {});
        const slug = `${slugify(title)}-${id}`;
        const seoKey = `astrophotographies/${slug}`;
        if (data.seo.trim()) {
            seoData[seoKey] = data.seo.trim();
        } else {
            delete seoData[seoKey];
        }
        stage(SEO_PATH, seoData);
    }

    // 5. Update drafts.json
    if (data.draft !== undefined) {
        const draftsData = await readJsonSafely<Record<string, boolean>>(reader, DRAFTS_PATH, {});
        if (data.draft) {
            draftsData[id] = true;
        } else {
            delete draftsData[id];
        }
        stage(DRAFTS_PATH, draftsData);
    }

    // POURQUOI : un seul commit pour toute la fiche sur l'admin distant (un fichier par JSON modifié).
    if (changes.length === 0) return;
    await (sources.writer ?? getContentWriter()).commit(changes, `Admin : fiche de l'astrophoto ${id}`);
}

/**
 * Enregistre le raw d'une photo dans `src/assets/` (admin local seulement).
 *
 * @param id - ID AstroBin.
 * @param year - Année du dossier.
 * @param data - Contenu du fichier.
 * @returns Le chemin écrit, relatif au dépôt.
 */
export async function uploadRaw(id: string, year: string, data: Uint8Array): Promise<{ path: string }> {
    if (!/^\d+$/.test(id)) throw new Error('Invalid ID');
    if (!/^\d{4}$/.test(year)) throw new Error('Invalid year');
    const targetDir = path.join(ASTRO_ROOT, year);
    await fs.mkdir(targetDir, { recursive: true });
    const finalName = sanitizeFilename(`${id}_raw.jpg`);
    const targetPath = path.join(targetDir, finalName);
    await fs.writeFile(targetPath, data);
    return { path: path.relative(process.cwd(), targetPath) };
}
