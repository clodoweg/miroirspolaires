/**
 * Génération des versions web (400/800/1200 px) des images du blog, des voyages et des astrophotos
 *
 * Responsabilité principale :
 * - Parcourir les images locales de src/assets/blog/, src/assets/voyages/ (hors `-thumb.*` et dossiers
 *   cachés comme `.admin-trash/`) et src/assets/astrophotographies/mini/.
 * - Pour chacune, produire les largeurs de `planWebImageWidths()` (src/utils/webImages.mjs) en JPEG
 *   q75 mozjpeg 4:2:0, orientation EXIF appliquée, dans temp/web-images/ (git-ignoré). Une source plus
 *   étroite que 400 px est ignorée : le worker la sert déjà telle quelle.
 * - Avec --upload : envoyer sur R2 sous `web/<clé sans extension>-w<largeur>.jpg` les versions absentes,
 *   puis réécrire src/data/web-images.json avec les sources dont toutes les versions sont sur R2.
 *   Le site (ResponsiveImage, rehype-masonry, buildOptimizedUrl) ne bascule que sur ces sources.
 *
 * POURQUOI : le worker renvoie l'original au-delà de 500 Ko ou 1,8 MP et sert les `mini/` sans les
 * redimensionner ; ces fichiers statiques évitent aussi tout calcul (et les 503) côté worker.
 *
 * Effet distant : aucun sans --upload. Avec --upload : écriture R2 sous le seul préfixe `web/`
 * (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME obligatoires), sans jamais
 * toucher aux originaux. WARNING: avec --force --upload, les versions existantes sont réécrites, mais
 * le CDN de R2 peut servir l'ancienne version un temps (même URL).
 * Effet local : temp/web-images/ et, avec --upload, src/data/web-images.json (à committer).
 *
 * Options disponibles (toute autre option est refusée, code de sortie 1) :
 *   --only=astro,blog,voyages : limite les dossiers traités (défaut : les trois). Les entrées du
 *                               manifeste des autres dossiers sont conservées.
 *   --prefix=<préfixe>        : limite aux sources dont la clé commence par ce préfixe, dans un dossier de
 *                               --only (ex. blog/2026/mon-article/). Seules ses entrées du manifeste sont
 *                               remplacées. Lettres minuscules, chiffres, `-`, `_` et `/` seulement.
 *   --purge                   : purge ensuite le cache du worker pour les sources traitées (IMAGE_WORKER_URL et
 *                               IMAGE_WORKER_PURGE_KEY ; sans elles, la purge est sautée avec un avertissement).
 *   --force                   : régénère les versions locales et, avec --upload, les réécrit sur R2.
 *   --upload                  : envoie les versions absentes de R2 et met à jour le manifeste.
 *   --dry-run                 : compte les sources et les versions prévues, sans rien écrire.
 *
 * Code de sortie : 1 si une option est inconnue ou si une génération ou un envoi échoue ; 0 sinon.
 *
 * Exemples d'utilisation :
 *   node scripts/build/generate-web-images.mjs --dry-run
 *   node scripts/build/generate-web-images.mjs --only=astro --upload
 *   node scripts/build/generate-web-images.mjs --upload            # après l'ajout d'images
 *   node scripts/build/generate-web-images.mjs --force --upload    # après un changement de réglages
 *   node scripts/build/generate-web-images.mjs --only=blog --prefix=blog/2026/mon-article/ --force --upload --purge
 *                                                                   # images d'un article remplacées sous le même nom
 */

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { PROJECT_ROOT, loadEnv } from '../lib/env.mjs';
import { createR2Client, requireR2Config } from '../lib/r2.mjs';
import { parseCliArgs } from '../lib/args.mjs';
import { purgeImageKeys } from '../lib/worker-cache.mjs';
import { planWebImageWidths, webImageKey } from '../../src/utils/webImages.mjs';
import { WEB_IMAGE_SCOPES, getDisplayWidth, listWebImageSources } from '../../src/lib/admin/web-image-sources.mjs';

