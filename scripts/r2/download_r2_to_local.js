/**
 * Téléchargement du contenu du bucket R2 vers src/assets/
 *
 * Responsabilité principale :
 * - Lister tous les objets du bucket R2 (ListObjectsV2), en ignorant les marqueurs de dossier et les
 *   préfixes LOCAL_ONLY_DIRS (versionnés dans git).
 * - Filtrer par préfixe et, avec --skip-raw, exclure les originaux d'astrophotos.
 * - Télécharger vers src/assets/<clé>, 5 fichiers en parallèle. Mode incrémental : un fichier local de
 *   même taille que sur R2 est sauté.
 *
 * WARNING: un fichier local de taille différente est écrasé par la version R2, sans sauvegarde (avec
 * --force, tous les fichiers sélectionnés le sont). Les fichiers locaux absents de R2 ne sont jamais
 * supprimés.
 *
 * Effet distant : lecture seule sur R2 (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
 * R2_BUCKET_NAME obligatoires, .env de la racine du dépôt). Effet local : écriture dans src/assets/.
 *
 * Options disponibles (lues à la main, toute option inconnue est ignorée) :
 *   [préfixe]        : premier argument qui ne commence pas par `-`. Ne garde que les clés qui commencent
 *                      par cette chaîne (ex. blog, voyages, astrophotographies/mini, blog/2026),
 *                      comparaison `startsWith` sans `/` ajouté.
 *   --skip-raw | -s  : exclut toutes les clés sous astrophotographies/<année à 4 chiffres>/ (originaux
 *                      lourds) ; astrophotographies/mini/ et les autres dossiers restent téléchargés.
 *   --force | -f     : retélécharge et écrase les fichiers locaux même de même taille.
 *
 * Code de sortie : 1 si la configuration R2 manque, si le listage échoue ou si un téléchargement échoue.
 *
 * Exemples d'utilisation :
 *   node scripts/r2/download_r2_to_local.js                      # tout le bucket, incrémental
 *   node scripts/r2/download_r2_to_local.js blog                 # seulement les clés blog…
 *   node scripts/r2/download_r2_to_local.js --skip-raw           # tout sauf les originaux d'astrophotos
 *   node scripts/r2/download_r2_to_local.js blog/2026 --force    # réécrit les fichiers du blog 2026
 *   node scripts/r2/download_r2_to_local.js -s -f                # réécrit tout sauf les originaux
 */

import { ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pipeline } from 'stream/promises';
import { loadEnv } from '../lib/env.mjs';
import { createR2Client, requireR2Config } from '../lib/r2.mjs';
import { LOCAL_ONLY_DIRS } from '../../src/config/imageConfig.mjs';

loadEnv();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err);
});

const r2Config = requireR2Config();
const { bucketName } = r2Config;
const s3 = createR2Client(r2Config);

const TARGET_DIR = path.join(__dirname, '../../src/assets');
const EXCLUDED_DIRS = LOCAL_ONLY_DIRS.map((dir) => `${dir}/`);

// Parallelism limit for concurrent S3 downloads
const CONCURRENCY_LIMIT = 5;

/**
 * Downloads a single remote object and writes it to the local target directory.
 * Performs incremental skip if the file already exists locally with matching size.
 *
 * @param {Object} params
 * @param {string} params.s3Key - The sequence of characters that identifies the object in the bucket.
 * @param {number} params.s3Size - Size of the remote object in bytes.
 * @param {number} params.index - Current file index for progress tracking.
 * @param {number} params.total - Total number of matched files.
 * @param {boolean} params.force - Force overwrite option.
 * @returns {Promise<'downloaded' | 'skipped' | 'failed'>} The download operation status.
 */
async function downloadFile({ s3Key, s3Size, index, total, force }) {
    const localPath = path.join(TARGET_DIR, s3Key);
    const localDirPath = path.dirname(localPath);

    // Incremental sync check: skip download if local file exists and matches S3 size (unless force is active)
    if (!force && fs.existsSync(localPath)) {
        try {
            const stats = fs.statSync(localPath);
            if (stats.size === s3Size) {
                console.log(`[${index}/${total}] ⏭️  Ignoré (déjà présent) : ${s3Key}`);
                return 'skipped';
            }
        } catch {
            // WARNING: Ignoring stat error and proceeding to download to guarantee file integrity
        }
    }

    if (!fs.existsSync(localDirPath)) {
        fs.mkdirSync(localDirPath, { recursive: true });
    }

    try {
        console.log(`[${index}/${total}] ⏳ Téléchargement : ${s3Key}...`);
        const response = await s3.send(
            new GetObjectCommand({
                Bucket: bucketName,
                Key: s3Key,
            }),
        );

        if (response.Body) {
            const writer = fs.createWriteStream(localPath);
            await pipeline(response.Body, writer);

            // POURQUOI: Permet de conserver l'horodatage d'origine du fichier sur Cloudflare R2
            // pour que les comparaisons futures du statut de cohérence ne détectent pas de faux positifs.
            if (response.LastModified) {
                const mtime = new Date(response.LastModified);
                fs.utimesSync(localPath, mtime, mtime);
            }

            console.log(`[${index}/${total}] ✅ OK : ${s3Key}`);
            return 'downloaded';
        }
    } catch (error) {
        console.error(`[${index}/${total}] ❌ Erreur lors du téléchargement de ${s3Key}:`, error.message);
        try {
            if (fs.existsSync(localPath)) {
                fs.unlinkSync(localPath);
            }
        } catch {
            // Silently ignore cleanup failure to preserve original download error context
        }
        return 'failed';
    }
    return 'failed';
}

