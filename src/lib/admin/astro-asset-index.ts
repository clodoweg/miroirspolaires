/**
 * Index des fichiers des astrophotos (raw, miniatures, annotations), pour la vue d'ensemble de l'admin.
 *
 * Responsabilité : lister une seule fois les clés sous `astrophotographies/` (chemins relatifs à `src/assets/`,
 * identiques aux clés R2), depuis le disque en local ou depuis le bucket R2 sur l'admin distant, puis répondre
 * aux questions de la vue d'ensemble : où est le raw d'une photo, la miniature ou l'annotation existe-t-elle ?
 *
 * POURQUOI un index : à distance il n'y a pas de `src/assets/` ; en local, il évite aussi une recherche
 * récursive dans tout le dossier pour chacune des ~200 photos.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';
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
}

/**
 * Construit l'index à partir d'une liste de clés.
 *
 * @param keys - Clés relatives à `src/assets/` (`astrophotographies/2024/123_raw.jpg`).
 * @param source - Origine des clés.
 * @returns L'index.
 */
export function buildAstroAssetIndex(keys: Iterable<string>, source: AstroAssetIndex['source']): AstroAssetIndex {
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
    };
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
 * Liste les objets des astrophotos sur R2.
 *
 * @returns Les clés, ou `null` si R2 n'est pas configuré.
 */
export async function listR2AstroKeys(): Promise<string[] | null> {
    const target = getR2Target();
    if (!target) return null;
    const keys: string[] = [];
    let continuationToken: string | undefined;
    do {
        const page = await target.client.send(
            new ListObjectsV2Command({
                Bucket: target.bucket,
                Prefix: ASTRO_PREFIX,
                ContinuationToken: continuationToken,
            }),
        );
        for (const object of page.Contents ?? []) if (object.Key) keys.push(object.Key);
        continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (continuationToken);
    return keys;
}

/**
 * Index des fichiers des astrophotos pour le mode courant.
 *
 * @param remote - Admin distant : lit R2 ; sinon, le disque.
 * @returns L'index (vide, sans erreur, si R2 n'est pas configuré : toutes les photos apparaissent incomplètes).
 */
export async function loadAstroAssetIndex(remote: boolean): Promise<AstroAssetIndex> {
    if (!remote) return buildAstroAssetIndex(await listDiskAstroKeys(), 'disk');
    return buildAstroAssetIndex((await listR2AstroKeys()) ?? [], 'r2');
}