loadEnv();

const ASSETS_ROOT = path.join(PROJECT_ROOT, 'src/assets');
const OUTPUT_ROOT = path.join(PROJECT_ROOT, 'temp/web-images');
const MANIFEST_PATH = path.join(PROJECT_ROOT, 'src/data/web-images.json');
const QUALITY = 75;
const CONCURRENCY = 6;
/**
 * Exécute des tâches asynchrones avec une concurrence bornée.
 *
 * @param {T[]} items - Éléments à traiter.
 * @param {(item: T) => Promise<void>} worker - Traitement d'un élément.
 * @template T
 */
async function runPool(items, worker) {
    let next = 0;
    const runners = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
        while (next < items.length) {
            const item = items[next++];
            await worker(item);
        }
    });
    await Promise.all(runners);
}

/**
 * Indique si une clé existe sur R2.
 *
 * @param {import('@aws-sdk/client-s3').S3Client} s3 - Client R2.
 * @param {string} bucket - Bucket.
 * @param {string} key - Clé.
 * @returns {Promise<boolean>} `true` si l'objet existe.
 */
async function existsOnR2(s3, bucket, key) {
    try {
        await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return true;
    } catch (error) {
        if (error?.$metadata?.httpStatusCode === 404 || error?.name === 'NotFound') return false;
        throw error;
    }
}

