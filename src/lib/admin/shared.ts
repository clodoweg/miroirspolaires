import { promises as fs } from 'node:fs';
import path from 'node:path';
import { foldAccents } from '@/utils/normalize';

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const YEAR_RE = /^\d{4}$/;
const FILENAME_RE = /^[a-zA-Z0-9._~-]+$/;

// POURQUOI : garde des routes `/api/admin/**`, réexportée ici pour que les routes importent tous leurs
// helpers depuis `shared.ts`. Définition et règles d'accès : `auth/access.ts`.
export { requireAdmin } from './auth/access';

export function validateYear(year: string): boolean {
    return YEAR_RE.test(year);
}

export function validateSlug(slug: string): boolean {
    return SLUG_RE.test(slug) && slug.length <= 120;
}

export function validateFilename(name: string): boolean {
    return FILENAME_RE.test(name) && !name.startsWith('.') && name.length <= 200;
}

export function safeResolve(root: string, ...segments: string[]): string {
    const resolved = path.resolve(root, ...segments);
    const rel = path.relative(root, resolved);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
        throw new Error('Path traversal blocked');
    }
    return resolved;
}

export async function ensureDir(dir: string): Promise<void> {
    await fs.mkdir(dir, { recursive: true });
}

export async function fileExists(p: string): Promise<boolean> {
    try {
        await fs.access(p);
        return true;
    } catch {
        return false;
    }
}

/**
 * Minimal frontmatter parser tailored to this project's YAML usage.
 * Supports: scalar strings (quoted or bare), arrays as `- item` lists, booleans, numbers.
 */
export function parseFrontmatter(source: string): { data: Record<string, unknown>; body: string } {
    const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!match) return { data: {}, body: source };
    const [, yaml, body] = match;
    const data: Record<string, unknown> = {};
    const lines = yaml.split(/\r?\n/);
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        if (!line.trim() || line.trim().startsWith('#')) {
            i++;
            continue;
        }
        const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/);
        if (!m) {
            i++;
            continue;
        }
        const key = m[1];
        const rest = m[2];
        if (rest.trim() === '') {
            const items: string[] = [];
            i++;
            while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
                items.push(unquote(lines[i].replace(/^\s*-\s+/, '').trim()));
                i++;
            }
            data[key] = items;
            continue;
        }
        data[key] = coerce(rest.trim());
        i++;
    }
    return { data, body };
}

function unquote(v: string): string {
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        return v.slice(1, -1).replace(/\\"/g, '"').replace(/\\'/g, "'");
    }
    return v;
}

function coerce(v: string): string | boolean | number {
    if (v === 'true') return true;
    if (v === 'false') return false;
    if (/^-?\d+$/.test(v)) return Number(v);
    return unquote(v);
}

export function yamlString(v: string): string {
    if (v === '') return '""';
    // Quote anything containing YAML-significant chars to be safe.
    if (/^[A-Za-z0-9 _.,!?àâäéèêëîïôöùûüç']+$/.test(v) && !v.startsWith('-') && !/^\d/.test(v)) {
        return v;
    }
    return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function sanitizeFilename(name: string): string {
    const base = path.basename(name);
    return foldAccents(base)
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

export async function uniqueFilename(dir: string, name: string): Promise<string> {
    if (!(await fileExists(path.join(dir, name)))) return name;
    const ext = path.extname(name);
    const base = name.slice(0, name.length - ext.length);
    let i = 2;
    while (await fileExists(path.join(dir, `${base}-${i}${ext}`))) i++;
    return `${base}-${i}${ext}`;
}

export function jsonResponse(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', ...extraHeaders },
    });
}

/** Types MIME acceptés à l'envoi d'une image d'article ou de voyage (admin local et distant). */
export const ARTICLE_IMAGE_TYPE_RE = /^image\/(png|jpe?g|webp|gif|avif)$/i;
const SVG_FILENAME_RE = /\.svgz?$/i;

/**
 * Indique si un fichier peut être envoyé comme image d'article ou de voyage.
 *
 * WARNING: sécurité. Le SVG est refusé : `compressImage()` le publie tel quel, et un SVG ouvert à son
 * adresse sur R2 peut exécuter un script. Le type MIME est déclaré par le navigateur, et le traitement se
 * fie à l'extension : les deux sont vérifiés. Les annotations SVG des astrophotos ne passent pas par là
 * (pipeline `scripts/pipeline/update-photos.mjs`).
 *
 * @param filename - Nom du fichier envoyé.
 * @param contentType - Type MIME annoncé, ou `null` s'il n'est pas connu à cette étape.
 * @returns `true` si le fichier est accepté.
 */
export function isAcceptedArticleImage(filename: string, contentType: string | null): boolean {
    if (SVG_FILENAME_RE.test(filename)) return false;
    return contentType === null || ARTICLE_IMAGE_TYPE_RE.test(contentType);
}

export const MIME_BY_EXT: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.avif': 'image/avif',
    '.svg': 'image/svg+xml',
};

/**
 * Crée un transformateur d'en-têtes pour PapaParse garantissant l'unicité de chaque colonne.
 * POURQUOI: Évite le warning console 'Duplicate headers found and renamed' si un CSV
 * comporte plusieurs colonnes de même nom (ex: Telescopes, Cameras, Mounts répétés dans l'export AstroBin).
 *
 * @returns {(header: string, index: number) => string} Fonction de transformation d'en-tête
 *
 * @example
 * Papa.parse(content, { header: true, transformHeader: createUniqueHeaderTransform() });
 */
export function createUniqueHeaderTransform(): (header: string, index: number) => string {
    const headerByIndex = new Map<number, string>();
    const seenCounts = new Map<string, number>();
    return (header: string, index: number): string => {
        if (headerByIndex.has(index)) {
            return headerByIndex.get(index)!;
        }
        const clean = header.trim();
        const count = seenCounts.get(clean) || 0;
        seenCounts.set(clean, count + 1);
        const uniqueName = count === 0 ? clean : `${clean}_${count}`;
        headerByIndex.set(index, uniqueName);
        return uniqueName;
    };
}

const DELETABLE_TOP_LEVEL = ['blog', 'voyages', 'astrophotographies'];
const FOLDER_SEGMENT = /^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/;

/**
 * Valide le dossier à supprimer : un dossier autorisé de premier niveau suivi de segments
 * simples, sans `..`, `.` ni séparateur Windows.
 *
 * WARNING: l'ancien contrôle ne regardait que le premier segment ; `blog/..` se résolvait en
 * `src/assets` et supprimait tous les médias, y compris les dossiers versionnés.
 *
 * @param folder - Valeur brute reçue dans le corps JSON.
 * @returns Le dossier normalisé (`blog/2025/slug`), ou `null` s'il est refusé.
 */
export function parseDeletableFolder(folder: unknown): string | null {
    if (typeof folder !== 'string') return null;
    const segments = folder.replace(/\/+$/, '').split('/');
    if (!DELETABLE_TOP_LEVEL.includes(segments[0])) return null;
    if (!segments.every((segment) => FOLDER_SEGMENT.test(segment) && segment !== '..')) return null;
    return segments.join('/');
}
