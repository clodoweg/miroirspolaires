/**
 * Purge du cache du worker d'images Cloudflare
 *
 * Responsabilité principale :
 * - Lister les images (.jpg, .jpeg, .png, .webp) présentes EN LOCAL sous src/assets/<dossier> : une
 *   image présente seulement sur R2 n'est pas purgée.
 * - Pour chacune, purger l'URL nue puis chaque variante de IMAGE_CONFIG.CACHED_VARIANTS en f_jpeg (les
 *   URL exactes demandées par le site), par GET avec les en-têtes `x-purge` et `x-purge-key`.
 * - Réessayer jusqu'à 3 fois sur 503 ou erreur réseau, 200 ms de pause entre deux requêtes
 *   (scripts/lib/worker-cache.mjs).
 *
 * Effet distant : vide des entrées du cache du worker (IMAGE_WORKER_URL, IMAGE_WORKER_PURGE_KEY, .env
 * de la racine du dépôt). Aucune écriture R2. Les images sont ensuite ré-encodées à la demande.
 *
 * Options disponibles :
 *   [dossier|all] : premier argument qui ne commence pas par `-`. Sous-dossier de src/assets/ à purger
 *                   (ex. blog, voyages/2026) ; défaut astrophotographies. `all` : tout src/assets/ sauf
 *                   les LOCAL_ONLY_DIRS. Les arguments commençant par `-` sont ignorés.
 *
 * Code de sortie : 1 si le dossier local n'existe pas, si une variable d'environnement manque ou si une
 * purge échoue.
 *
 * Exemples d'utilisation :
 *   node scripts/r2/purge-cache.mjs                 # astrophotographies/
 *   node scripts/r2/purge-cache.mjs blog/2026       # une année du blog
 *   node scripts/r2/purge-cache.mjs voyages
 *   node scripts/r2/purge-cache.mjs all             # tout ce qui est synchronisé sur R2
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { LOCAL_ONLY_DIRS } from '../../src/config/imageConfig.mjs';
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
const TARGET_DIR = args.find((arg) => !arg.startsWith('-')) || 'astrophotographies';
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
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp'];

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
            if (imageExtensions.includes(ext)) {
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
 * Main execution flow for directory-level cache purging.
 */
async function main() {
    if (!fs.existsSync(ASSETS_ROOT)) {
        console.error('❌ Répertoire introuvable:', ASSETS_ROOT);
        process.exit(1);
    }

    const files = getImagesRecursive(ASSETS_ROOT);
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
