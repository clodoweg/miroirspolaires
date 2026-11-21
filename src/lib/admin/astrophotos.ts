import { promises as fs } from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import { fileExists, sanitizeFilename, createUniqueHeaderTransform } from './shared';
import { slugify } from '@/utils/normalize';

const CSV_PATH = path.join(process.cwd(), 'data/astrobin_clodoweg_gallery_python.csv');
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

const ALT_PATH = path.join(process.cwd(), 'src/data/alt.json');
const WIKI_PATH = path.join(process.cwd(), 'src/data/wikipedia.json');
const DETAILS_PATH = path.join(process.cwd(), 'src/data/astro_details.json');
const SEO_PATH = path.join(process.cwd(), 'src/data/seo.json');
const DRAFTS_PATH = path.join(process.cwd(), 'src/data/drafts.json');

async function readJsonSafely<T>(filePath: string, defaultVal: T): Promise<T> {
    try {
        const content = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(content) as T;
    } catch {
        return defaultVal;
    }
}

async function findFileRecursive(dir: string, filename: string, skip: Set<string>): Promise<string | null> {
    let entries: import('node:fs').Dirent[];
    try {
        entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
        return null;
    }
    for (const entry of entries) {
        if (entry.isDirectory()) {
            if (skip.has(entry.name)) continue;
            const found = await findFileRecursive(path.join(dir, entry.name), filename, skip);
            if (found) return found;
        } else if (entry.name === filename) {
            return path.join(dir, entry.name);
        }
    }
    return null;
}

export async function listRecentPhotos(limit = 25): Promise<CsvPhoto[]> {
    if (!(await fileExists(CSV_PATH))) return [];
    const content = await fs.readFile(CSV_PATH, 'utf-8');
    const parsed = Papa.parse<Record<string, string>>(content, {
        header: true,
        skipEmptyLines: true,
        transformHeader: createUniqueHeaderTransform(),
    });

    // Load metadata files in parallel for efficiency
    const [altData, wikiData, detailsData, seoData, draftsData] = await Promise.all([
        readJsonSafely<Record<string, string>>(ALT_PATH, {}),
        readJsonSafely<Record<string, any>>(WIKI_PATH, {}),
        readJsonSafely<Record<string, any>>(DETAILS_PATH, {}),
        readJsonSafely<Record<string, string>>(SEO_PATH, {}),
        readJsonSafely<Record<string, boolean>>(DRAFTS_PATH, {}),
    ]);

    const rows = (parsed.data ?? []).slice(0, limit);
    const skip = new Set(['mini', 'annotations', 'skyplots']);
    const out: CsvPhoto[] = [];
    for (const row of rows) {
        const id = String(row.ID ?? '').trim();
        if (!id) continue;
        const uploaded = String(row.Uploaded ?? '');
        const year = uploaded.slice(0, 4);
        const rawName = `${id}_raw.jpg`;
        const rawPath = await findFileRecursive(ASTRO_ROOT, rawName, skip);
        const expectedMiniPath = path.join(ASTRO_ROOT, 'mini', year, `${id}_raw.jpg`);
        const miniPath = (await fileExists(expectedMiniPath)) ? expectedMiniPath : null;
        const expectedAnnotationPath = path.join(ASTRO_ROOT, 'annotations', year, `${id}_annotation.svg`);
        const hasAnnotation = await fileExists(expectedAnnotationPath);

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
            rawPath: rawPath ? path.relative(process.cwd(), rawPath) : undefined,
            miniPath: miniPath ? path.relative(process.cwd(), miniPath) : undefined,
            annotationPath: hasAnnotation ? path.relative(process.cwd(), expectedAnnotationPath) : undefined,
            draft: draftsData[id] === true,
        });
    }
    return out;
}

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
): Promise<void> {
    if (!/^\d+$/.test(id)) throw new Error('ID invalide');
    if (!/^\d{4}$/.test(year)) throw new Error('Année invalide');

    // 1. Update alt.json
    if (data.alt !== undefined) {
        const altData = await readJsonSafely<Record<string, string>>(ALT_PATH, {});
        const altKey = `/assets/astrophotographies/${year}/${id}_raw.jpg`;
        if (data.alt.trim()) {
            altData[altKey] = data.alt.trim();
        } else {
            delete altData[altKey];
        }
        await fs.writeFile(ALT_PATH, JSON.stringify(altData, null, 2), 'utf-8');
    }

    // 2. Update wikipedia.json
    if (data.wiki !== undefined) {
        const wikiData = await readJsonSafely<Record<string, any>>(WIKI_PATH, {});
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
        await fs.writeFile(WIKI_PATH, JSON.stringify(wikiData, null, 2), 'utf-8');
    }

    // 3. Update astro_details.json
    if (data.tech !== undefined) {
        const detailsData = await readJsonSafely<Record<string, any>>(DETAILS_PATH, {});
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
        await fs.writeFile(DETAILS_PATH, JSON.stringify(detailsData, null, 2), 'utf-8');
    }

    // 4. Update seo.json
    if (data.seo !== undefined) {
        const seoData = await readJsonSafely<Record<string, string>>(SEO_PATH, {});
        const slug = `${slugify(title)}-${id}`;
        const seoKey = `astrophotographies/${slug}`;
        if (data.seo.trim()) {
            seoData[seoKey] = data.seo.trim();
        } else {
            delete seoData[seoKey];
        }
        await fs.writeFile(SEO_PATH, JSON.stringify(seoData, null, 2), 'utf-8');
    }

    // 5. Update drafts.json
    if (data.draft !== undefined) {
        const draftsData = await readJsonSafely<Record<string, boolean>>(DRAFTS_PATH, {});
        if (data.draft) {
            draftsData[id] = true;
        } else {
            delete draftsData[id];
        }
        await fs.writeFile(DRAFTS_PATH, JSON.stringify(draftsData, null, 2), 'utf-8');
    }
}

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
