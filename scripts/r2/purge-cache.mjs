/**
 * Purge du cache du worker d'images Cloudflare
 *
 * Responsabilité principale :
 * - Lister les images (.jpg, .jpeg, .png, .webp) présentes EN LOCAL sous src/assets/<dossier> : une
 *   image présente seulement sur R2 n'est pas purgée. Avec --from-r2, lister plutôt les images du bucket
 *   sous ce préfixe (admin distant : GitHub Actions n'a pas les images en local).
 * - Pour chacune, purger l'URL nue puis chaque variante de IMAGE_CONFIG.CACHED_VARIANTS en f_jpeg (les
 *   URL exactes demandées par le site), par GET avec les en-têtes `x-purge` et `x-purge-key`.
 * - Réessayer jusqu'à 3 fois sur 503 ou erreur réseau, 200 ms de pause entre deux requêtes
 *   (scripts/lib/worker-cache.mjs).
 *
 * Effet distant : vide des entrées du cache du worker (IMAGE_WORKER_URL, IMAGE_WORKER_PURGE_KEY, .env
 * de la racine du dépôt). Aucune écriture R2 (avec --from-r2, lecture de la liste du bucket : R2_ACCOUNT_ID,
 * R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME). Les images sont ensuite ré-encodées à la demande.
 *
 * Options disponibles :
 *   [dossier|all] : premier argument qui ne commence pas par `-`. Sous-dossier de src/assets/ à purger
 *                   (ex. blog, voyages/2026) ; défaut astrophotographies. `all` : tout src/assets/ sauf
 *                   les LOCAL_ONLY_DIRS. Les autres arguments commençant par `-` sont ignorés.
 *   --prefix=<dossier> : même chose sous forme d'option (entrée `purge-cache-ci`), prioritaire.
 *   --from-r2     : liste les images sur R2 (préfixe `<dossier>/`, tout le bucket pour `all`) au lieu de
 *                   src/assets/.
 *
 * Code de sortie : 1 si le dossier local n'existe pas, si une variable d'environnement manque ou si une
 * purge échoue.
 *
 * Exemples d'utilisation :
 *   node scripts/r2/purge-cache.mjs                 # astrophotographies/
 *   node scripts/r2/purge-cache.mjs blog/2026       # une année du blog
 *   node scripts/r2/purge-cache.mjs voyages
 *   node scripts/r2/purge-cache.mjs all             # tout ce qui est synchronisé sur R2
 *   node scripts/r2/purge-cache.mjs --from-r2 --prefix=voyages   # d'après le bucket (GitHub Actions)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { LOCAL_ONLY_DIRS } from '../../src/config/imageConfig.mjs';
import { createR2Client, requireR2Config } from '../lib/r2.mjs';
import { purgeImageKeys } from '../lib/worker-cache.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../');

dotenv.config({ path: path.join(rootDir, '.env') });

const WORKER_URL = process.env.IMAGE_WORKER_URL;
const PURGE_KEY = process.env.IMAGE_WORKER_PURGE_KEY;
const args = process.argv.slice(2);
// POURQUOI: Permet de cibler un répertoire ou sous-répertoire spécifique d'assets (ex: 'blog', 'blog/2025')
// et se replie par défaut sur 'astrophotographies' si aucun argument n'est fourni.
// Si TARGET_DIR est 'all', on cible la racine de src/assets pour tout purger.
const prefixOption = args.find((arg) => arg.startsWith('--prefix='))?.slice('--prefix='.length);
const TARGET_DIR = prefixOption || args.find((arg) => !arg.startsWith('-')) || 'astrophotographies';
const FROM_R2 = args.includes('--from-r2');
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
const ASSETS_ROOT =
    TARGET_DIR === 'all' ? path.join(rootDir, 'src/assets') : path.join(rootDir, 'src/assets', TARGET_DIR);

if (!WORKER_URL || !PURGE_KEY) {
    console.error('❌ ERREUR: IMAGE_WORKER_URL ou IMAGE_WORKER_PURGE_KEY manquant dans .env');
    process.exit(1);
}

/**
 * Recense tous les fichiers d'images de manière récursive sous un dossier racine d'assets.
 *
 * @param {string} dirPath - Le dossier à scanner.
 * @param {string[]} list - Liste des chemins relatifs accumulés.
 * @returns {string[]} Liste des chemins d'images relatifs à src/assets.
 */
function getImagesRecursive(dirPath, list = []) {
    if (!fs.existsSync(dirPath)) return list;
    const items = fs.readdirSync(dirPath);

    for (const item of items) {
        if (item.startsWith('.')) continue;

        // POURQUOI: Sécurité pour éviter de purger des images purement locales si on scanne la racine src/assets
        if (LOCAL_ONLY_DIRS.includes(item) && dirPath === path.join(rootDir, 'src/assets')) continue;

        const fullPath = path.join(dirPath, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            getImagesRecursive(fullPath, list);
        } else {
            const ext = path.extname(item).toLowerCase();
            if (IMAGE_EXTENSIONS.includes(ext)) {
                // Calculer le chemin relatif par rapport à src/assets
                const assetsPath = path.join(rootDir, 'src/assets');
                const rel = path.relative(assetsPath, fullPath).split(path.sep).join('/');
                list.push(rel);
            }
        }
    }
    return list;
}

/**
 * Liste les images du bucket R2 sous le dossier ciblé (hors LOCAL_ONLY_DIRS).
 *
 * @returns {Promise<string[]>} Clés des images, relatives à la racine du bucket (= à src/assets/).
 */
async function listR2Images() {
    const r2Config = requireR2Config();
    const s3 = createR2Client(r2Config);
    const prefix = TARGET_DIR === 'all' ? undefined : `${TARGET_DIR.replace(/\/+$/, '')}/`;
    const keys = [];
    let continuationToken;
    do {
        const response = await s3.send(
            new ListObjectsV2Command({
                Bucket: r2Config.bucketName,
                Prefix: prefix,
                ContinuationToken: continuationToken,
            }),
        );
        keys.push(...(response.Contents ?? []).map((object) => object.Key));
        continuationToken = response.NextContinuationToken;
    } while (continuationToken);
    return keys.filter((key) => {
        const lowerKey = key.toLowerCase();
        return (
            IMAGE_EXTENSIONS.some((ext) => lowerKey.endsWith(ext)) &&
            !LOCAL_ONLY_DIRS.some((dir) => lowerKey.startsWith(`${dir}/`))
        );
    });
}

/**
 * Main execution flow for directory-level cache purging.
 */
async function main() {
    let files;
    if (FROM_R2) {
        files = await listR2Images();
    } else {
        if (!fs.existsSync(ASSETS_ROOT)) {
            console.error('❌ Répertoire introuvable:', ASSETS_ROOT);
            process.exit(1);
        }
        files = getImagesRecursive(ASSETS_ROOT);
    }
    console.log(`🚀 Purge du cache pour ${files.length} images dans "${TARGET_DIR}"...\n`);

    const failedCount = await purgeImageKeys(files, { workerUrl: WORKER_URL, purgeKey: PURGE_KEY });

    if (failedCount > 0) {
        console.error(`\n❌ Purge terminée avec ${failedCount} échec(s).`);
        process.exit(1);
    }
    console.log('\n✨ Opération de purge terminée.');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
