/**
 * Images des articles et des voyages sur l'admin distant, lues et écrites directement sur R2.
 *
 * Responsabilité : sur la Preview de `dev`, il n'y a pas de `src/assets/` ; les images vivent seulement
 * sur R2. Ce module couvre ce que les routes locales font sur le disque :
 *  - lister les images d'une entrée (`listRemoteImages`) ;
 *  - envoyer une image en deux temps : URL présignée pour que le navigateur dépose l'original sous
 *    `incoming/` (`createImageUpload`), puis traitement côté serveur (`finalizeImageUpload` : même
 *    compression que l'admin local, versions web 400/800/1200 et dimensions en métadonnées R2) ;
 *  - définir la couverture (`setRemoteCover`) et supprimer une image (`deleteRemoteImage`) ;
 *  - recalculer les entrées de `image-dimensions.json` et `web-images.json` d'une entrée, ajoutées au
 *    commit de l'article ou du voyage (`computeImageManifestChanges`).
 *
 * POURQUOI l'URL présignée : une fonction Vercel refuse un corps de requête de plus de 4,5 Mo, alors
 * qu'une photo de téléphone dépasse souvent cette taille.
 *
 * WARNING: effet distant. Ces fonctions écrivent et suppriment des objets dans le bucket R2 de
 * production ; chaque clé est bornée au préfixe `<section>/<année>/<slug>/` validé.
 */
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import {
    DeleteObjectsCommand,
    GetObjectCommand,
    HeadObjectCommand,
    ListObjectsV2Command,
    PutObjectCommand,
    type S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import sharp from 'sharp';
import { normalizeAssetKey, planWebImageWidths, webImageKey, WEB_IMAGES_PREFIX } from '@/utils/webImages.mjs';
import { compressImage, THUMB_SUFFIX } from './image-process';
import { getR2Target } from './r2-sync';
import { purgeReplacedImages, type CachePurgeResult } from './image-cache-purge';
import {
    isAcceptedArticleImage,
    jsonResponse,
    MIME_BY_EXT,
    sanitizeFilename,
    validateFilename,
    validateSlug,
    validateYear,
} from './shared';
import type { ContentReader } from './stores/content-reader';
import type { FileChange } from './stores/content-writer';

export type ImageSection = 'blog' | 'voyages';

export interface RemoteImageEntry {
    name: string;
    size: number;
    mtimeMs: number;
    /** Date ISO de dépôt sur R2 (la date de prise de vue EXIF n'est pas lue à distance). */
    capturedAt: string;
    dayKey: string;
    timeStr: string;
    is360: boolean;
}

export interface FinalizedImage {
    name: string;
    width: number;
    height: number;
    originalBytes: number;
    compressedBytes: number;
    is360: boolean;
    /** L'image remplace une image du même nom : le cache du worker a été purgé (voir `cachePurge`). */
    replaced?: boolean;
    cachePurge?: CachePurgeResult;
}

/** Délai de validité de l'URL d'envoi présignée. */
const UPLOAD_URL_TTL_SECONDS = 10 * 60;
/** POURQUOI 150 Mo : même plafond que l'envoi local, pour les panoramas sphériques. */
export const MAX_UPLOAD_BYTES = 150 * 1024 * 1024;
/** Images comptées dans les manifestes (même périmètre que compute-image-dimensions.mjs). */
const MANIFEST_SOURCE_RE = /\.(jpe?g|png|webp|avif)$/i;
const WEB_SOURCE_RE = /\.(jpe?g|png)$/i;
const IS_360_RE = /(?:^|[_\-.])(360|sphere)(?:[_\-.]|$)/i;
/** Qualité des versions web, alignée sur scripts/build/generate-web-images.mjs. */
const WEB_IMAGE_QUALITY = 75;
const DIMENSIONS_PATH = 'src/data/image-dimensions.json';
const WEB_IMAGES_PATH = 'src/data/web-images.json';

/** R2 n'est pas configuré (variables R2_* absentes de l'environnement). */
export class R2NotConfiguredError extends Error {
    constructor() {
        super('R2 non configuré : définir R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY et R2_BUCKET_NAME');
        this.name = 'R2NotConfiguredError';
    }
}

/** Requête d'envoi refusée (type, taille, nom, clé hors de l'entrée). */
export class InvalidImageRequestError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'InvalidImageRequestError';
    }
}

