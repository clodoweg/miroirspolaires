/**
 * Mise à jour complète des astrophotos (bouton « Mettre à jour les photos » de /admin/astrophotos)
 *
 * Responsabilité principale, dans l'ordre :
 *  1. Importer depuis le dépôt voisin `astrobin` le CSV et le HTML (s'ils sont plus récents).
 *  2. Déplacer les fichiers dont l'année a changé dans le CSV (migrate-asset-years.mjs).
 *  3. Importer les raws, annotations et skyplots absents ou modifiés, pour l'année du CSV seulement.
 *  4. Générer les miniatures manquantes (generate-mini.mjs).
 *  5. Alts manquants, construits depuis le CSV (scripts/lib/alt-coverage.mjs), puis fiches techniques et
 *     descriptions Wikipedia manquantes (scripts/seo/).
 *  6. Envoyer sur R2 ce qui est absent ou modifié sous astrophotographies/ (--changed, jamais de suppression).
 *  7. Recalculer src/data/image-dimensions.json (compute-image-dimensions.mjs --only=astro).
 *  8. Générer et envoyer les versions web manquantes (generate-web-images.mjs --only=astro --upload).
 *  9. Afficher les photos encore incomplètes et les fichiers à committer. Les descriptions SEO manquantes
 *     sont seulement signalées : elles s'écrivent via Claude Code (/generate-seo astro).
 *
 * Tous les traitements sont incrémentaux : un second lancement ne refait que ce qui manque.
 * Un échec à l'étape 1 ou 3 arrête tout ; un autre échec n'empêche pas les étapes suivantes, mais
 * donne le code de sortie 1.
 *
 * Le scrape AstroBin ne se lance jamais depuis l'admin : scrape_astrobin.py s'exécute à la main, avant
 * ce script, et enchaîne lui-même la génération des SVG et la copie vers ce dépôt.
 * POURQUOI ne pas appeler sync_to_miroirspolaires.py : il supprime tout le dossier cible avant de le
 * recopier (2,8 Go) et recopie les fichiers de l'ancienne année.
 *
 * Effet distant : R2 (écriture sous astrophotographies/ et web/, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
 * R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME obligatoires) et Wikipedia.
 * Effet local : src/assets/astrophotographies/, data/ et src/data/ (à committer ensuite).
 *
 * Options disponibles (toute autre option est refusée, code de sortie 1) :
 *   --dry-run : Simule : rien n'est écrit, ni en local ni sur R2 (R2 est seulement interrogé). Les
 *               étapes sans simulation (miniatures, SEO, dimensions) sont signalées et sautées.
 *
 * Variable d'environnement :
 *   ASTROBIN_DIR : dossier du dépôt astrobin (défaut : ../astrobin). S'il manque, les imports sont sautés.
 *
 * Exemples d'utilisation :
 *   node scripts/pipeline/update-photos.mjs --dry-run
 *   node scripts/pipeline/update-photos.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import { planAstroAlts } from '../lib/alt-coverage.mjs';
import { findIncompletePhotos, needsCopy, planAstrobinImport } from '../lib/astrobin-import.mjs';
import { parseCliArgs } from '../lib/args.mjs';
import { PROJECT_ROOT, loadEnv } from '../lib/env.mjs';
import { exitIfStopped, isStopRequested, runScript, runSteps } from '../lib/pipeline-runner.mjs';

loadEnv();

const ASTROBIN_DIR = path.resolve(PROJECT_ROOT, process.env.ASTROBIN_DIR ?? '../astrobin');
const ASTRO_ROOT = path.join(PROJECT_ROOT, 'src/assets/astrophotographies');
const DATA_FILES = ['astrobin_clodoweg_gallery_python.csv', 'astrobin_clodoweg_gallery_python.html'];
const CSV_PATH = path.join(PROJECT_ROOT, 'data', DATA_FILES[0]);

const FILES_TO_COMMIT = [
    'data/astrobin_clodoweg_gallery_python.csv',
    'data/astrobin_clodoweg_gallery_python.html',
    'src/assets/astrophotographies/annotations',
    'src/data/alt.json',
    'src/data/seo.json',
    'src/data/wikipedia.json',
    'src/data/astro_details.json',
    'src/data/image-dimensions.json',
    'src/data/web-images.json',
];

/** Étapes après l'import. `dryRunArgs` absent : le script n'a pas de simulation, l'étape est sautée. */
const SCRIPT_STEPS = [
    { label: 'Miniatures', args: ['scripts/pipeline/generate-mini.mjs', '--only=astro'] },
    { label: 'Fiches techniques (Wikipedia)', args: ['scripts/seo/astro-details.mjs'] },
    // WARNING: ce pipeline ne porte que sur les astrophotos. Tout script partagé avec le blog, les voyages
    // ou l'accueil doit recevoir --only, sinon le bouton de /admin/astrophotos déborde sur ces domaines.
    { label: 'Descriptions Wikipedia', args: ['scripts/seo/wiki-descriptions.js'] },
    {
        label: 'Envoi sur R2',
        args: ['scripts/r2/upload_local_to_r2.js', 'astrophotographies', '--changed'],
        dryRunArgs: ['scripts/r2/upload_local_to_r2.js', 'astrophotographies', '--changed', '--dry-run'],
    },
    { label: "Dimensions d'images", args: ['scripts/build/compute-image-dimensions.mjs', '--only=astro'] },
    {
        label: 'Versions web sur R2',
        args: ['scripts/build/generate-web-images.mjs', '--only=astro', '--upload'],
        dryRunArgs: ['scripts/build/generate-web-images.mjs', '--only=astro', '--dry-run'],
    },
];

