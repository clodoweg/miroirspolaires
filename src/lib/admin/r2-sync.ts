import 'dotenv/config';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { fileExists, MIME_BY_EXT } from './shared';

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
// POURQUOI : pas de valeur par défaut, pour ne jamais lire ou écrire dans un mauvais bucket.
const bucketName = process.env.R2_BUCKET_NAME ?? '';

let _client: S3Client | null = null;
function client(): S3Client | null {
    if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) return null;
    if (_client) return _client;
    _client = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId, secretAccessKey },
    });
    return _client;
}

/**
 * Client R2 et bucket configurés, pour les modules admin qui lisent ou écrivent directement sur R2.
 *
 * @returns Le client et le nom du bucket, ou `null` si les variables R2 manquent.
 */
export function getR2Target(): { client: S3Client; bucket: string } | null {
    const c = client();
    return c ? { client: c, bucket: bucketName } : null;
}

function mimeFor(file: string): string {
    return MIME_BY_EXT[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
}

export interface SyncResult {
    bucket: string;
    prefix: string;
    uploaded: string[];
    deleted: string[];
    skipped: string[];
    skippedReason?: 'no-credentials' | 'no-local-dir';
}

/**
 * Mirror a local directory to R2 under the given prefix.
 * - Files present locally but not remote → uploaded
 * - Files present locally with a different remote size → re-uploaded
 * - Files present remote but not local → deleted from R2
 *
 * Returns a summary. If R2 is not configured or the local directory is missing, returns
 * immediately with skippedReason and touches nothing on R2.
 */
export async function syncDirToR2(localDir: string, prefix: string): Promise<SyncResult> {
    const normPrefix = prefix.endsWith('/') ? prefix : `${prefix}/`;
    const c = client();
    if (!c) {
        return {
            bucket: bucketName,
            prefix: normPrefix,
            uploaded: [],
            deleted: [],
            skipped: [],
            skippedReason: 'no-credentials',
        };
    }
    if (!(await fileExists(localDir))) {
        // WARNING: ne jamais vider R2 quand le dossier local manque (machine sans les images,
        // CI, faute de frappe) : l'ancien comportement supprimait tout le préfixe distant.
        return {
            bucket: bucketName,
            prefix: normPrefix,
            uploaded: [],
            deleted: [],
            skipped: [],
            skippedReason: 'no-local-dir',
        };
    }

    const localEntries = await fs.readdir(localDir);
    const localFiles: { name: string; size: number }[] = [];
    for (const name of localEntries) {
        if (name.startsWith('.')) continue;
        const stat = await fs.stat(path.join(localDir, name));
        if (stat.isFile()) localFiles.push({ name, size: stat.size });
    }
    const localNames = new Set(localFiles.map((f) => f.name));

    const remote = await listAll(c, normPrefix);
    const remoteSizes = new Map<string, number>();
    const remoteNames: string[] = [];
    for (const obj of remote) {
        if (!obj.Key) continue;
        const name = obj.Key.slice(normPrefix.length);
        remoteSizes.set(name, obj.Size ?? -1);
        remoteNames.push(name);
    }

    const toDelete = remoteNames.filter((n) => !localNames.has(n));
    if (toDelete.length > 0) {
        await deleteKeys(
            c,
            toDelete.map((n) => normPrefix + n),
        );
    }

    const uploaded: string[] = [];
    const skipped: string[] = [];
    for (const f of localFiles) {
        if (remoteSizes.get(f.name) === f.size) {
            skipped.push(f.name);
            continue;
        }
        const body = await fs.readFile(path.join(localDir, f.name));
        await c.send(
            new PutObjectCommand({
                Bucket: bucketName,
                Key: normPrefix + f.name,
                Body: body,
                ContentType: mimeFor(f.name),
            }),
        );
        uploaded.push(f.name);
    }

    return { bucket: bucketName, prefix: normPrefix, uploaded, deleted: toDelete, skipped };
}

async function listAll(c: S3Client, prefix: string): Promise<Array<{ Key?: string; Size?: number }>> {
    const all: Array<{ Key?: string; Size?: number }> = [];
    let token: string | undefined;
    do {
        const res = await c.send(
            new ListObjectsV2Command({
                Bucket: bucketName,
                Prefix: prefix,
                ContinuationToken: token,
            }),
        );
        if (res.Contents) all.push(...res.Contents);
        token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    return all;
}

async function deleteKeys(c: S3Client, keys: string[]): Promise<void> {
    const chunk = 1000;
    for (let i = 0; i < keys.length; i += chunk) {
        const slice = keys.slice(i, i + chunk);
        await c.send(
            new DeleteObjectsCommand({
                Bucket: bucketName,
                Delete: { Objects: slice.map((Key) => ({ Key })) },
            }),
        );
    }
}