function requireR2(): { client: S3Client; bucket: string } {
    const target = getR2Target();
    if (!target) throw new R2NotConfiguredError();
    return target;
}

/**
 * Préfixe R2 des images d'une entrée.
 *
 * @param section - `blog` ou `voyages`.
 * @param year - Année du dossier.
 * @param slug - Slug.
 * @returns `<section>/<année>/<slug>/`.
 * @throws InvalidImageRequestError si l'année ou le slug est invalide.
 */
export function entryPrefix(section: ImageSection, year: string, slug: string): string {
    if (!validateYear(year) || !validateSlug(slug)) throw new InvalidImageRequestError('Année ou slug invalide');
    return `${section}/${year}/${slug}/`;
}

function imageKey(section: ImageSection, year: string, slug: string, filename: string): string {
    if (!validateFilename(filename)) throw new InvalidImageRequestError('Nom de fichier invalide');
    return `${entryPrefix(section, year, slug)}${filename}`;
}

async function listKeys(
    client: S3Client,
    bucket: string,
    prefix: string,
): Promise<{ key: string; size: number; lastModified: Date }[]> {
    const objects: { key: string; size: number; lastModified: Date }[] = [];
    let continuationToken: string | undefined;
    do {
        const page = await client.send(
            new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: continuationToken }),
        );
        for (const object of page.Contents ?? []) {
            if (!object.Key) continue;
            objects.push({ key: object.Key, size: object.Size ?? 0, lastModified: object.LastModified ?? new Date(0) });
        }
        continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (continuationToken);
    return objects;
}

async function deleteKeys(client: S3Client, bucket: string, keys: string[]): Promise<void> {
    for (let start = 0; start < keys.length; start += 1000) {
        const batch = keys.slice(start, start + 1000);
        if (batch.length === 0) continue;
        await client.send(
            new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: batch.map((Key) => ({ Key })) } }),
        );
    }
}

async function readObject(client: S3Client, bucket: string, key: string): Promise<Buffer> {
    const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!object.Body) throw new InvalidImageRequestError(`Objet vide : ${key}`);
    return Buffer.from(await object.Body.transformToByteArray());
}

function mimeFor(filename: string): string {
    return MIME_BY_EXT[path.extname(filename).toLowerCase()] ?? 'application/octet-stream';
}

function isThumb(filename: string): boolean {
    return filename.toLowerCase().includes(THUMB_SUFFIX);
}

/**
 * Liste les images d'une entrée sur R2, sans miniatures ni sous-dossiers, triées par date de dépôt.
 *
 * @param section - `blog` ou `voyages`.
 * @param year - Année du dossier.
 * @param slug - Slug.
 * @returns Les images.
 */
export async function listRemoteImages(section: ImageSection, year: string, slug: string): Promise<RemoteImageEntry[]> {
    const { client, bucket } = requireR2();
    const prefix = entryPrefix(section, year, slug);
    const entries = (await listKeys(client, bucket, prefix))
        .map((object) => ({ ...object, name: object.key.slice(prefix.length) }))
        .filter(({ name }) => name && !name.includes('/') && !name.startsWith('.') && !isThumb(name))
        .map(({ name, size, lastModified }) => {
            const capturedAt = lastModified.toISOString();
            return {
                name,
                size,
                mtimeMs: lastModified.getTime(),
                capturedAt,
                dayKey: capturedAt.slice(0, 10),
                timeStr: capturedAt.slice(11, 16),
                is360: IS_360_RE.test(name),
            };
        });
    entries.sort(
        (a, b) =>
            a.capturedAt.localeCompare(b.capturedAt) || a.name.localeCompare(b.name, undefined, { numeric: true }),
    );
    return entries;
}

/**
 * Prépare l'envoi direct d'une image vers R2.
 *
 * @param section - `blog` ou `voyages`.
 * @param year - Année du dossier.
 * @param slug - Slug.
 * @param file - Nom, type MIME et taille annoncés par le navigateur.
 * @returns L'URL PUT présignée (10 min) et la clé temporaire à passer à `finalizeImageUpload`.
 * @throws InvalidImageRequestError si le type ou la taille est refusé.
 */
