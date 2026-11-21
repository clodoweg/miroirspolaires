import type { APIRoute } from 'astro';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { requireAdmin, jsonResponse } from '@/lib/admin/shared';
import { LOCAL_ONLY_DIRS } from '@/config/imageConfig.mjs';

export const prerender = false;

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
// POURQUOI : pas de valeur par défaut, pour ne jamais lire ou écrire dans un mauvais bucket.
const bucketName = process.env.R2_BUCKET_NAME ?? '';

const ASSETS_DIR = path.join(process.cwd(), 'src/assets');

/**
 * Statistiques détaillées de synchronisation de cache et de cohérence pour un répertoire spécifique.
 */
interface CategoryStats {
    files: number;
    size: number;
    hasNewerLocal: boolean;
    hasMissingR2: boolean;
    hasMissingLocal: boolean;
    isIdentical: boolean;
}

/**
 * Représente les métadonnées d'un fichier individuel utiles à la synchronisation.
 */
interface FileMetadata {
    size: number;
    mtimeMs: number;
}

/**
 * Résultat intermédiaire de la fonction d'analyse locale.
 */
interface LocalStatsResult {
    totalFiles: number;
    totalSize: number;
    categories: Record<string, { files: number; size: number }>;
    filesMap: Map<string, FileMetadata>;
}

/**
 * Résultat intermédiaire de la fonction d'analyse R2.
 */
interface R2StatsResult {
    totalFiles: number;
    totalSize: number;
    categories: Record<string, { files: number; size: number }>;
    filesMap: Map<string, { size: number; LastModifiedMs: number }>;
}

/**
 * Parcourt récursivement le stockage d'assets local pour cataloguer les fichiers et leurs métadonnées de temps.
 *
 * POURQUOI : Nous avons besoin des dates `mtimeMs` de chaque fichier individuel pour pouvoir faire
 * une comparaison temporelle directe par rapport au bucket R2.
 *
 * @returns {Promise<LocalStatsResult>} Les statistiques et la cartographie complète des fichiers locaux.
 */
async function getLocalStats(): Promise<LocalStatsResult> {
    const filesMap = new Map<string, FileMetadata>();
    const stats: LocalStatsResult = {
        totalFiles: 0,
        totalSize: 0,
        categories: {
            blog: { files: 0, size: 0 },
            voyages: { files: 0, size: 0 },
            astrophotographies: { files: 0, size: 0 },
        },
        filesMap,
    };

    if (!(await fileExists(ASSETS_DIR))) return stats;

    async function scan(dirPath: string) {
        const files = await fs.readdir(dirPath);
        for (const file of files) {
            if (file.startsWith('.')) continue; // Ignore hidden files/folders
            const fullPath = path.join(dirPath, file);
            const stat = await fs.stat(fullPath);

            if (stat.isDirectory()) {
                const rel = path.relative(ASSETS_DIR, fullPath);
                // Skip top-level local only directories
                if (LOCAL_ONLY_DIRS.includes(rel)) continue;
                await scan(fullPath);
            } else {
                if (file === '.DS_Store') continue;
                const relPath = path.relative(ASSETS_DIR, fullPath);
                const parts = relPath.split(path.sep);
                const firstSeg = parts[0];

                // POURQUOI : un fichier posé à la racine de src/assets (ex. `.gitignore`) n'appartient à
                // aucun dossier de médias ; il devenait une « catégorie » toujours vue comme identique.
                if (parts.length > 1 && !LOCAL_ONLY_DIRS.includes(firstSeg)) {
                    // Normalisation au format d'URL/R2 (slashes standards)
                    const normalizedUnixPath = relPath.split(path.sep).join('/');
                    filesMap.set(normalizedUnixPath, { size: stat.size, mtimeMs: stat.mtime.getTime() });

                    stats.totalFiles++;
                    stats.totalSize += stat.size;

                    // Incrémenter la catégorie principale (ex: 'blog')
                    if (!stats.categories[firstSeg]) {
                        stats.categories[firstSeg] = { files: 0, size: 0 };
                    }
                    stats.categories[firstSeg].files++;
                    stats.categories[firstSeg].size += stat.size;

                    // Si le fichier est situé dans un sous-répertoire (ex: 'blog/2025')
                    const parentDir = path.dirname(fullPath);
                    const relParent = path.relative(ASSETS_DIR, parentDir);
                    const parentParts = relParent.split(path.sep);

                    if (parentParts.length >= 2) {
                        const subSeg = `${parentParts[0]}/${parentParts[1]}`;
                        if (!stats.categories[subSeg]) {
                            stats.categories[subSeg] = { files: 0, size: 0 };
                        }
                        stats.categories[subSeg].files++;
                        stats.categories[subSeg].size += stat.size;
                    }
                }
            }
        }
    }

    await scan(ASSETS_DIR);
    return stats;
}

