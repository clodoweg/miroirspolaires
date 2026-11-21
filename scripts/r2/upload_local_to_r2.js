import { ListObjectsV2Command, DeleteObjectsCommand, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { createHash } from 'node:crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseCliArgs } from '../lib/args.mjs';
import { loadEnv } from '../lib/env.mjs';
import { createR2Client, requireR2Config } from '../lib/r2.mjs';
import { LOCAL_ONLY_DIRS } from '../../src/config/imageConfig.mjs';

loadEnv();

/**
 * Utilitaires de synchronisation des médias locaux vers le bucket Cloudflare R2.
 *
 * Responsabilité :
 * - Transférer les images/vidéos du dossier src/assets vers Cloudflare R2.
 * - Par défaut, mode incrémentiel : une requête HEAD par fichier, seuls les fichiers absents
 *   de R2 sont envoyés, rien n'est supprimé.
 * - Mode miroir (`--delete-first`, destructif) : vide le préfixe R2 puis réenvoie tout le
 *   dossier local, pour retirer de R2 les fichiers supprimés localement.
 *
 * Options en ligne de commande (CLI) :
 *   - --delete-first           : WARNING destructif. Vide le préfixe R2 avant l'envoi. Refusé si le
 *                                dossier local est absent.
 *   - --force, -f              : Réenvoie aussi les fichiers déjà présents sur R2 (sans rien supprimer).
 *   - --changed                : Réenvoie aussi les fichiers présents sur R2 dont le contenu local diffère
 *                                (taille, puis MD5 comparé à l'ETag). Avec --dry-run, interroge R2 (lecture
 *                                seule) et liste les fichiers qui seraient envoyés. Incompatible avec
 *                                --delete-first et --force.
 *   - --incremental, -i        : Accepté pour compatibilité ; c'est le mode par défaut.
 *   - --dry-run                : Affiche ce qui serait supprimé ou envoyé, sans rien écrire sur R2.
 *   - [directory]              : Dossier ou sous-dossier à synchroniser (blog, voyages, astrophotographies, blog/2025…).
 *   Toute autre option est refusée (code de sortie 1).
 *
 * Exemples d'utilisation :
 *   node scripts/r2/upload_local_to_r2.js                          # Envoie les fichiers manquants de tous les dossiers
 *   node scripts/r2/upload_local_to_r2.js voyages -f               # Réenvoie tous les fichiers de voyages
 *   node scripts/r2/upload_local_to_r2.js astrophotographies --changed   # Envoie les absents et les modifiés
 *   node scripts/r2/upload_local_to_r2.js blog --delete-first --dry-run  # Montre ce que ferait le miroir de blog
 *   node scripts/r2/upload_local_to_r2.js blog --delete-first      # Vide blog/ sur R2 puis réenvoie (destructif)
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const r2Config = requireR2Config();
const { bucketName } = r2Config;
const s3 = createR2Client(r2Config);

const ASSETS_DIR = path.join(__dirname, '../../src/assets');

/**
 * Détecte de manière dynamique tous les sous-dossiers du premier niveau dans src/assets,
 * à l'exclusion des répertoires purement locaux.
 *
 * @returns {string[]} Tableau des noms de dossiers.
 */
function getTopLevelDirs() {
    if (!fs.existsSync(ASSETS_DIR)) return [];
    return fs
        .readdirSync(ASSETS_DIR)
        .filter((f) => {
            if (f.startsWith('.')) return false;
            if (LOCAL_ONLY_DIRS.includes(f)) return false;
            const stat = fs.statSync(path.join(ASSETS_DIR, f));
            return stat.isDirectory();
        })
        .sort();
}

const TARGET_DIRS = getTopLevelDirs();

/**
 * Fait correspondre une extension de fichier avec son Content-Type MIME.
 *
 * @param {string} filePath - Chemin d'accès au fichier.
 * @returns {string} Le type MIME correspondant.
 */
function getContentType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const map = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
    };
    return map[ext] || 'application/octet-stream';
}

/**
 * Supprime récursivement tous les objets d'un dossier distant dans le bucket R2.
 *
 * @param {string} prefix - Le préfixe (dossier) à vider.
 * @returns {Promise<void>}
 */
async function emptyDirectory(prefix) {
    console.log(`🗑️  Suppression du contenu de : ${prefix}...`);
    let listParams = {
        Bucket: bucketName,
        Prefix: prefix,
    };

    while (true) {
        const listedObjects = await s3.send(new ListObjectsV2Command(listParams));
        if (!listedObjects.Contents || listedObjects.Contents.length === 0) break;

        const deleteParams = {
            Bucket: bucketName,
            Delete: { Objects: [] },
        };

        listedObjects.Contents.forEach(({ Key }) => {
            deleteParams.Delete.Objects.push({ Key });
        });

        await s3.send(new DeleteObjectsCommand(deleteParams));
        console.log(`   - ${deleteParams.Delete.Objects.length} fichiers supprimés.`);

        if (listedObjects.IsTruncated) {
            listParams.ContinuationToken = listedObjects.NextContinuationToken;
        } else {
            break;
        }
    }
}