export async function createImageUpload(
    section: ImageSection,
    year: string,
    slug: string,
    file: { filename: string; contentType: string; size: number },
): Promise<{ uploadUrl: string; uploadKey: string }> {
    if (!isAcceptedArticleImage(file.filename, file.contentType)) {
        throw new InvalidImageRequestError(`Type non pris en charge : ${file.contentType}`);
    }
    if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
        throw new InvalidImageRequestError('Taille de fichier refusée');
    }
    const { client, bucket } = requireR2();
    const extension = path
        .extname(sanitizeFilename(file.filename))
        .toLowerCase()
        .replace(/[^.a-z0-9]/g, '');
    const uploadKey = `incoming/${entryPrefix(section, year, slug)}${randomUUID()}${extension}`;
    const uploadUrl = await getSignedUrl(
        client,
        new PutObjectCommand({ Bucket: bucket, Key: uploadKey, ContentType: file.contentType }),
        { expiresIn: UPLOAD_URL_TTL_SECONDS },
    );
    return { uploadUrl, uploadKey };
}

/**
 * Écrit une image source sur R2 avec ses dimensions en métadonnées, puis ses versions web.
 *
 * @param client - Client R2.
 * @param bucket - Bucket.
 * @param key - Clé de l'image source.
 * @param image - Contenu encodé et dimensions.
 */
async function putSourceImage(
    client: S3Client,
    bucket: string,
    key: string,
    image: { buffer: Buffer; width: number; height: number },
): Promise<void> {
    await client.send(
        new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: image.buffer,
            ContentType: mimeFor(key),
            // POURQUOI : computeImageManifestChanges relit ces métadonnées (HEAD) au lieu de retélécharger l'image.
            Metadata: image.width > 0 ? { width: String(image.width), height: String(image.height) } : undefined,
        }),
    );
    if (!WEB_SOURCE_RE.test(key) || image.width <= 0) return;
    for (const width of planWebImageWidths(image.width)) {
        const derivative = await sharp(image.buffer)
            .resize({ width, withoutEnlargement: true })
            .jpeg({ quality: WEB_IMAGE_QUALITY, mozjpeg: true, chromaSubsampling: '4:2:0' })
            .toBuffer();
        await client.send(
            new PutObjectCommand({
                Bucket: bucket,
                Key: webImageKey(normalizeAssetKey(key), width),
                Body: derivative,
                ContentType: 'image/jpeg',
            }),
        );
    }
}

/**
 * Traite une image déposée par `createImageUpload` : compression identique à l'admin local, écriture
 * de l'image finale (même nom écrasé, comme en local), versions web, suppression du fichier temporaire.
 *
 * @param section - `blog` ou `voyages`.
 * @param year - Année du dossier.
 * @param slug - Slug.
 * @param upload - Clé temporaire, nom d'origine, photo 360° (blog seulement : 6000 px q90, nom suffixé `-360`).
 * @returns L'image enregistrée.
 * @throws InvalidImageRequestError si la clé n'appartient pas à cette entrée ou si le fichier est trop gros.
 */
