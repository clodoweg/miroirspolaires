/**
 * Envoi sur R2 en deux temps : préfixe temporaire, puis copie vers les clés définitives
 *
 * Responsabilité : pour un lot de fichiers locaux, envoyer sous `incoming/…/<clé>` ceux qui sont absents
 * de R2 ou différents, puis, une fois tout envoyé, les copier côté serveur vers leur clé définitive et
 * vider le préfixe temporaire. Utilisé par `scripts/pipeline/update-photos.mjs --ci`.
 *
 * POURQUOI : un envoi direct qui échoue au milieu laisse la production dans un état mélangé (raw neuf,
 * ancienne miniature). Ici, rien n'atteint les clés définitives tant que tout le lot n'est pas sur R2.
 * Le préfixe `incoming/` est aussi celui des envois de l'admin distant (règle de cycle de vie conseillée :
 * suppression après un jour), donc un run interrompu n'y laisse pas de déchets durables.
 *
 * Ce module n'est pas une CLI. Le client S3 est injecté (tests avec un faux client).
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { CopyObjectCommand, DeleteObjectsCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

/** Racine des préfixes temporaires des runs de mise à jour des astrophotos. */
export const ASTRO_STAGING_ROOT = 'incoming/astro/';

const CONTENT_TYPES = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.json': 'application/json',
};

// POURQUOI : DeleteObjects accepte au plus 1 000 clés par requête.
const DELETE_BATCH_SIZE = 1000;

/**
 * Préfixe temporaire d'un run.
 *
 * @param {string} runId - Identifiant du run (lettres, chiffres, `-`, `_`, `.`).
 * @returns {string} Le préfixe, terminé par `/`.
 * @throws {Error} Si l'identifiant est vide ou contient d'autres caractères (il ne doit pas sortir du préfixe).
 */
export function astroStagingPrefix(runId) {
    if (!/^[\w.-]+$/.test(String(runId)) || /^\.+$/.test(String(runId))) {
        throw new Error(`Identifiant de run invalide : ${runId}`);
    }
    return `${ASTRO_STAGING_ROOT}${runId}/`;
}

/**
 * Liste récursivement les fichiers d'un dossier, avec leur clé R2.
 *
 * @param {string} root - Dossier dont les chemins relatifs donnent les clés.
 * @param {string} [subdirectory] - Sous-dossier à parcourir (relatif à `root`) ; tout `root` par défaut.
 * @returns {{ key: string, path: string }[]} Les fichiers, hors fichiers et dossiers cachés, triés par clé.
 */
export function listFilesWithKeys(root, subdirectory = '') {
    const start = path.join(root, subdirectory);
    if (!fs.existsSync(start)) return [];
    const files = [];
    const walk = (directory) => {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            if (entry.name.startsWith('.')) continue;
            const fullPath = path.join(directory, entry.name);
            if (entry.isDirectory()) walk(fullPath);
            else files.push({ key: path.relative(root, fullPath).split(path.sep).join('/'), path: fullPath });
        }
    };
    walk(start);
    return files.sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Type MIME d'un fichier d'après son extension.
 *
 * @param {string} filePath - Chemin ou clé.
 * @returns {string} Le type, `application/octet-stream` par défaut.
 */
