import fs from 'fs';
import path from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '../../.env') });
import { fileURLToPath } from 'url';
import { LOCAL_ONLY_DIRS } from '../../src/config/imageConfig.mjs';

/**
 * Audit de la présence sur R2 des médias locaux
 *
 * Responsabilité principale :
 * - Parcourir src/assets/ (fichiers .jpg, .jpeg, .png, .webp, .svg, .gif, .mp4, .webm), en ignorant
 *   les fichiers cachés et tout chemin contenant un segment LOCAL_ONLY_DIRS (à n'importe quelle
 *   profondeur, pas seulement à la racine).
 * - Vérifier chaque fichier par une requête HEAD sur l'URL publique R2 (PUBLIC_R2_URL, sinon
 *   https://pub-r2.miroirspolaires.fr), 20 en parallèle ; seul un statut 200 compte comme présent.
 * - Afficher un tableau par dossier (local, R2, manquants).
 * - S'il manque des fichiers, écrire leurs chemins relatifs à src/assets/ dans missing_r2_upload.txt,
 *   dans le répertoire COURANT (lancer depuis la racine). Le fichier n'est ni vidé ni supprimé quand
 *   rien ne manque : une ancienne liste peut subsister.
 *
 * Effet distant : aucune écriture ; requêtes HEAD publiques, sans identifiants R2.
 *
 * Options disponibles :
 *   Aucune. Tout argument est ignoré.
 *
 * Code de sortie : 0 même s'il manque des fichiers ; 1 seulement sur erreur inattendue.
 *
 * Exemples d'utilisation :
 *   node scripts/audit/r2-coverage.js
 *   node scripts/r2/upload_local_to_r2.js blog   # ensuite, pour envoyer les fichiers manquants de blog
 */

const assetsDir = path.join(__dirname, '../../src/assets');
const r2Url = process.env.PUBLIC_R2_URL || 'https://pub-r2.miroirspolaires.fr';

// Directories managed locally (in git, served by Astro) - NOT on R2

/**
 * Recursively retrieves all relevant local assets, excluding hidden files and local-only folders.
 *
 * @param {string} dir - Directory to scan.
 * @returns {string[]} List of full file paths.
 */
function getFiles(dir) {
    let results = [];
    if (!fs.existsSync(dir)) return [];
    const list = fs.readdirSync(dir);
    list.forEach(function (file) {
        if (file.startsWith('.')) return;
        const fullPath = path.resolve(dir, file);
        if (LOCAL_ONLY_DIRS.some((d) => fullPath.includes(`/${d}/`) || fullPath.endsWith(`/${d}`))) return;
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
            results = results.concat(getFiles(fullPath));
        } else {
            if (/\.(jpg|jpeg|png|webp|svg|gif|mp4|webm)$/i.test(file)) {
                results.push(fullPath);
            }
        }
    });
    return results;
}

/**
 * Groups a flat list of files by their directory relative to the root.
 *
 * @param {string[]} files - List of file paths.
 * @param {string} rootDir - The root directory for relative path calculation.
 * @returns {Object.<string, string[]>} Files grouped by directory name.
 */
function groupByDirectory(files, rootDir) {
    const groups = {};
    files.forEach((filePath) => {
        const relativePath = path.relative(rootDir, filePath);
        const dir = path.dirname(relativePath);
        if (!groups[dir]) groups[dir] = [];
        groups[dir].push(relativePath);
    });
    return groups;
}

/**
 * Verifies if a file exists on the R2 public endpoint.
 *
 * @param {string} relativePath - Relative path of the file.
 * @returns {Promise<boolean>} True if the file exists (HTTP 200).
 */
async function checkFile(relativePath) {
    const urlPath = relativePath.split(path.sep).join('/');
    const url = `${r2Url.replace(/\/$/, '')}/${urlPath}`;
    try {
        const res = await fetch(url, { method: 'HEAD' });
        return res.status === 200;
    } catch {
        return false;
    }
}

/**
 * Main execution logic for checking image synchronization.
 * Performs parallel batch requests to R2 for performance.
 */
async function checkImages() {
    console.log(`🔍 Vérification de la synchronisation R2...\n`);
    console.log(`📁 Dossier local : ${assetsDir}`);
    console.log(`🌐 URL R2 : ${r2Url}\n`);

    const allFiles = getFiles(assetsDir);
    const groups = groupByDirectory(allFiles, assetsDir);

    const sortedDirs = Object.keys(groups).sort();

    let totalLocal = 0;
    let totalOnR2 = 0;
    let totalMissing = 0;
    const missingFiles = [];

    console.log('─'.repeat(80));
    console.log(`${'Répertoire'.padEnd(50)} | Local | R2   | Statut`);
    console.log('─'.repeat(80));

    for (const dir of sortedDirs) {
        const files = groups[dir];
        const localCount = files.length;
        totalLocal += localCount;

        let r2Count = 0;
        const batchSize = 20;

        for (let i = 0; i < files.length; i += batchSize) {
            const batch = files.slice(i, i + batchSize);
            const results = await Promise.all(batch.map((f) => checkFile(f)));
            results.forEach((exists, idx) => {
                if (exists) {
                    r2Count++;
                } else {
                    missingFiles.push(batch[idx]);
                }
            });
        }

        totalOnR2 += r2Count;
        const missing = localCount - r2Count;
        totalMissing += missing;

        const status = missing === 0 ? '✅ OK' : `❌ ${missing} manquant(s)`;
        const displayDir = dir.length > 48 ? '...' + dir.slice(-45) : dir;
        console.log(
            `${displayDir.padEnd(50)} | ${String(localCount).padStart(5)} | ${String(r2Count).padStart(4)} | ${status}`,
        );
    }

    console.log('─'.repeat(80));
    console.log(
        `${'TOTAL'.padEnd(50)} | ${String(totalLocal).padStart(5)} | ${String(totalOnR2).padStart(4)} | ${totalMissing === 0 ? '✅ Tous synchronisés' : `❌ ${totalMissing} fichier(s) manquant(s)`}`,
    );
    console.log('─'.repeat(80));

    if (missingFiles.length > 0) {
        fs.writeFileSync('missing_r2_upload.txt', missingFiles.join('\n'));
        console.log(`\n📄 Liste des fichiers manquants sauvegardée dans missing_r2_upload.txt`);
    }
}

checkImages().catch((err) => {
    console.error(err);
    process.exit(1);
});