/**
 * Parcourt les objets du bucket Cloudflare R2 pour cataloguer les fichiers et leurs dates d'upload.
 *
 * POURQUOI : Permet de récupérer les dates `LastModified` et de les normaliser sous forme de millisecondes
 * pour calculer instantanément les écarts de fraîcheur locaux.
 *
 * @param {S3Client} s3 - Client S3 configuré pour pointer vers Cloudflare R2.
 * @returns {Promise<R2StatsResult>} Les statistiques et la cartographie complète des fichiers distants.
 */
async function getR2Stats(s3: S3Client): Promise<R2StatsResult> {
    const filesMap = new Map<string, { size: number; LastModifiedMs: number }>();
    const stats: R2StatsResult = {
        totalFiles: 0,
        totalSize: 0,
        categories: {
            blog: { files: 0, size: 0 },
            voyages: { files: 0, size: 0 },
            astrophotographies: { files: 0, size: 0 },
        },
        filesMap,
    };

    let listParams = {
        Bucket: bucketName,
    };

    try {
        while (true) {
            const listedObjects = await s3.send(new ListObjectsV2Command(listParams));
            if (!listedObjects.Contents || listedObjects.Contents.length === 0) break;

            for (const object of listedObjects.Contents) {
                const key = object.Key;
                if (!key || key.endsWith('/')) continue;

                const parts = key.split('/');
                const firstSeg = parts[0];
                // POURQUOI : un fichier posé à la racine de src/assets (ex. `.gitignore`) n'appartient à
                // aucun dossier de médias ; il devenait une « catégorie » toujours vue comme identique.
                if (parts.length > 1 && !LOCAL_ONLY_DIRS.includes(firstSeg)) {
                    const size = object.Size ?? 0;
                    const LastModifiedMs = object.LastModified ? new Date(object.LastModified).getTime() : 0;
                    filesMap.set(key, { size, LastModifiedMs });

                    stats.totalFiles++;
                    stats.totalSize += size;

                    // Incrémenter la catégorie principale
                    if (!stats.categories[firstSeg]) {
                        stats.categories[firstSeg] = { files: 0, size: 0 };
                    }
                    stats.categories[firstSeg].files++;
                    stats.categories[firstSeg].size += size;

                    // Si l'objet R2 est situé dans un sous-répertoire (ex: 'blog/2025/...')
                    if (parts.length >= 3) {
                        const subSeg = `${parts[0]}/${parts[1]}`;
                        if (!stats.categories[subSeg]) {
                            stats.categories[subSeg] = { files: 0, size: 0 };
                        }
                        stats.categories[subSeg].files++;
                        stats.categories[subSeg].size += size;
                    }
                }
            }

            if (listedObjects.IsTruncated) {
                listParams = {
                    ...listParams,
                    ContinuationToken: listedObjects.NextContinuationToken,
                } as any;
            } else {
                break;
            }
        }
    } catch (e) {
        console.error('Error listing R2 bucket stats:', e);
    }

    return stats;
}

/**
 * Vérifie l'existence d'un fichier ou répertoire.
 *
 * @param {string} p - Le chemin d'accès absolu.
 * @returns {Promise<boolean>} True si le fichier existe, false sinon.
 */
async function fileExists(p: string): Promise<boolean> {
    try {
        await fs.access(p);
        return true;
    } catch {
        return false;
    }
}