/**
 * Lit les lignes du CSV.
 *
 * @returns {Record<string, string>[]} Les lignes avec un ID.
 */
function readCsvRows() {
    const content = fs.readFileSync(CSV_PATH, 'utf8');
    return Papa.parse(content, { header: true, skipEmptyLines: true }).data.filter((row) => row.ID);
}

/**
 * Copie un fichier en conservant sa date de modification, pour qu'il ne soit pas recopié ensuite.
 *
 * @param {string} source - Fichier source.
 * @param {string} target - Fichier cible.
 * @returns {void}
 */
function copyPreservingTime(source, target) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
    const { atime, mtime } = fs.statSync(source);
    fs.utimesSync(target, atime, mtime);
}

/**
 * Importe le CSV et le HTML du dépôt astrobin.
 *
 * @param {boolean} dryRun - N'écrit rien.
 * @returns {void}
 */
function importDataFiles(dryRun) {
    for (const fileName of DATA_FILES) {
        const source = path.join(ASTROBIN_DIR, fileName);
        const target = path.join(PROJECT_ROOT, 'data', fileName);
        if (!fs.existsSync(source)) {
            console.warn(`⚠️  Absent du dépôt astrobin : ${fileName}`);
        } else if (needsCopy(source, target)) {
            console.log(`${dryRun ? '[dry-run] Serait copié' : 'Copié'} : ${fileName}`);
            if (!dryRun) copyPreservingTime(source, target);
        } else {
            console.log(`À jour : ${fileName}`);
        }
    }
}

/**
 * Importe les raws, annotations et skyplots du dépôt astrobin.
 *
 * @param {boolean} dryRun - N'écrit rien.
 * @returns {void}
 */
function importImages(dryRun) {
    const sourceRoot = path.join(ASTROBIN_DIR, 'astrophotographies');
    const { copies, ignoredCount } = planAstrobinImport(sourceRoot, ASTRO_ROOT, readCsvRows());
    for (const { source, target } of copies) {
        console.log(`${dryRun ? '[dry-run] Serait copié' : 'Copié'} : ${path.relative(sourceRoot, source)}`);
        if (!dryRun) copyPreservingTime(source, target);
    }
    console.log(`${copies.length} fichier(s) à importer, ${ignoredCount} écarté(s) (ancienne année ou hors CSV).`);
}

/**
 * Ajoute à `alt.json` les alts manquants des photos du CSV, sans jamais en remplacer un.
 *
 * @param {boolean} dryRun - N'écrit rien.
 * @returns {void}
 */