export async function finalizeImageUpload(
    section: ImageSection,
    year: string,
    slug: string,
    upload: { uploadKey: string; filename: string; is360?: boolean },
): Promise<FinalizedImage> {
    const incomingPrefix = `incoming/${entryPrefix(section, year, slug)}`;
    const temporaryName = upload.uploadKey.slice(incomingPrefix.length);
    // WARNING: sécurité. Seule une clé temporaire de cette entrée peut être lue puis supprimée.
    if (!upload.uploadKey.startsWith(incomingPrefix) || !validateFilename(temporaryName)) {
        throw new InvalidImageRequestError('Clé d’envoi invalide');
    }
    // POURQUOI : `compressImage()` choisit son traitement d'après ce nom, fourni à part de l'envoi.
    if (!isAcceptedArticleImage(upload.filename, null) || !isAcceptedArticleImage(temporaryName, null)) {
        throw new InvalidImageRequestError('Type non pris en charge');
    }
    const { client, bucket } = requireR2();
    const original = await readObject(client, bucket, upload.uploadKey);
    if (original.length > MAX_UPLOAD_BYTES) throw new InvalidImageRequestError('Taille de fichier refusée');

    const is360 = section === 'blog' && upload.is360 === true;
    // POURQUOI : mêmes réglages que la route locale (photo 360° : 6000 px, q90 ; sinon 2400 px, q82).
    const { full } = await compressImage(original, upload.filename, is360 ? { maxSize: 6000, quality: 90 } : {});
    let name = sanitizeFilename(full.filename);
    // POURQUOI : à distance, le manifeste .360-manifest.json n'existe pas ; le suffixe `-360` permet de
    // reconnaître la photo sphérique par son nom, partout (listes locale et distante).
    if (is360 && !IS_360_RE.test(name)) name = name.replace(/(\.[^.]+)$/, '-360$1');
    if (!validateFilename(name)) throw new InvalidImageRequestError('Nom de fichier invalide');

    const targetKey = imageKey(section, year, slug, name);
    // POURQUOI : un renvoi sous le même nom garde l'URL ; il faut alors purger le cache du worker.
    const replaced = await client
        .send(new HeadObjectCommand({ Bucket: bucket, Key: targetKey }))
        .then(() => true)
        .catch(() => false);
    await putSourceImage(client, bucket, targetKey, full);
    await deleteKeys(client, bucket, [upload.uploadKey]);
    const cachePurge = replaced ? await purgeReplacedImages([targetKey]) : undefined;
    return {
        replaced,
        cachePurge,
        name,
        width: full.width,
        height: full.height,
        originalBytes: full.originalBytes,
        compressedBytes: full.compressedBytes,
        is360: is360 || IS_360_RE.test(name),
    };
}

/**
 * Définit la couverture d'une entrée sur R2, comme les routes locales :
 *  - blog : miniature `<nom>-thumb.jpg` de l'image choisie ;
 *  - voyages : copie en `cover.jpg` et miniature `cover-thumb.jpg`.
 * Les autres miniatures de l'entrée sont supprimées.
 *
 * @param section - `blog` ou `voyages`.
 * @param year - Année du dossier.
 * @param slug - Slug.
 * @param filename - Image choisie.
 * @returns Le nom de l'image de couverture et celui de sa miniature.
 */
export async function setRemoteCover(
    section: ImageSection,
    year: string,
    slug: string,
    filename: string,
): Promise<{ cover: string; thumb: string }> {
    const { client, bucket } = requireR2();
    const source = await readObject(client, bucket, imageKey(section, year, slug, filename));
    const coverName = section === 'voyages' ? 'cover.jpg' : filename;
    const thumbName = `${path.basename(coverName, path.extname(coverName))}${THUMB_SUFFIX}.jpg`;

    if (section === 'voyages') {
        const metadata = await sharp(source).metadata();
        await putSourceImage(client, bucket, imageKey(section, year, slug, coverName), {
            buffer: source,
            width: metadata.autoOrient?.width ?? metadata.width ?? 0,
            height: metadata.autoOrient?.height ?? metadata.height ?? 0,
        });
    }
    const { thumb } = await compressImage(source, coverName);
    if (!thumb) throw new InvalidImageRequestError('Miniature impossible pour ce type de fichier');
    await client.send(
        new PutObjectCommand({
            Bucket: bucket,
            Key: imageKey(section, year, slug, thumbName),
            Body: thumb.buffer,
            ContentType: 'image/jpeg',
        }),
    );

    const prefix = entryPrefix(section, year, slug);
    const staleThumbs = (await listKeys(client, bucket, prefix))
        .map(({ key }) => key)
        .filter((key) => isThumb(key.slice(prefix.length)) && key !== `${prefix}${thumbName}`);
    await deleteKeys(client, bucket, staleThumbs);
    return { cover: coverName, thumb: thumbName };
}

/**
 * Supprime une image d'une entrée sur R2, avec sa miniature et ses versions web.
 *
 * @param section - `blog` ou `voyages`.
 * @param year - Année du dossier.
 * @param slug - Slug.
 * @param filename - Image à supprimer.
 */
