/**
 * Asset Year Synchronization Script
 *
 * Responsabilité principale :
 * - Scanne data/astrobin_clodoweg_gallery_python.csv pour détecter les photos dont
 *   l'année d'acquisition/upload ne correspond plus au répertoire physique dans src/assets/astrophotographies/.
 * - Déplace les fichiers sources (raw), annotations, skyplots et vignettes (mini) vers
 *   les dossiers correspondant à la nouvelle année.
 * - Met à jour les chemins dans src/data/alt.json pour préserver la correspondance des descriptions alternatives.
 *
 * Options disponibles :
 *   --dry-run : Affiche les opérations prévues sans effectuer de modification sur le disque ni sur les JSON.
 *
 * Exemples d'utilisation :
 *   node scripts/pipeline/migrate-asset-years.mjs --dry-run
 *   node scripts/pipeline/migrate-asset-years.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Papa from 'papaparse';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');

const CSV_PATH = path.join(PROJECT_ROOT, 'data/astrobin_clodoweg_gallery_python.csv');
const ASTRO_ROOT = path.join(PROJECT_ROOT, 'src/assets/astrophotographies');
const ALT_JSON_PATH = path.join(PROJECT_ROOT, 'src/data/alt.json');

const IS_DRY_RUN = process.argv.includes('--dry-run');

/**
 * Recherche récursivement un fichier dans un répertoire en ignorant les sous-dossiers spécifiques.
 *
 * @param {string} searchDirectory - Chemin absolu du répertoire à explorer.
 * @param {string} targetFileName - Nom exact du fichier recherché.
 * @param {Set<string>} ignoredDirectories - Noms des dossiers à ignorer.
 * @returns {string | null} Chemin absolu du fichier trouvé, ou null.
 */
function findFileRecursively(
    searchDirectory,
    targetFileName,
    ignoredDirectories = new Set(['mini', 'annotations', 'skyplots']),
) {
    if (!fs.existsSync(searchDirectory)) return null;

    const entries = fs.readdirSync(searchDirectory, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.isDirectory()) {
            if (ignoredDirectories.has(entry.name)) continue;
            const foundSubPath = findFileRecursively(
                path.join(searchDirectory, entry.name),
                targetFileName,
                ignoredDirectories,
            );
            if (foundSubPath) return foundSubPath;
        } else if (entry.name === targetFileName) {
            return path.join(searchDirectory, entry.name);
        }
    }

    return null;
}

/**
 * Déplace un fichier physique d'un dossier source vers un dossier de destination, en créant
 * les dossiers parents si nécessaire.
 *
 * WARNING: Écrase le fichier destination s'il existe déjà afin d'éviter les doublons orphelins.
 *
 * @param {string} sourceFilePath - Chemin source.
 * @param {string} destinationFilePath - Chemin cible.
 */
function moveAssetFile(sourceFilePath, destinationFilePath) {
    if (!fs.existsSync(sourceFilePath)) return;

    if (IS_DRY_RUN) {
        console.log(`[DRY-RUN] Déplacement : ${sourceFilePath} -> ${destinationFilePath}`);
        return;
    }

    const destinationDirectory = path.dirname(destinationFilePath);
    if (!fs.existsSync(destinationDirectory)) {
        fs.mkdirSync(destinationDirectory, { recursive: true });
    }

    fs.copyFileSync(sourceFilePath, destinationFilePath);
    fs.unlinkSync(sourceFilePath);
    console.log(
        `✅ Déplacé : ${path.relative(ASTRO_ROOT, sourceFilePath)} -> ${path.relative(ASTRO_ROOT, destinationFilePath)}`,
    );
}

/**
 * Exécute la synchronisation de l'arborescence des assets astrophotographiques avec les années du CSV.
 *
 * @returns {Promise<void>}
 */
