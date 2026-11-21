/**
 * Préchauffage du cache du worker d'images Cloudflare
 *
 * Responsabilité principale :
 * - Lister toutes les clés du bucket R2 (ListObjectsV2) et garder les images (.jpg, .jpeg, .png,
 *   .webp) hors LOCAL_ONLY_DIRS, filtrées par le préfixe passé en argument.
 * - Demander au worker chaque variante du srcset : IMAGE_CONFIG.WIDTHS × qualités desktop et mobile
 *   (IMAGE_CONFIG.QUALITY), toujours en f_jpeg. Les -thumb.jpg, que le site sert directement depuis R2,
 *   sont aussi demandés.
 * - Traiter les URL par 2 en parallèle avec 200 ms de pause, des clés les plus récentes (ordre inverse)
 *   aux plus anciennes.
 *
 * Effet distant : lecture R2 (liste) et requêtes GET vers le worker, qui remplissent son cache ; aucune
 * écriture R2. Exige R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME et
 * IMAGE_WORKER_URL (.env de la racine du dépôt). La clé de purge n'est jamais envoyée.
 *
 * Options disponibles :
 *   [préfixe|all] : premier argument qui ne commence pas par `-`. Préfixe de clé R2 à préchauffer
 *                   (ex. astrophotographies/2026, blog/2025), comparaison `startsWith` sensible à la
 *                   casse et sans `/` ajouté (`blog` couvre aussi `blog-…`). Absent ou `all` : toutes
 *                   les images. Les arguments commençant par `-` sont ignorés.
 *
 * Code de sortie : 1 si une requête échoue ou si une variable d'environnement manque.
 *
 * Exemples d'utilisation :
 *   node scripts/r2/warm-cache.mjs                            # toutes les images
 *   node scripts/r2/warm-cache.mjs astrophotographies/2026
 *   node scripts/r2/warm-cache.mjs all
 */

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';

import { IMAGE_CONFIG, LOCAL_ONLY_DIRS } from '../../src/config/imageConfig.mjs';
import { loadEnv } from '../lib/env.mjs';
import { createR2Client, requireR2Config } from '../lib/r2.mjs';

loadEnv();

const __dirname = dirname(fileURLToPath(import.meta.url));
// POURQUOI: Nous devons remonter deux niveaux (scripts/r2 -> racine du projet)
// pour charger correctement le fichier .env et exécuter le script depuis
// n'importe quel dossier parent ou depuis un processus enfant d'administration.
const rootDir = resolve(__dirname, '../..');
process.chdir(rootDir);

// Configuration
const WORKER_URL = process.env.IMAGE_WORKER_URL;
const CONCURRENCY = 2; // Slightly increased for R2
const WIDTHS = IMAGE_CONFIG.WIDTHS;
const QUALITIES = [...new Set([IMAGE_CONFIG.QUALITY.DESKTOP, IMAGE_CONFIG.QUALITY.MOBILE])];
// POURQUOI : le site demande toujours f_jpeg ; préchauffer f_webp remplissait des clés de cache jamais servies.
const FORMAT = 'jpeg';
const DELAY_MS = 200; // Reduced delay as we are targeting Cloudflare network to Cloudflare network

// R2 Config
const r2Config = requireR2Config();
const { bucketName } = r2Config;
const s3 = createR2Client(r2Config);

if (!WORKER_URL) {
    console.error('❌ ERREUR: IMAGE_WORKER_URL est manquant dans le fichier .env');
    process.exit(1);
}

/**
 * Retrieves a complete list of object keys currently stored in the R2 bucket.
 *
 * @returns {Promise<string[]>} Array of object keys found in R2.
 * @throws {Error} If the S3 operation fails.
 */
async function fetchR2ObjectKeys() {
    console.log(`🔍 Scan du bucket R2 : ${bucketName}...`);
    const objects = [];
    let continuationToken;

    try {
        do {
            const command = new ListObjectsV2Command({
                Bucket: bucketName,
                ContinuationToken: continuationToken,
            });

            const response = await s3.send(command);
            if (response.Contents) {
                objects.push(...response.Contents.map((o) => o.Key));
            }
            continuationToken = response.NextContinuationToken;
        } while (continuationToken);
    } catch (e) {
        console.error('❌ Erreur lors du scan R2 :', e.message);
        throw e;
    }

    return objects;
}

/**
 * Main execution flow for systematically warming the image CDN cache.
 */
async function runCacheWarmer() {
    const args = process.argv.slice(2);
    const targetFilter = args.find((arg) => !arg.startsWith('-'));

    let allKeys = await fetchR2ObjectKeys();

    const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
    let entries = allKeys.filter((key) => {
        const lowerKey = key.toLowerCase();
        const isImage = imageExtensions.some((ext) => lowerKey.endsWith(ext));
        const isLocalOnly = LOCAL_ONLY_DIRS.some((d) => lowerKey.startsWith(`${d}/`));

        // POURQUOI: Permet de réchauffer uniquement un répertoire ou sous-répertoire d'images (ex: 'blog', 'blog/2025')
        const matchesFilter = !targetFilter || targetFilter === 'all' || key.startsWith(targetFilter);

        return isImage && !isLocalOnly && matchesFilter;
    });

    entries.reverse();

    const filterText = targetFilter && targetFilter !== 'all' ? ` (filtre: "${targetFilter}")` : '';
    console.log(
        `📦 ${entries.length} images trouvées sur R2${filterText} (excluant: ${LOCAL_ONLY_DIRS.join(', ')}) - ordre inversé.`,
    );

    if (entries.length === 0) {
        console.log('✨ Rien à faire.');
        return;
    }

    const queue = [];

    for (const key of entries) {
        const relativePath = key.startsWith('/') ? key : `/${key}`;

        for (const width of WIDTHS) {
            for (const quality of QUALITIES) {
                const url = `${WORKER_URL}/w_${width},q_${quality},f_${FORMAT}${relativePath}`;
                queue.push({ url, path: relativePath, width, quality });
            }
        }
    }

    console.log(`🚀 ${queue.length} URLs à générer.`);

    let totalProcessed = 0;
    let errors = 0;

    const processBatch = async () => {
        while (queue.length > 0) {
            const batch = queue.splice(0, CONCURRENCY);
            await Promise.all(
                batch.map(async (item) => {
                    try {
                        // POURQUOI : pas de clé de purge ici ; le worker ne la lit qu'avec `x-purge`, l'envoyer l'exposerait.
                        const res = await fetch(item.url);
                        if (res.ok) {
                            process.stdout.write('.');
                        } else {
                            console.error(`\n   ❌ ERREUR ${res.status} (${item.width}px): ${item.path}`);
                            errors++;
                        }
                    } catch (e) {
                        console.error(`\n   ❌ ERREUR NETWORK (${item.width}px): ${item.path}`, e.message);
                        errors++;
                    } finally {
                        totalProcessed++;
                        if (DELAY_MS > 0) {
                            await new Promise((r) => setTimeout(r, DELAY_MS));
                        }
                    }
                }),
            );
        }
    };

    const startTime = Date.now();
    await processBatch();
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n\n✨ Terminé !');
    console.log(`   ⏱️  Durée : ${duration}s`);
    console.log(`   ✅ Succès : ${totalProcessed - errors}`);
    console.log(`   ❌ Erreurs : ${errors}`);
    if (errors > 0) process.exit(1);
}

runCacheWarmer().catch((err) => {
    console.error(err);
    process.exit(1);
});
