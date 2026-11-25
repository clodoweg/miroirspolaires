/**
 * Inventaire du bucket R2 et détection des fichiers orphelins.
 *
 * Responsabilité : lister tout le bucket, le résumer par grand dossier (nombre de fichiers, poids) et repérer les
 * objets que plus rien ne référence :
 *  - astrophotographies/ : photo absente du CSV, ou rangée sous une autre année que celle du CSV (le job d'import
 *    copie la photo sous la nouvelle année sans supprimer l'ancienne) ;
 *  - blog/, voyages/ : dossier d'un article ou d'un voyage qui n'existe plus ;
 *  - web/ : version web dont l'image source n'est plus sur R2 ;
 *  - incoming/ : envoi temporaire de plus d'un jour (envoi abandonné ou job interrompu).
 * Tout autre préfixe est seulement compté, jamais signalé.
 *
 * WARNING: effet destructif. `deleteR2Orphans` supprime des objets du bucket de production : il recalcule les
 * orphelins et refuse toute clé qui n'en fait pas partie.
 */
import { DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import Papa from 'papaparse';
import { listMarkdownEntriesWith } from './content-files';
import { getR2Target } from './r2-sync';
import { createUniqueHeaderTransform } from './shared';
import type { ContentReader } from './stores/content-reader';

export interface R2Object {
    key: string;
    size: number;
    lastModified: Date;
}

export interface R2PrefixSummary {
    prefix: string;
    count: number;
    sizeBytes: number;
}

export interface R2Orphan {
    key: string;
    size: number;
    reason: string;
}

export interface R2Inventory {
    totalCount: number;
    totalBytes: number;
    prefixes: R2PrefixSummary[];
    orphans: R2Orphan[];
}

/** Ce que le site référence, lu dans le dépôt. */
export interface R2References {
    /** Année du dossier de chaque photo du CSV (`Uploaded`), par ID AstroBin. */
    photoYears: Map<string, string>;
    /** Entrées `<année>/<slug>` existantes. */
    blogEntries: Set<string>;
    voyageEntries: Set<string>;
}

const ASTRO_SUBDIRS = new Set(['mini', 'annotations', 'skyplots']);
const YEAR_RE = /^\d{4}$/;
const INCOMING_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function astroOrphanReason(parts: string[], references: R2References): string | null {
    const isDerived = ASTRO_SUBDIRS.has(parts[1]);
    const year = isDerived ? parts[2] : parts[1];
    const fileName = parts[parts.length - 1];
    const id = /^(\d+)_/.exec(fileName)?.[1];
    // POURQUOI : une structure inattendue n'est jamais signalée ; mieux vaut un orphelin oublié qu'une photo supprimée.
    if (!year || !YEAR_RE.test(year) || !id) return null;
    const csvYear = references.photoYears.get(id);
    if (csvYear === undefined) return 'Photo absente du CSV AstroBin';
    if (csvYear !== year) return `Ancienne année : la photo est rangée sous ${csvYear}`;
    return null;
}

/**
 * Résume le bucket et repère les orphelins.
 *
 * @param objects - Objets du bucket.
 * @param references - Ce que le site référence.
 * @param now - Date courante (tests).
 * @returns L'inventaire.
 */
export function analyzeR2Inventory(objects: R2Object[], references: R2References, now = new Date()): R2Inventory {
    const byPrefix = new Map<string, R2PrefixSummary>();
    const sourceBases = new Set<string>();
    for (const object of objects) {
        const prefix = object.key.includes('/') ? `${object.key.split('/')[0]}/` : '(racine)';
        const summary = byPrefix.get(prefix) ?? { prefix, count: 0, sizeBytes: 0 };
        summary.count += 1;
        summary.sizeBytes += object.size;
        byPrefix.set(prefix, summary);
        if (!object.key.startsWith('web/')) sourceBases.add(object.key.replace(/\.[^./]+$/, ''));
    }

    const orphans: R2Orphan[] = [];
    for (const object of objects) {
        const parts = object.key.split('/');
        let reason: string | null = null;
        if (parts[0] === 'astrophotographies') {
            reason = astroOrphanReason(parts, references);
        } else if ((parts[0] === 'blog' || parts[0] === 'voyages') && parts.length >= 4 && YEAR_RE.test(parts[1])) {
            const entries = parts[0] === 'blog' ? references.blogEntries : references.voyageEntries;
            if (!entries.has(`${parts[1]}/${parts[2]}`)) {
                reason = parts[0] === 'blog' ? 'Article supprimé' : 'Voyage supprimé';
            }
        } else if (parts[0] === 'web') {
            const base = /^web\/(.+)-w\d+\.jpg$/.exec(object.key)?.[1];
            if (base && !sourceBases.has(base)) reason = 'Version web sans image source';
        } else if (parts[0] === 'incoming') {
            if (now.getTime() - object.lastModified.getTime() > INCOMING_MAX_AGE_MS) {
                reason = 'Envoi temporaire abandonné (plus d’un jour)';
            }
        }
        if (reason) orphans.push({ key: object.key, size: object.size, reason });
    }

    return {
        totalCount: objects.length,
        totalBytes: objects.reduce((total, object) => total + object.size, 0),
        prefixes: [...byPrefix.values()].sort((left, right) => right.sizeBytes - left.sizeBytes),
        orphans: orphans.sort((left, right) => left.key.localeCompare(right.key)),
    };
}

/**
 * Lit dans le dépôt ce que le site référence.
 *
 * @param reader - Source des fichiers (disque en local, branche dev à distance).
 * @returns Les photos du CSV et les entrées du blog et des voyages.
 */
export async function loadR2References(reader: ContentReader): Promise<R2References> {
    const [csv, blog, voyages] = await Promise.all([
        reader.readText('data/astrobin_clodoweg_gallery_python.csv'),
        listMarkdownEntriesWith(reader, 'src/content/blog'),
        listMarkdownEntriesWith(reader, 'src/content/voyages'),
    ]);
    // POURQUOI : sans CSV lisible, toutes les photos paraîtraient orphelines ; on refuse plutôt d'analyser.
    if (csv === null) throw new Error('CSV AstroBin introuvable : analyse des orphelins impossible.');
    const parsed = Papa.parse<Record<string, string>>(csv, {
        header: true,
        skipEmptyLines: true,
        transformHeader: createUniqueHeaderTransform(),
    });
    const photoYears = new Map<string, string>();
    for (const row of parsed.data ?? []) {
        const id = String(row.ID ?? '').trim();
        const year = String(row.Uploaded ?? '').slice(0, 4);
        if (id && YEAR_RE.test(year)) photoYears.set(id, year);
    }
    return {
        photoYears,
        blogEntries: new Set(blog.map((entry) => `${entry.year}/${entry.slug}`)),
        voyageEntries: new Set(voyages.map((entry) => `${entry.year}/${entry.slug}`)),
    };
}

/**
 * Liste tous les objets du bucket.
 *
 * @returns Les objets.
 * @throws Error si R2 n'est pas configuré.
 */
export async function listAllR2Objects(): Promise<R2Object[]> {
    const target = getR2Target();
    if (!target) throw new Error('R2 n’est pas configuré sur ce déploiement.');
    const objects: R2Object[] = [];
    let continuationToken: string | undefined;
    do {
        const page = await target.client.send(
            new ListObjectsV2Command({ Bucket: target.bucket, ContinuationToken: continuationToken }),
        );
        for (const object of page.Contents ?? []) {
            if (!object.Key) continue;
            objects.push({ key: object.Key, size: object.Size ?? 0, lastModified: object.LastModified ?? new Date(0) });
        }
        continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (continuationToken);
    return objects;
}

/**
 * Inventaire complet du bucket.
 *
 * @param reader - Source des références.
 * @returns L'inventaire.
 */
export async function loadR2Inventory(reader: ContentReader): Promise<R2Inventory> {
    const [objects, references] = await Promise.all([listAllR2Objects(), loadR2References(reader)]);
    return analyzeR2Inventory(objects, references);
}

/** Demande de suppression refusée (clé qui n'est pas un orphelin, liste vide ou trop longue). */
export class R2OrphanRequestError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'R2OrphanRequestError';
    }
}