async function main() {
    let args;
    try {
        args = parseCliArgs(process.argv.slice(2), {
            flags: { force: ['--force'], upload: ['--upload'], dryRun: ['--dry-run'], purge: ['--purge'] },
            valueOptions: ['--only', '--prefix'],
        });
    } catch (error) {
        console.error(`❌ ${error.message}`);
        process.exit(1);
    }
    const { force, upload, dryRun, purge } = args.flags;
    const requestedScopes = (args.values['--only'] || Object.keys(WEB_IMAGE_SCOPES).join(','))
        .split(',')
        .map((scope) => scope.trim())
        .filter(Boolean);
    const unknownScope = requestedScopes.find((scope) => !(scope in WEB_IMAGE_SCOPES));
    if (unknownScope) {
        console.error(
            `❌ Dossier inconnu pour --only : ${unknownScope} (attendu : ${Object.keys(WEB_IMAGE_SCOPES).join(', ')})`,
        );
        process.exit(1);
    }
    const scopePrefixes = requestedScopes.map((scope) => WEB_IMAGE_SCOPES[scope]);

    const rawPrefix = args.values['--prefix'];
    const keyPrefix = rawPrefix ? (rawPrefix.endsWith('/') ? rawPrefix : `${rawPrefix}/`) : null;
    // WARNING: le préfixe sert aussi à choisir les entrées du manifeste à remplacer ; un préfixe libre
    // (vide, `..`) effacerait des entrées qui n'ont rien à voir.
    if (
        keyPrefix !== null &&
        (!/^[a-z0-9][a-z0-9/_-]*\/$/.test(keyPrefix) ||
            keyPrefix.includes('//') ||
            !scopePrefixes.some((scopePrefix) => keyPrefix.startsWith(`${scopePrefix}/`)))
    ) {
        console.error(`❌ --prefix invalide ou hors des dossiers de --only : ${rawPrefix}`);
        process.exit(1);
    }

    const sources = listWebImageSources(ASSETS_ROOT, requestedScopes).filter(
        (source) => keyPrefix === null || source.key.startsWith(keyPrefix),
    );
    console.log(`🖼️  ${sources.length} images sources (${requestedScopes.join(', ')})`);

    const s3 = upload && !dryRun ? createR2Client(requireR2Config()) : null;
    const bucket = s3 ? process.env.R2_BUCKET_NAME : '';

    const manifestEntries = {};
    const stats = { generated: 0, reused: 0, uploaded: 0, alreadyOnR2: 0, skipped: 0, errors: 0, planned: 0 };

    await runPool(sources, async ({ key: sourceKey, path: sourcePath }) => {
        try {
            const widths = planWebImageWidths(await getDisplayWidth(sourcePath));
            if (widths.length === 0) {
                stats.skipped++;
                return;
            }
            stats.planned += widths.length;
            if (dryRun) return;

            let isComplete = true;
            for (const width of widths) {
                const derivativeKey = webImageKey(sourceKey, width);
                const outputPath = path.join(OUTPUT_ROOT, derivativeKey);
                if (force || !fs.existsSync(outputPath)) {
                    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
                    await sharp(sourcePath)
                        .rotate()
                        .resize({ width, withoutEnlargement: true })
                        .jpeg({ quality: QUALITY, mozjpeg: true, chromaSubsampling: '4:2:0' })
                        .toFile(outputPath);
                    stats.generated++;
                } else {
                    stats.reused++;
                }

                if (!s3) continue;
                if (!force && (await existsOnR2(s3, bucket, derivativeKey))) {
                    stats.alreadyOnR2++;
                    continue;
                }
                try {
                    await s3.send(
                        new PutObjectCommand({
                            Bucket: bucket,
                            Key: derivativeKey,
                            Body: fs.readFileSync(outputPath),
                            ContentType: 'image/jpeg',
                        }),
                    );
                    stats.uploaded++;
                } catch (error) {
                    isComplete = false;
                    stats.errors++;
                    console.error(`❌ Envoi échoué : ${derivativeKey} (${error.message})`);
                }
            }
            if (isComplete) manifestEntries[sourceKey] = widths;
        } catch (error) {
            stats.errors++;
            console.error(`❌ ${sourceKey} : ${error.message}`);
        }
    });

    if (dryRun) {
        console.log(`[dry-run] ${stats.planned} versions prévues, ${stats.skipped} sources trop étroites ignorées.`);
        return;
    }

    console.log(
        `✅ ${stats.generated} générées, ${stats.reused} déjà en local, ${stats.skipped} sources ignorées (< 400 px)`,
    );

    if (s3) {
        console.log(`☁️  ${stats.uploaded} envoyées sur R2, ${stats.alreadyOnR2} déjà présentes`);
        const previous = fs.existsSync(MANIFEST_PATH) ? JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')) : {};
        // POURQUOI : on garde les entrées des dossiers non traités par --only ; celles des dossiers
        // traités sont remplacées, ce qui retire les images supprimées en local.
        // Avec --prefix, seules les entrées de ce préfixe sont remplacées.
        const isReplaced = (key) =>
            keyPrefix !== null
                ? key.startsWith(keyPrefix)
                : scopePrefixes.some((prefix) => key.startsWith(`${prefix}/`));
        const kept = Object.fromEntries(Object.entries(previous).filter(([key]) => !isReplaced(key)));
        const merged = { ...kept, ...manifestEntries };
        const sorted = Object.fromEntries(
            Object.keys(merged)
                .sort()
                .map((key) => [key, merged[key]]),
        );
        fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(sorted, null, 2)}\n`);
        console.log(`📝 ${Object.keys(sorted).length} entrées dans src/data/web-images.json`);
    } else {
        console.log('ℹ️  Sans --upload, rien n’est envoyé et le manifeste n’est pas modifié.');
    }

    if (purge) {
        const workerUrl = process.env.IMAGE_WORKER_URL;
        const purgeKey = process.env.IMAGE_WORKER_PURGE_KEY;
        if (!workerUrl || !purgeKey) {
            console.warn('⚠️  --purge : IMAGE_WORKER_URL ou IMAGE_WORKER_PURGE_KEY absent, cache du worker non purgé.');
        } else {
            const failed = await purgeImageKeys(
                sources.map((source) => source.key),
                { workerUrl, purgeKey },
            );
            console.log(
                `🧹 Cache du worker purgé pour ${sources.length} image(s)${failed ? `, ${failed} échec(s)` : ''}`,
            );
            if (failed > 0) stats.errors += failed;
        }
    }

    if (stats.errors > 0) {
        console.error(`❌ ${stats.errors} erreur(s)`);
        process.exit(1);
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