export function getContentType(filePath) {
    return CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

/**
 * Indique si un objet R2 a le même contenu que le fichier local.
 *
 * @param {{ ContentLength?: number, ETag?: string }} remote - Réponse HEAD de l'objet.
 * @param {string} localPath - Fichier local.
 * @returns {boolean} `true` si l'envoi est inutile.
 */
export function isSameAsRemote(remote, localPath) {
    if (remote.ContentLength !== fs.statSync(localPath).size) return false;
    const etag = String(remote.ETag ?? '').replaceAll('"', '');
    // POURQUOI : l'ETag d'un objet multipart (« hash-N ») n'est pas un MD5 ; la taille suffit alors.
    if (!etag || etag.includes('-')) return true;
    return createHash('md5').update(fs.readFileSync(localPath)).digest('hex') === etag;
}

/**
 * Lit les métadonnées d'un objet.
 *
 * @param {import('@aws-sdk/client-s3').S3Client} s3 - Client R2.
 * @param {string} bucket - Bucket.
 * @param {string} key - Clé.
 * @returns {Promise<object | null>} La réponse HEAD, ou `null` si l'objet n'existe pas.
 */
export async function headObject(s3, bucket, key) {
    try {
        return await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    } catch (error) {
        if (error?.$metadata?.httpStatusCode === 404 || error?.name === 'NotFound') return null;
        throw error;
    }
}

/**
 * Envoie sous le préfixe temporaire les fichiers absents de R2 ou différents de leur version sur R2.
 *
 * @param {{ s3: import('@aws-sdk/client-s3').S3Client, bucket: string, files: { key: string, path: string }[],
 *   prefix: string, log?: (line: string) => void }} options - `prefix` vient de `astroStagingPrefix()`.
 * @returns {Promise<{ staged: { key: string, stagingKey: string, isReplacement: boolean }[], unchanged: string[],
 *   errors: string[] }>} Les fichiers envoyés (avec `isReplacement` si la clé définitive existe déjà),
 *   ceux déjà identiques sur R2, et les erreurs.
 */
export async function stageFiles({ s3, bucket, files, prefix, log = console.log }) {
    const result = { staged: [], unchanged: [], errors: [] };
    for (const file of files) {
        try {
            const remote = await headObject(s3, bucket, file.key);
            if (remote && isSameAsRemote(remote, file.path)) {
                result.unchanged.push(file.key);
                continue;
            }
            const stagingKey = `${prefix}${file.key}`;
            await s3.send(
                new PutObjectCommand({
                    Bucket: bucket,
                    Key: stagingKey,
                    Body: fs.readFileSync(file.path),
                    ContentType: getContentType(file.path),
                }),
            );
            result.staged.push({ key: file.key, stagingKey, isReplacement: Boolean(remote) });
            log(`   ${remote ? '[remplacé]' : '[nouveau] '} ${file.key}`);
        } catch (error) {
            result.errors.push(`${file.key} : ${error.message}`);
        }
    }
    return result;
}

/**
 * Copie, côté serveur, chaque fichier du préfixe temporaire vers sa clé définitive.
 *
 * WARNING: écrit sur les clés de production. À n'appeler que si `stageFiles` n'a renvoyé aucune erreur.
 *
 * @param {{ s3: import('@aws-sdk/client-s3').S3Client, bucket: string,
 *   staged: { key: string, stagingKey: string }[] }} options - Résultat de `stageFiles`.
 * @returns {Promise<{ promoted: string[], errors: string[] }>} Les clés copiées et les erreurs.
 */
export async function promoteStagedFiles({ s3, bucket, staged }) {
    const result = { promoted: [], errors: [] };
    for (const { key, stagingKey } of staged) {
        try {
            const encodedSource = stagingKey.split('/').map(encodeURIComponent).join('/');
            await s3.send(
                new CopyObjectCommand({
                    Bucket: bucket,
                    Key: key,
                    CopySource: `${bucket}/${encodedSource}`,
                    MetadataDirective: 'COPY',
                }),
            );
            result.promoted.push(key);
        } catch (error) {
            result.errors.push(`${key} : ${error.message}`);
        }
    }
    return result;
}

/**
 * Supprime les objets du préfixe temporaire.
 *
 * @param {{ s3: import('@aws-sdk/client-s3').S3Client, bucket: string,
 *   staged: { stagingKey: string }[] }} options - Résultat de `stageFiles`.
 * @returns {Promise<string[]>} Les erreurs (une suppression ratée n'est pas grave : la règle de cycle
 *   de vie de `incoming/` finit le ménage).
 */
export async function deleteStagedFiles({ s3, bucket, staged }) {
    const errors = [];
    for (let start = 0; start < staged.length; start += DELETE_BATCH_SIZE) {
        const batch = staged.slice(start, start + DELETE_BATCH_SIZE);
        try {
            const response = await s3.send(
                new DeleteObjectsCommand({
                    Bucket: bucket,
                    Delete: { Objects: batch.map(({ stagingKey }) => ({ Key: stagingKey })), Quiet: true },
                }),
            );
            for (const error of response?.Errors ?? []) errors.push(`${error.Key} : ${error.Message}`);
        } catch (error) {
            errors.push(error.message);
        }
    }
    return errors;
}