export async function syncAssetYears() {
    console.log(`--- Synchronisation des assets selon le CSV ${IS_DRY_RUN ? '(Mode Simulation --dry-run)' : ''} ---`);

    const csvContent = fs.readFileSync(CSV_PATH, 'utf8');
    const parsedCsv = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
    const rows = parsedCsv.data;

    const altContent = fs.readFileSync(ALT_JSON_PATH, 'utf8');
    const altData = JSON.parse(altContent);
    let altModified = false;

    const subfolders = [
        { prefix: '', isRoot: true },
        { prefix: 'mini', isRoot: false },
        { prefix: 'annotations', isRoot: false },
        { prefix: 'skyplots', isRoot: false },
    ];

    let migratedPhotosCount = 0;

    for (const row of rows) {
        const photoId = String(row.ID || '').trim();
        if (!photoId) continue;

        const uploadedDate = String(row.Uploaded || '');
        const targetYear = uploadedDate.slice(0, 4);
        if (!targetYear || targetYear.length !== 4) continue;

        const rawFileName = `${photoId}_raw.jpg`;
        const currentRawPath = findFileRecursively(ASTRO_ROOT, rawFileName);
        if (!currentRawPath) continue;

        const currentRelativePath = path.relative(ASTRO_ROOT, currentRawPath);
        const currentYear = path.dirname(currentRelativePath).replace(/\\/g, '/');

        if (currentYear === targetYear) continue;

        migratedPhotosCount++;
        console.log(`\n📦 Photo ${photoId} ("${row.Title}") : déplacement ${currentYear} -> ${targetYear}`);

        // Déplacer les fichiers pour chaque sous-dossier (raw, mini, annotations, skyplots)
        for (const { prefix } of subfolders) {
            const currentDir = prefix ? path.join(ASTRO_ROOT, prefix, currentYear) : path.join(ASTRO_ROOT, currentYear);
            const targetDir = prefix ? path.join(ASTRO_ROOT, prefix, targetYear) : path.join(ASTRO_ROOT, targetYear);

            if (!fs.existsSync(currentDir)) continue;

            const filesInDir = fs.readdirSync(currentDir);
            for (const file of filesInDir) {
                if (file.startsWith(`${photoId}_`)) {
                    const sourceFilePath = path.join(currentDir, file);
                    const destinationFilePath = path.join(targetDir, file);
                    moveAssetFile(sourceFilePath, destinationFilePath);
                }
            }
        }

        // POURQUOI: Met à jour les clés dans alt.json car le site et l'admin recherchent les alts
        // via la clé absolue `/assets/astrophotographies/${year}/${id}_raw.jpg` et les skyplots associés.
        const oldPathPrefix = `/assets/astrophotographies/${currentYear}/${photoId}`;
        const newPathPrefix = `/assets/astrophotographies/${targetYear}/${photoId}`;
        const oldSkyplotPrefix = `/assets/astrophotographies/skyplots/${currentYear}/${photoId}`;
        const newSkyplotPrefix = `/assets/astrophotographies/skyplots/${targetYear}/${photoId}`;

        for (const key of Object.keys(altData)) {
            if (key.startsWith(oldPathPrefix)) {
                const altValue = altData[key];
                delete altData[key];
                const updatedKey = key.replace(oldPathPrefix, newPathPrefix);
                altData[updatedKey] = altValue;
                altModified = true;
                console.log(`📝 Alt.json MAJ : ${key} -> ${updatedKey}`);
            } else if (key.startsWith(oldSkyplotPrefix)) {
                const altValue = altData[key];
                delete altData[key];
                const updatedKey = key.replace(oldSkyplotPrefix, newSkyplotPrefix);
                altData[updatedKey] = altValue;
                altModified = true;
                console.log(`📝 Alt.json MAJ (skyplot) : ${key} -> ${updatedKey}`);
            }
        }
    }

    if (altModified && !IS_DRY_RUN) {
        fs.writeFileSync(ALT_JSON_PATH, JSON.stringify(altData, null, 2) + '\n', 'utf8');
        console.log(`\n💾 src/data/alt.json mis à jour avec succès.`);
    }

    console.log(`\n--- Bilan : ${migratedPhotosCount} photo(s) traitée(s) ---`);
}

// Exécution directe si invoqué via CLI
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    syncAssetYears().catch((error) => {
        console.error('Erreur fatale de synchronisation :', error);
        process.exit(1);
    });
}
