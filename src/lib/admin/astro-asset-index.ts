/**
 * Index des fichiers des astrophotos (raw, miniatures, annotations), pour la vue d'ensemble de l'admin.
 *
 * Responsabilité : lister une seule fois les clés sous `astrophotographies/` (chemins relatifs à `src/assets/`,
 * identiques aux clés R2), depuis le disque en local ou depuis le bucket R2 sur l'admin distant, puis répondre
 * aux questions de la vue d'ensemble : où est le raw d'une photo, la miniature ou l'annotation existe-t-elle ?
 * Il lit aussi le début d'un fichier (origine des calques d'annotations, `annotation-source.ts`).
 *
 * POURQUOI un index : à distance il n'y a pas de `src/assets/` ; en local, il évite aussi une recherche
 * récursive dans tout le dossier pour chacune des ~200 photos.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getR2Target } from './r2-sync';

export const ASTRO_PREFIX = 'astrophotographies/';
/** Sous-dossiers qui ne contiennent pas de raw (dérivés et calques). */
const NON_RAW_DIRS = new Set(['mini', 'annotations', 'skyplots']);

export interface AstroAssetIndex {
    /** D'où viennent les clés : chemins à afficher en infobulle. */
    source: 'disk' | 'r2';
    /**
     * Clé du raw d'une photo, où qu'il soit rangé (l'année du dossier peut différer de celle du CSV).
     *
     * @param id - ID AstroBin.
     * @returns La clé, ou `null`.
     */
    findRaw(id: string): string | null;
    /** Indique si une clé existe. */
    has(key: string): boolean;
    /** Chemin lisible d'une clé (fichier du dépôt en local, objet R2 à distance). */
    describe(key: string): string;
    /** Date de dernière écriture connue sans lecture (liste R2) ; `null` sur le disque ou si inconnue. */
    modifiedAt(key: string): string | null;
    /**
     * Lit le début d'un fichier.
     *
     * @param key - Clé relative à `src/assets/`.
     * @param bytes - Nombre d'octets à lire.
     * @returns Le texte lu et la date de dernière écriture, ou `null` si le fichier est illisible.
     */
    readHead(key: string, bytes: number): Promise<{ text: string; modifiedAt?: string } | null>;
}

export interface AstroAssetIndexOptions {
    /** Dates de dernière écriture par clé (liste R2). */
    modifiedAt?: Map<string, string>;
    /** Lecture du début d'un fichier ; sans elle, `readHead` renvoie `null`. */
    readHead?: AstroAssetIndex['readHead'];
}

/**
 * Construit l'index à partir d'une liste de clés.
 *
 * @param keys - Clés relatives à `src/assets/` (`astrophotographies/2024/123_raw.jpg`).
 * @param source - Origine des clés.
 * @param options - Dates et lecture des fichiers (facultatives).
 * @returns L'index.
 */
export function buildAstroAssetIndex(
    keys: Iterable<string>,
    source: AstroAssetIndex['source'],
    options: AstroAssetIndexOptions = {},
): AstroAssetIndex {
    const keySet = new Set<string>();
    const rawById = new Map<string, string>();
    for (const key of keys) {
        keySet.add(key);
        if (!key.startsWith(ASTRO_PREFIX)) continue;
        const [firstDir] = key.slice(ASTRO_PREFIX.length).split('/');
        const match = /\/(\d+)_raw\.jpg$/.exec(key);
        if (match && !NON_RAW_DIRS.has(firstDir) && !rawById.has(match[1])) rawById.set(match[1], key);
    }
    return {
        source,
        findRaw: (id) => rawById.get(id) ?? null,
        has: (key) => keySet.has(key),
        describe: (key) => (source === 'disk' ? path.join('src/assets', key) : `R2 : ${key}`),
        modifiedAt: (key) => options.modifiedAt?.get(key) ?? null,
        readHead: async (key, bytes) => (keySet.has(key) && options.readHead ? options.readHead(key, bytes) : null),
    };
}

/**
 * Lit le début d'un fichier de `src/assets/`.
 *
 * @param key - Clé relative à `src/assets/`.
 * @param bytes - Nombre d'octets à lire.
 * @param projectRoot - Racine du dépôt.
 * @returns Le texte et la date de modification, ou `null` si le fichier est illisible.
 */