export async function deleteRemoteImage(
    section: ImageSection,
    year: string,
    slug: string,
    filename: string,
): Promise<void> {
    const { client, bucket } = requireR2();
    const key = imageKey(section, year, slug, filename);
    const base = path.basename(filename, path.extname(filename));
    const webBase = `${WEB_IMAGES_PREFIX}${normalizeAssetKey(key).replace(/\.[^./]+$/, '')}-w`;
    const webKeys = (await listKeys(client, bucket, webBase))
        .map((object) => object.key)
        .filter((webKey) => /^\d+\.jpg$/.test(webKey.slice(webBase.length)));
    await deleteKeys(client, bucket, [
        key,
        `${entryPrefix(section, year, slug)}${base}${THUMB_SUFFIX}.jpg`,
        ...webKeys,
    ]);
}

function parseJsonRecord<T>(raw: string | null): Record<string, T> {
    if (!raw) return {};
    try {
        const parsed = JSON.parse(raw) as unknown;
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, T>) : {};
    } catch {
        return {};
    }
}

/**
 * Recalcule, d'après R2, les entrées d'une entrée de contenu dans `image-dimensions.json` et
 * `web-images.json`, pour les ajouter au commit qui enregistre l'article ou le voyage.
 *
 * POURQUOI : sans ces entrées, le build n'a ni width/height (CLS) ni versions web (le worker sert
 * l'original). Les dimensions manquantes viennent des métadonnées posées par `putSourceImage` ; une
 * image sans métadonnées (envoyée par un script) garde son entrée existante. Les entrées d'images
 * absentes de R2 sont retirées.
 *
 * @param section - `blog` ou `voyages`.
 * @param year - Année du dossier.
 * @param slug - Slug.
 * @param reader - Lecteur de la branche de contenu.
 * @returns Les fichiers à committer (vide si rien ne change).
 */
export async function computeImageManifestChanges(
    section: ImageSection,
    year: string,
    slug: string,
    reader: ContentReader,
): Promise<FileChange[]> {
    const { client, bucket } = requireR2();
    const prefix = entryPrefix(section, year, slug);
    const sourceKeys = (await listKeys(client, bucket, prefix))
        .map(({ key }) => key)
        .filter((key) => {
            const name = key.slice(prefix.length);
            return !name.includes('/') && !isThumb(name) && MANIFEST_SOURCE_RE.test(name);
        });
    const normalizedPrefix = normalizeAssetKey(prefix);
    const webListing = await listKeys(client, bucket, `${WEB_IMAGES_PREFIX}${normalizedPrefix}`);
    const webWidthsByBase = new Map<string, number[]>();
    for (const { key } of webListing) {
        const match = key.slice(WEB_IMAGES_PREFIX.length).match(/^(.*)-w(\d+)\.jpg$/);
        if (!match) continue;
        webWidthsByBase.set(match[1], [...(webWidthsByBase.get(match[1]) ?? []), Number(match[2])]);
    }

    const dimensionsRaw = await reader.readText(DIMENSIONS_PATH);
    const webRaw = await reader.readText(WEB_IMAGES_PATH);
    const dimensions = parseJsonRecord<{ width: number; height: number }>(dimensionsRaw);
    const webImages = parseJsonRecord<number[]>(webRaw);
    const present = new Set<string>();

    for (const rawKey of sourceKeys) {
        const key = normalizeAssetKey(rawKey);
        present.add(key);
        if (!dimensions[key]) {
            const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: rawKey }));
            const width = Number(head.Metadata?.width);
            const height = Number(head.Metadata?.height);
            if (width > 0 && height > 0) dimensions[key] = { width, height };
        }
        const widths = (webWidthsByBase.get(key.replace(/\.[^./]+$/, '')) ?? []).sort((a, b) => a - b);
        if (widths.length > 0) webImages[key] = widths;
        else delete webImages[key];
    }
    for (const manifest of [dimensions, webImages] as Record<string, unknown>[]) {
        for (const key of Object.keys(manifest)) {
            if (key.startsWith(normalizedPrefix) && !present.has(key)) delete manifest[key];
        }
    }

    const dimensionsContent = `${JSON.stringify(
        Object.fromEntries(Object.entries(dimensions).sort(([a], [b]) => a.localeCompare(b))),
        null,
        2,
    )}\n`;
    const webContent = `${JSON.stringify(
        Object.fromEntries(
            Object.keys(webImages)
                .sort()
                .map((key) => [key, webImages[key]]),
        ),
        null,
        2,
    )}\n`;
    const changes: FileChange[] = [];
    if (dimensionsContent !== dimensionsRaw) changes.push({ path: DIMENSIONS_PATH, content: dimensionsContent });
    if (webContent !== webRaw) changes.push({ path: WEB_IMAGES_PATH, content: webContent });
    return changes;
}