function fillAstroAlts(dryRun) {
    const altPath = path.join(PROJECT_ROOT, 'src/data/alt.json');
    const altText = fs.readFileSync(altPath, 'utf8');
    const altData = JSON.parse(altText);
    const additions = planAstroAlts(readCsvRows(), altData);
    for (const [key, text] of Object.entries(additions)) {
        console.log(`${dryRun ? '[dry-run] Serait ajouté' : 'Ajouté'} : ${key} → ${text}`);
    }
    console.log(`${Object.keys(additions).length} alt(s) ajouté(s).`);
    if (dryRun || Object.keys(additions).length === 0) return;
    const ending = altText.endsWith('\n') ? '\n' : '';
    fs.writeFileSync(altPath, JSON.stringify({ ...altData, ...additions }, null, 2) + ending);
}

/**
 * Affiche les photos incomplètes.
 *
 * @returns {number} Le nombre de photos sans raw ou sans miniature, seuls manques qui cassent une page.
 */
function reportIncompletePhotos() {
    const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, relativePath), 'utf8'));
    const incomplete = findIncompletePhotos(
        readCsvRows(),
        ASTRO_ROOT,
        readJson('src/data/alt.json'),
        readJson('src/data/seo.json'),
    );
    for (const { id, title, missing } of incomplete) {
        console.warn(`⚠️  ${id} (${title}) : manque ${missing.join(', ')}`);
    }
    if (incomplete.length === 0) console.log('✅ Toutes les photos du CSV sont complètes.');
    if (incomplete.some(({ missing }) => missing.includes('seo'))) {
        console.warn('Descriptions SEO à écrire via Claude Code : /generate-seo astro');
    }
    return incomplete.filter(({ missing }) => missing.includes('raw') || missing.includes('mini')).length;
}

/**
 * Enchaîne les étapes.
 *
 * @returns {Promise<void>}
 */
async function main() {
    let parsed;
    try {
        parsed = parseCliArgs(process.argv.slice(2), { flags: { dryRun: ['--dry-run'] } });
    } catch (error) {
        console.error(`❌ ${error.message}`);
        process.exit(1);
    }
    const { dryRun } = parsed.flags;
    if (parsed.positionals.length > 0) {
        console.error('❌ Ce script ne prend aucun argument positionnel.');
        process.exit(1);
    }

    const failures = [];
    const hasAstrobin = fs.existsSync(ASTROBIN_DIR);

    console.log(`\n=== Import du CSV depuis ${ASTROBIN_DIR} ===`);
    if (hasAstrobin) importDataFiles(dryRun);
    else console.warn('⚠️  Dépôt astrobin introuvable : imports sautés (voir ASTROBIN_DIR).');

    console.log('\n=== Années modifiées dans le CSV ===');
    const migrationArgs = ['scripts/pipeline/migrate-asset-years.mjs', ...(dryRun ? ['--dry-run'] : [])];
    if ((await runScript(migrationArgs)) !== 0) failures.push('Années modifiées');

    if (hasAstrobin && !isStopRequested()) {
        console.log('\n=== Import des raws, annotations et skyplots ===');
        importImages(dryRun);
    }

    if (!isStopRequested()) {
        console.log('\n=== Textes alternatifs (depuis le CSV) ===');
        fillAstroAlts(dryRun);
    }

    failures.push(...(await runSteps(SCRIPT_STEPS, dryRun)));
    exitIfStopped();

    console.log('\n=== Bilan ===');
    const brokenPhotoCount = reportIncompletePhotos();
    // POURQUOI : en simulation, les miniatures n'ont pas été générées : leur absence n'est pas un échec.
    if (brokenPhotoCount > 0 && !dryRun) failures.push(`${brokenPhotoCount} photo(s) sans raw ou sans miniature`);

    if (failures.length > 0) {
        console.error(`\n❌ Étapes en échec : ${failures.join(' ; ')}`);
        process.exit(1);
    }
    console.log(`\nÀ committer ensuite s'ils ont changé :\n${FILES_TO_COMMIT.map((file) => `  ${file}`).join('\n')}`);
    console.log('\nPipeline terminé avec succès.');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