/**
 * Analyse récursivement un dossier local pour lister tous les fichiers.
 *
 * @param {string} dirPath - Le dossier à scanner.
 * @param {string[]} arrayOfFiles - Tableau accumulateur.
 * @param {string} rootDir - Le dossier de référence pour le calcul du chemin relatif.
 * @returns {string[]} Liste des chemins relatifs de fichiers.
 */
function getAllFiles(dirPath, arrayOfFiles = [], rootDir = '') {
    if (!fs.existsSync(dirPath)) return arrayOfFiles;

    const files = fs.readdirSync(dirPath);
    files.forEach(function (file) {
        if (file.startsWith('.')) return;
        if (file === '.DS_Store') return;
        const fullPath = path.join(dirPath, file);
        if (fs.statSync(fullPath).isDirectory()) {
            getAllFiles(fullPath, arrayOfFiles, rootDir);
        } else {
            arrayOfFiles.push(path.relative(rootDir, fullPath));
        }
    });
    return arrayOfFiles;
}

/**
 * Indique si un objet R2 a le même contenu que le fichier local.
 *
 * @param {{ ContentLength?: number, ETag?: string }} remote - Réponse HEAD de l'objet.
 * @param {string} localPath - Chemin du fichier local.
 * @returns {boolean} `true` si le fichier local n'a pas besoin d'être réenvoyé.
 */
function isSameAsRemote(remote, localPath) {
    if (remote.ContentLength !== fs.statSync(localPath).size) return false;
    const etag = String(remote.ETag ?? '').replaceAll('"', '');
    // POURQUOI : l'ETag d'un objet multipart (« hash-N ») n'est pas un MD5 ; la taille suffit alors.
    if (!etag || etag.includes('-')) return true;
    return createHash('md5').update(fs.readFileSync(localPath)).digest('hex') === etag;
}

/**
 * Synchronise ou envoie incrémentiellement un dossier local vers R2.
 *
 * @param {string} dirName - Le nom du dossier local.
 * @param {boolean} incremental - Active ou désactive le mode incrémentiel.
 * @param {boolean} force - Force l'upload en mode incrémentiel si le fichier existe déjà.
 * @param {boolean} dryRun - N'écrit rien sur R2.
 * @param {boolean} [changed] - Réenvoie aussi les fichiers présents sur R2 dont le contenu diffère.
 * @returns {Promise<number>} Le nombre d'échecs.
 */
async function uploadDirectory(dirName, incremental, force, dryRun, changed = false) {
    const localDir = path.join(ASSETS_DIR, dirName);
    console.log(`📂 Traitement du dossier : ${dirName}`);

    // WARNING: vérifier le dossier local AVANT de vider R2. Sans lui (CI, autre machine),
    // le mode miroir supprimait tout le préfixe distant sans rien réenvoyer.
    if (!fs.existsSync(localDir)) {
        console.error(`❌ Dossier local introuvable : ${localDir}${incremental ? '' : ' (R2 non vidé)'}`);
        return 1;
    }

    const files = getAllFiles(localDir, [], ASSETS_DIR);
    console.log(`🚀 Analyse de ${files.length} fichiers locaux...`);

    if (dryRun && !changed) {
        console.log(
            incremental
                ? `   [dry-run] ${files.length} fichiers seraient comparés à R2 et les absents envoyés.`
                : `   [dry-run] Le préfixe R2 "${dirName}/" serait vidé puis ${files.length} fichiers réenvoyés.`,
        );
        return 0;
    }

    // POURQUOI: En mode miroir, on nettoie d'abord le stockage distant pour éviter
    // de conserver des fichiers obsolètes supprimés localement.
    if (!incremental) {
        await emptyDirectory(dirName + '/');
    }

    let uploadedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const fileRelPath of files) {
        const s3Key = fileRelPath.split(path.sep).join('/');

        // POURQUOI: En mode incrémentiel, on fait une requête HEAD rapide vers le stockage R2.
        // Si le fichier existe déjà et que l'option force n'est pas active, on évite le téléversement
        // pour optimiser la bande passante et le temps d'exécution.
        if (incremental && !force) {
            try {
                const remote = await s3.send(
                    new HeadObjectCommand({
                        Bucket: bucketName,
                        Key: s3Key,
                    }),
                );
                if (!changed || isSameAsRemote(remote, path.join(ASSETS_DIR, fileRelPath))) {
                    skippedCount++;
                    if (skippedCount % 50 === 0) {
                        process.stdout.write(`(Passés ${skippedCount})... `);
                    }
                    continue;
                }
            } catch (e) {
                if (e.name !== 'NotFound' && e.$metadata?.httpStatusCode !== 404) {
                    console.error(`⚠️  Erreur check ${s3Key}:`, e.message);
                    errorCount++;
                    continue;
                }
                // Si 404, on continue vers le téléversement
            }
        }

        if (dryRun) {
            console.log(`   [dry-run] Serait envoyé : ${s3Key}`);
            uploadedCount++;
            continue;
        }

        const localPath = path.join(ASSETS_DIR, fileRelPath);
        const fileContent = fs.readFileSync(localPath);
        const contentType = getContentType(localPath);

        try {
            await s3.send(
                new PutObjectCommand({
                    Bucket: bucketName,
                    Key: s3Key,
                    Body: fileContent,
                    ContentType: contentType,
                }),
            );
            uploadedCount++;

            // On loggue en temps réel en mode incrémentiel ou forcé
            if (incremental || force) {
                console.log(`   [ok] ${force ? 'Écrasé & ' : ''}Téléversé : ${s3Key}`);
            }
        } catch (e) {
            console.error(`❌ Erreur upload ${s3Key}:`, e.message);
            errorCount++;
        }
    }
    console.log(`\n✅ Bilan pour "${dirName}" (Mode : ${incremental ? 'Incrémentiel' : 'Complet'}) :`);
    console.log(`   • Téléversés : ${uploadedCount}`);
    console.log(`   • Déjà présents : ${skippedCount}`);
    console.log(`   • Échecs : ${errorCount}\n`);
    return errorCount;
}