/**
 * Variante de `computeImageManifestChanges` pour l'enregistrement d'un article ou d'un voyage : sans R2
 * configuré, l'enregistrement du texte ne doit pas échouer ; les manifestes restent alors inchangés.
 *
 * @param section - `blog` ou `voyages`.
 * @param year - Année du dossier.
 * @param slug - Slug.
 * @param reader - Lecteur de la branche de contenu.
 * @returns Les fichiers à committer, vide si R2 manque.
 */
export async function imageManifestChangesForSave(
    section: ImageSection,
    year: string,
    slug: string,
    reader: ContentReader,
): Promise<FileChange[]> {
    try {
        return await computeImageManifestChanges(section, year, slug, reader);
    } catch (error) {
        if (!(error instanceof R2NotConfiguredError)) throw error;
        console.warn('[admin] manifestes d’images non mis à jour :', error.message);
        return [];
    }
}

/**
 * Traduit l'échec d'une opération d'image distante en réponse HTTP.
 *
 * @param error - Erreur levée par une fonction de ce module.
 * @returns 400 pour une requête refusée, 503 si R2 n'est pas configuré.
 * @throws L'erreur d'origine dans les autres cas.
 */
export function toImageErrorResponse(error: unknown): Response {
    if (error instanceof InvalidImageRequestError) return jsonResponse({ error: error.message }, 400);
    if (error instanceof R2NotConfiguredError)
        return jsonResponse({ error: 'R2 n’est pas configuré sur ce déploiement.' }, 503);
    throw error;
}

/**
 * Lit la section d'image demandée par le client.
 *
 * @param value - Valeur reçue.
 * @returns La section, ou `null` si elle est inconnue.
 */
export function parseImageSection(value: unknown): ImageSection | null {
    return value === 'blog' || value === 'voyages' ? value : null;
}

export interface R2Diagnostic {
    /** Variables R2_* présentes. */
    configured: boolean;
    /** Bucket listé avec succès et au moins une image d'article trouvée. */
    ok: boolean;
    bucket?: string;
    /** `PUBLIC_R2_URL` défini (affichage des images dans l'éditeur). */
    publicUrlConfigured: boolean;
    hint?: string;
}

/**
 * Vérifie l'accès de l'admin distant au bucket R2, sans exposer de secret.
 *
 * @returns L'état des variables et de l'accès, avec une piste de correction en cas d'échec.
 */
export async function diagnoseR2Access(): Promise<R2Diagnostic> {
    const publicUrlConfigured = Boolean(import.meta.env.PUBLIC_R2_URL || process.env.PUBLIC_R2_URL);
    const target = getR2Target();
    if (!target) {
        // POURQUOI : seuls les noms sont renvoyés, jamais les valeurs.
        const missing = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME'].filter(
            (name) => !process.env[name]?.trim(),
        );
        return {
            configured: false,
            ok: false,
            publicUrlConfigured,
            hint: `Variables absentes sur ce déploiement : ${missing.join(', ') || 'aucune (redéployer)'}. Les ajouter dans Vercel pour la Preview de la branche dev, puis redéployer.`,
        };
    }
    try {
        const page = await target.client.send(
            new ListObjectsV2Command({ Bucket: target.bucket, Prefix: 'blog/', MaxKeys: 1 }),
        );
        const found = (page.Contents ?? []).length > 0;
        return {
            configured: true,
            ok: found,
            bucket: target.bucket,
            publicUrlConfigured,
            ...(found
                ? {}
                : { hint: `Bucket ${target.bucket} accessible mais vide sous blog/ : vérifier R2_BUCKET_NAME.` }),
        };
    } catch (error) {
        const name = error instanceof Error ? error.name : 'erreur';
        return {
            configured: true,
            ok: false,
            bucket: target.bucket,
            publicUrlConfigured,
            hint: `R2 refuse la lecture (${name}) : vérifier R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY et R2_BUCKET_NAME.`,
        };
    }
}