/**
 * Handler API principal de récupération du statut R2.
 * Effectue un diagnostic complet fichier par fichier pour comparer les dates de modification.
 *
 * @returns {Promise<Response>} Réponse JSON contenant les statistiques locales et distantes enrichies d'indicateurs de synchronisation fins.
 */
export const GET: APIRoute = async ({ locals }) => {
    const blocked = requireAdmin(locals);
    if (blocked) return blocked;

    if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
        return new Response(JSON.stringify({ error: 'Identifiants R2 manquants' }), { status: 500 });
    }

    const s3 = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId,
            secretAccessKey,
        },
    });

    const [localResult, r2Result] = await Promise.all([getLocalStats(), getR2Stats(s3)]);

    const categoriesKeys = new Set([...Object.keys(localResult.categories), ...Object.keys(r2Result.categories)]);

    const finalLocalCategories: Record<string, CategoryStats> = {};
    const finalR2Categories: Record<string, CategoryStats> = {};

    for (const cat of categoriesKeys) {
        // Filtrer les fichiers appartenant à cette catégorie/répertoire
        const localInCat = new Map<string, FileMetadata>();
        for (const [filePath, meta] of localResult.filesMap.entries()) {
            if (filePath.startsWith(cat + '/')) {
                localInCat.set(filePath, meta);
            }
        }

        const r2InCat = new Map<string, { size: number; LastModifiedMs: number }>();
        for (const [key, meta] of r2Result.filesMap.entries()) {
            if (key.startsWith(cat + '/')) {
                r2InCat.set(key, meta);
            }
        }

        let hasNewerLocal = false;
        let hasMissingR2 = false;
        let hasMissingLocal = false;
        let isIdentical = true;

        // 1. Comparer le local par rapport à R2
        for (const [filePath, localMeta] of localInCat.entries()) {
            const r2Meta = r2InCat.get(filePath);
            if (!r2Meta) {
                hasMissingR2 = true;
                hasNewerLocal = true; // S'il manque sur R2, le local est implicitement considéré comme plus récent/à envoyer
                isIdentical = false;
            } else {
                if (localMeta.size !== r2Meta.size) {
                    isIdentical = false;

                    // WARNING: Application d'une marge de tolérance de 5000 ms (5 secondes).
                    // POURQUOI: Permet de tolérer les infimes latences d'écriture ou variations d'horloge
                    // entre le système de fichier local et le bucket Cloudflare R2 afin d'éviter les faux positifs.
                    // On ne compare la fraîcheur temporelle que si la taille du fichier diffère, afin d'éviter
                    // de considérer les fichiers locaux fraîchement téléchargés ou clonés comme modifiés.
                    const localFileIsNewer = localMeta.mtimeMs > r2Meta.LastModifiedMs + 5000;
                    if (localFileIsNewer) {
                        hasNewerLocal = true;
                    }
                }
            }
        }

        // 2. Comparer R2 par rapport au local pour détecter les fichiers manquants localement
        for (const filePath of r2InCat.keys()) {
            if (!localInCat.has(filePath)) {
                hasMissingLocal = true;
                isIdentical = false;
            }
        }

        // Récupérer les nombres de fichiers et tailles
        const localCat = localResult.categories[cat] || { files: 0, size: 0 };
        const r2Cat = r2Result.categories[cat] || { files: 0, size: 0 };

        finalLocalCategories[cat] = {
            files: localCat.files,
            size: localCat.size,
            hasNewerLocal,
            hasMissingR2,
            hasMissingLocal,
            isIdentical,
        };

        finalR2Categories[cat] = {
            files: r2Cat.files,
            size: r2Cat.size,
            hasNewerLocal,
            hasMissingR2,
            hasMissingLocal,
            isIdentical,
        };
    }

    const payload = {
        local: {
            totalFiles: localResult.totalFiles,
            totalSize: localResult.totalSize,
            categories: finalLocalCategories,
        },
        r2: {
            totalFiles: r2Result.totalFiles,
            totalSize: r2Result.totalSize,
            categories: finalR2Categories,
        },
    };

    return jsonResponse(payload);
};