export const MAX_ORPHANS_PER_DELETE = 1000;

/**
 * Supprime des orphelins de R2.
 *
 * WARNING: destructif. Les orphelins sont recalculés ici : toute clé demandée qui n'en est pas un est refusée,
 * et rien n'est supprimé.
 *
 * @param keys - Clés à supprimer (non fiables).
 * @param reader - Source des références.
 * @returns Les clés supprimées.
 * @throws R2OrphanRequestError si la demande est invalide.
 */
export async function deleteR2Orphans(keys: unknown, reader: ContentReader): Promise<string[]> {
    if (!Array.isArray(keys) || keys.length === 0 || keys.length > MAX_ORPHANS_PER_DELETE) {
        throw new R2OrphanRequestError(`Entre 1 et ${MAX_ORPHANS_PER_DELETE} clés attendues.`);
    }
    const inventory = await loadR2Inventory(reader);
    const allowed = new Set(inventory.orphans.map((orphan) => orphan.key));
    const requested = [...new Set(keys)];
    const refused = requested.filter((key) => typeof key !== 'string' || !allowed.has(key));
    if (refused.length > 0) {
        throw new R2OrphanRequestError(`${refused.length} clé(s) ne sont pas des orphelins : rien n’a été supprimé.`);
    }
    const target = getR2Target();
    if (!target) throw new Error('R2 n’est pas configuré sur ce déploiement.');
    await target.client.send(
        new DeleteObjectsCommand({
            Bucket: target.bucket,
            Delete: { Objects: (requested as string[]).map((key) => ({ Key: key })), Quiet: true },
        }),
    );
    return requested as string[];
}