/**
 * Point d'entrée principal.
 */
async function main() {
    // Lecture et typage des arguments CLI
    let parsed;
    try {
        parsed = parseCliArgs(process.argv.slice(2), {
            flags: {
                deleteFirst: ['--delete-first'],
                force: ['--force', '-f'],
                incremental: ['--incremental', '-i'],
                changed: ['--changed'],
                dryRun: ['--dry-run'],
            },
        });
    } catch (error) {
        console.error(`❌ ${error.message}`);
        process.exit(1);
    }
    const { deleteFirst, force, dryRun, changed } = parsed.flags;
    if (changed && (deleteFirst || force)) {
        console.error('❌ --changed est incompatible avec --delete-first et --force.');
        process.exit(1);
    }
    if (deleteFirst && parsed.flags.incremental) {
        console.error('❌ --delete-first et --incremental sont incompatibles.');
        process.exit(1);
    }
    const incremental = !deleteFirst;
    if (parsed.positionals.length > 1) {
        console.error('❌ Un seul dossier cible peut être indiqué.');
        process.exit(1);
    }
    const targetFilter = parsed.positionals[0];

    console.log("🔄 Démarrage du transfert d'Assets locaux → Cloudflare R2...\n");
    console.log(`Bucket Cible : ${bucketName}`);
    console.log(`Mode de transfert : ${incremental ? 'Incrémentiel' : 'Miroir (Destructif : --delete-first)'}`);
    if (force) console.log(`Option : Remplacement forcé actif (--force)`);
    if (changed) console.log('Option : réenvoi des fichiers modifiés (--changed)');
    if (dryRun) console.log('Option : simulation (--dry-run), aucune écriture sur R2');
    console.log('');

    let dirsToSync = TARGET_DIRS;

    if (targetFilter) {
        // POURQUOI: Permet de synchroniser un sous-répertoire spécifique (ex: 'blog/2025')
        // en vérifiant que le dossier de premier niveau est valide et que le dossier local existe.
        const topLevelDir = targetFilter.split(/[/\\]/)[0];
        if (!TARGET_DIRS.includes(topLevelDir) || targetFilter.split(/[/\\]/).includes('..')) {
            console.error(`❌ Répertoire ou sous-répertoire inconnu ou non autorisé: "${targetFilter}"`);
            console.error(`Les répertoires de base valides sont: ${TARGET_DIRS.join(', ')}`);
            process.exit(1);
        }

        const localPath = path.join(ASSETS_DIR, targetFilter);
        if (!fs.existsSync(localPath) || !fs.statSync(localPath).isDirectory()) {
            console.error(`❌ Le répertoire local n'existe pas ou n'est pas un dossier: "${targetFilter}"`);
            process.exit(1);
        }

        dirsToSync = [targetFilter];
        console.log(`📌 Mode ciblé : synchronisation de "${targetFilter}" uniquement.\n`);
    }

    let totalErrors = 0;
    for (const dir of dirsToSync) {
        totalErrors += await uploadDirectory(dir, incremental, force, dryRun, changed);
    }

    // POURQUOI : l'admin (/admin/scripts) juge le succès sur le code de sortie.
    if (totalErrors > 0) {
        console.error(`❌ Transfert terminé avec ${totalErrors} échec(s).`);
        process.exit(1);
    }
    console.log("🎉 Transfert d'assets terminé !");
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