export async function readDiskHead(
    key: string,
    bytes: number,
    projectRoot = process.cwd(),
): Promise<{ text: string; modifiedAt: string } | null> {
    let handle;
    try {
        handle = await fs.open(path.join(projectRoot, 'src/assets', key), 'r');
        const buffer = Buffer.alloc(bytes);
        const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
        const stats = await handle.stat();
        return { text: buffer.subarray(0, bytesRead).toString('utf8'), modifiedAt: stats.mtime.toISOString() };
    } catch {
        return null;
    } finally {
        await handle?.close();
    }
}

/**
 * Lit le début d'un objet R2 (requête `Range`, sans télécharger tout le fichier).
 *
 * @param key - Clé de l'objet.
 * @param bytes - Nombre d'octets à lire.
 * @returns Le texte et la date de modification, ou `null` si R2 n'est pas configuré ou si la lecture échoue.
 */
export async function readR2Head(key: string, bytes: number): Promise<{ text: string; modifiedAt?: string } | null> {
    const target = getR2Target();
    if (!target) return null;
    try {
        const object = await target.client.send(
            new GetObjectCommand({ Bucket: target.bucket, Key: key, Range: `bytes=0-${bytes - 1}` }),
        );
        const text = (await object.Body?.transformToString('utf-8')) ?? '';
        return { text, modifiedAt: object.LastModified?.toISOString() };
    } catch {
        // POURQUOI : un objet illisible n'empêche pas d'afficher la liste ; son origine reste inconnue.
        return null;
    }
}

async function walk(directory: string, relative: string, out: string[]): Promise<void> {
    let entries;
    try {
        entries = await fs.readdir(directory, { withFileTypes: true });
    } catch {
        return;
    }
    for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        const childRelative = `${relative}${entry.name}`;
        if (entry.isDirectory()) await walk(path.join(directory, entry.name), `${childRelative}/`, out);
        else out.push(childRelative);
    }
}

/**
 * Liste les fichiers des astrophotos sur le disque.
 *
 * @param projectRoot - Racine du dépôt.
 * @returns Les clés relatives à `src/assets/` ; vide si le dossier n'existe pas.
 */
export async function listDiskAstroKeys(projectRoot = process.cwd()): Promise<string[]> {
    const keys: string[] = [];
    await walk(path.join(projectRoot, 'src/assets', ASTRO_PREFIX), ASTRO_PREFIX, keys);
    return keys;
}

/**
 * Liste les objets des astrophotos sur R2, avec leur date de dernière écriture.
 *
 * @returns Les objets, ou `null` si R2 n'est pas configuré.
 */
export async function listR2AstroObjects(): Promise<{ key: string; modifiedAt?: string }[] | null> {
    const target = getR2Target();
    if (!target) return null;
    const objects: { key: string; modifiedAt?: string }[] = [];
    let continuationToken: string | undefined;
    do {
        const page = await target.client.send(
            new ListObjectsV2Command({
                Bucket: target.bucket,
                Prefix: ASTRO_PREFIX,
                ContinuationToken: continuationToken,
            }),
        );
        for (const object of page.Contents ?? []) {
            if (object.Key) objects.push({ key: object.Key, modifiedAt: object.LastModified?.toISOString() });
        }
        continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (continuationToken);
    return objects;
}

/**
 * Liste les objets des astrophotos sur R2.
 *
 * @returns Les clés, ou `null` si R2 n'est pas configuré.
 */
export async function listR2AstroKeys(): Promise<string[] | null> {
    const objects = await listR2AstroObjects();
    return objects ? objects.map((object) => object.key) : null;
}

/**
 * Index des fichiers des astrophotos pour le mode courant.
 *
 * @param remote - Admin distant : lit R2 ; sinon, le disque.
 * @returns L'index (vide, sans erreur, si R2 n'est pas configuré : toutes les photos apparaissent incomplètes).
 */
export async function loadAstroAssetIndex(remote: boolean): Promise<AstroAssetIndex> {
    if (!remote)
        return buildAstroAssetIndex(await listDiskAstroKeys(), 'disk', {
            readHead: (key, bytes) => readDiskHead(key, bytes),
        });
    const objects = (await listR2AstroObjects()) ?? [];
    const modifiedAt = new Map<string, string>();
    for (const object of objects) if (object.modifiedAt) modifiedAt.set(object.key, object.modifiedAt);
    return buildAstroAssetIndex(
        objects.map((object) => object.key),
        'r2',
        { modifiedAt, readHead: readR2Head },
    );
}