/**
 * Simple, dependency-free async worker pool to limit parallel tasks.
 *
 * @template T, R
 * @param {T[]} items - Array of items to process.
 * @param {number} limit - Maximum concurrency.
 * @param {function(T): Promise<R>} fn - Async function to run for each item.
 * @returns {Promise<R[]>} Resulting array of all task resolutions.
 */
async function pool(items, limit, fn) {
    const results = [];
    const executing = new Set();
    for (const item of items) {
        const p = Promise.resolve().then(() => fn(item));
        results.push(p);
        executing.add(p);
        const clean = () => executing.delete(p);
        p.then(clean, clean);
        if (executing.size >= limit) {
            await Promise.race(executing);
        }
    }
    return Promise.all(results);
}

/**
 * Main execution flow to list, filter, and concurrently download R2 bucket content.
 */
async function main() {
    // Parse command line arguments
    const args = process.argv.slice(2);
    const skipRaw = args.includes('--skip-raw') || args.includes('-s');
    const force = args.includes('--force') || args.includes('-f');

    // Any argument that doesn't start with '-' is treated as a target prefix filter
    const targetFilter = args.find((arg) => !arg.startsWith('-'));

    console.log('📥 Début du téléchargement de tous les fichiers depuis R2...');
    console.log(`Bucket : ${bucketName}`);
    console.log(`Destination : ${TARGET_DIR}`);
    if (targetFilter) console.log(`Filtre : uniquement le préfixe "${targetFilter}"`);
    if (skipRaw) console.log(`Option : exclusion des images brutes d'astrophotographies (--skip-raw)`);
    if (force) console.log(`Option : écrasement forcé des fichiers locaux (--force)`);
    console.log('─'.repeat(60) + '\n');

    if (!fs.existsSync(TARGET_DIR)) {
        fs.mkdirSync(TARGET_DIR, { recursive: true });
    }

    let listParams = {
        Bucket: bucketName,
    };

    const matchedObjects = [];

    // Step 1: List all remote objects matching criteria
    try {
        console.log('🔍 Récupération de la liste des fichiers sur R2...');
        while (true) {
            const listedObjects = await s3.send(new ListObjectsV2Command(listParams));

            if (!listedObjects.Contents || listedObjects.Contents.length === 0) {
                break;
            }

            for (const object of listedObjects.Contents) {
                const key = object.Key;

                // Skip simulation directory markers
                if (key.endsWith('/')) continue;

                // Skip static local-only directories
                if (EXCLUDED_DIRS.some((dir) => key.startsWith(dir))) continue;

                // Apply target filter if provided (e.g. blog, voyages, astrophotographies/mini)
                if (targetFilter && !key.startsWith(targetFilter)) continue;

                // Skip raw astrophotographies if requested
                // Raw files reside directly under the year folder of astrophotographies (e.g., astrophotographies/2015/file.jpg)
                if (skipRaw) {
                    const parts = key.split('/');
                    if (parts[0] === 'astrophotographies' && /^\d{4}$/.test(parts[1])) {
                        continue;
                    }
                }

                matchedObjects.push({
                    s3Key: key,
                    s3Size: object.Size,
                });
            }

            if (listedObjects.IsTruncated) {
                listParams.ContinuationToken = listedObjects.NextContinuationToken;
            } else {
                break;
            }
        }

        console.log(`📊 Trouvé ${matchedObjects.length} fichiers à synchroniser.\n`);
        if (matchedObjects.length === 0) {
            console.log('✅ Aucun fichier ne correspond aux critères de sélection.');
            return;
        }

        // Step 2: Download files in parallel using the concurrency pool
        const downloadTasks = matchedObjects.map((obj, i) => {
            return () =>
                downloadFile({
                    s3Key: obj.s3Key,
                    s3Size: obj.s3Size,
                    index: i + 1,
                    total: matchedObjects.length,
                    force,
                });
        });

        const results = await pool(downloadTasks, CONCURRENCY_LIMIT, (task) => task());

        // Step 3: Compile stats
        let skipped = 0;
        let downloaded = 0;
        let failed = 0;

        results.forEach((res) => {
            if (res === 'skipped') skipped++;
            else if (res === 'downloaded') downloaded++;
            else failed++;
        });

        console.log('\n' + '─'.repeat(60));
        console.log(`✅ Terminé !`);
        console.log(`📊 Statistiques :`);
        console.log(`   - ⏭️  Déjà présents (sautés) : ${skipped}`);
        console.log(`   - 📥 Téléchargés : ${downloaded}`);
        console.log(`   - ❌ Échecs : ${failed}`);
        console.log('─'.repeat(60));
        // POURQUOI : l'admin (/admin/infra/scripts) juge le succès sur le code de sortie.
        if (failed > 0) process.exit(1);
    } catch (error) {
        console.error('❌ Une erreur critique est survenue :', error.message);
        process.exit(1);
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
