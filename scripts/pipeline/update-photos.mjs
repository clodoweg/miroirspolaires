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
 * En local, le scrape AstroBin ne se lance pas d'ici : scrape_astrobin.py s'exécute à la main, avant
 * ce script, et enchaîne lui-même la génération des SVG et la copie vers ce dépôt.
 * POURQUOI ne pas appeler sync_to_miroirspolaires.py : il supprime tout le dossier cible avant de le
 * recopier (2,8 Go) et recopie les fichiers de l'ancienne année.
 *
 * Mode --ci (GitHub Actions, dossier src/assets/astrophotographies/ vide au départ) :
 *  1. Lancer le scrape : scrape_astrobin.py --incremental --check-r2 --no-sync. Seuls les médias absents
 *     de R2 sont téléchargés. Un scrape incomplet arrête tout.
 *  2. Importer le CSV, le HTML et les nouveaux médias ; faire suivre les clés de alt.json des photos dont
 *     l'année a changé (les fichiers de la nouvelle année viennent du scrape) ; alts manquants.
 *  3. Miniatures, fiches techniques et descriptions Wikipedia, versions web en local (temp/web-images/),
 *     dimensions. Un échec arrête tout avant le moindre envoi.
 *  4. Envoyer les fichiers nouveaux ou modifiés sous incoming/astro/<run>/ (scripts/lib/r2-staging.mjs),
 *     puis, si tout est envoyé, les copier vers leurs clés définitives et vider ce préfixe.
 *  5. Ajouter au manifeste web-images.json les nouvelles versions web (sans jamais en retirer), purger le
 *     cache du worker pour les images remplacées, puis contrôler sur R2 qu'aucune photo n'a perdu son raw
 *     ou sa miniature.
 * Le commit des fichiers de data/ et src/data/ est fait par le workflow, seulement si le code de sortie est 0.
 *
 * Effet distant : R2 (écriture sous astrophotographies/ et web/, plus incoming/astro/ en --ci ;
 * R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME obligatoires) et Wikipedia ;
 * en --ci, aussi AstroBin (lecture) et la purge du cache du worker (IMAGE_WORKER_URL et
 * IMAGE_WORKER_PURGE_KEY, facultatives : sans elles, les images remplacées sont seulement listées).
 * Effet local : src/assets/astrophotographies/, data/ et src/data/ (à committer ensuite).
 *
 * Options disponibles (toute autre option est refusée, code de sortie 1) :
 *   --dry-run : Simule : rien n'est écrit, ni en local ni sur R2 (R2 est seulement interrogé). Les
 *               étapes sans simulation (miniatures, SEO, dimensions) sont signalées et sautées.
 *   --ci      : Mode GitHub Actions décrit ci-dessus. Incompatible avec --dry-run.
 *
 * Variables d'environnement :
 *   ASTROBIN_DIR : dossier du dépôt astrobin (défaut : ../astrobin). S'il manque, les imports sont sautés
 *                  (en --ci : arrêt, code 1).
 *   PYTHON       : interpréteur du scrape en --ci (défaut : python3).
 *   GITHUB_RUN_ID, GITHUB_RUN_ATTEMPT : nomment le préfixe temporaire en --ci (sinon, la date).
 *
 * Exemples d'utilisation :
 *   node scripts/pipeline/update-photos.mjs --dry-run
 *   node scripts/pipeline/update-photos.mjs
 *   ASTROBIN_DIR=../astrobin node scripts/pipeline/update-photos.mjs --ci   # GitHub Actions
 */

import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import { planAstroAlts } from '../lib/alt-coverage.mjs';
import {
    findIncompletePhotos,
    findIncompletePhotosWith,
    needsCopy,
    planAltYearMigration,
    planAstrobinImport,
} from '../lib/astrobin-import.mjs';
import { parseCliArgs } from '../lib/args.mjs';
import { PROJECT_ROOT, loadEnv } from '../lib/env.mjs';
import { exitIfStopped, isStopRequested, runCommand, runScript, runSteps } from '../lib/pipeline-runner.mjs';
import { createR2Client, requireR2Config } from '../lib/r2.mjs';
import {
    astroStagingPrefix,
    deleteStagedFiles,
    headObject,
    listFilesWithKeys,
    promoteStagedFiles,
    stageFiles,
} from '../lib/r2-staging.mjs';
import { purgeImageKeys } from '../lib/worker-cache.mjs';
import { getDisplayWidth, listWebImageSources } from '../../src/lib/admin/web-image-sources.mjs';
import { planWebImageWidths, webImageKey } from '../../src/utils/webImages.mjs';

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
 * Étapes du mode --ci, toutes locales : les envois sur R2 sont faits ensuite, en deux temps.
 *
 * WARNING: generate-web-images.mjs sans --upload, toujours. Avec --upload, il reconstruirait la partie
 * astro de web-images.json depuis le disque, qui ne contient en CI que les nouvelles photos : toutes les
 * autres perdraient leurs versions web.
 */
const CI_SCRIPT_STEPS = [
    { label: 'Miniatures', args: ['scripts/pipeline/generate-mini.mjs', '--only=astro'] },
    { label: 'Fiches techniques (Wikipedia)', args: ['scripts/seo/astro-details.mjs'] },
    { label: 'Descriptions Wikipedia', args: ['scripts/seo/wiki-descriptions.js'] },
    { label: 'Versions web (locales)', args: ['scripts/build/generate-web-images.mjs', '--only=astro'] },
    { label: "Dimensions d'images", args: ['scripts/build/compute-image-dimensions.mjs', '--only=astro'] },
];

const WEB_IMAGES_OUTPUT_ROOT = path.join(PROJECT_ROOT, 'temp/web-images');
const WEB_IMAGES_MANIFEST_PATH = path.join(PROJECT_ROOT, 'src/data/web-images.json');
const R2_CHECK_CONCURRENCY = 8;

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
 * Arrête le mode --ci avec le code 1.
 *
 * @param {string} message - Cause de l'arrêt.
 * @returns {never}
 */
function failCi(message) {
    console.error(`\n❌ ${message}`);
    console.error('Rien ne doit être committé : le workflow ne committe que sur un code de sortie 0.');
    process.exit(1);
}

/**
 * Identifiant du run, qui nomme le préfixe temporaire sur R2.
 *
 * @returns {string} `<GITHUB_RUN_ID>-<GITHUB_RUN_ATTEMPT>` en GitHub Actions, sinon la date.
 */
function getCiRunId() {
    if (process.env.GITHUB_RUN_ID) return `${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT || '1'}`;
    return new Date().toISOString().replace(/[:.]/g, '-');
}

/**
 * Fait suivre les clés de alt.json des photos dont l'année a changé dans le CSV.
 *
 * @param {Record<string, string>[]} previousRows - Lignes du CSV avant import.
 * @returns {void}
 */
function migrateAltYears(previousRows) {
    const altPath = path.join(PROJECT_ROOT, 'src/data/alt.json');
    const altText = fs.readFileSync(altPath, 'utf8');
    const altData = JSON.parse(altText);
    const renames = planAltYearMigration(previousRows, readCsvRows(), altData);
    for (const [oldKey, newKey] of renames) {
        altData[newKey] = altData[oldKey];
        delete altData[oldKey];
        console.log(`Alt déplacé : ${oldKey} → ${newKey}`);
    }
    console.log(`${renames.length} alt(s) déplacé(s).`);
    if (renames.length === 0) return;
    const ending = altText.endsWith('\n') ? '\n' : '';
    fs.writeFileSync(altPath, JSON.stringify(altData, null, 2) + ending);
}

/**
 * Ajoute à web-images.json les versions web de cette exécution, toutes présentes sur R2.
 *
 * POURQUOI ajouter sans jamais retirer : en CI, le disque ne contient que les nouvelles photos ; les
 * entrées des autres doivent rester telles quelles.
 *
 * @param {Set<string>} keysOnR2 - Clés présentes sur R2 après la copie (copiées ou déjà identiques).
 * @returns {Promise<number>} Le nombre d'entrées ajoutées ou mises à jour.
 */
async function addWebImageEntries(keysOnR2) {
    const manifest = JSON.parse(fs.readFileSync(WEB_IMAGES_MANIFEST_PATH, 'utf8'));
    let changedCount = 0;
    for (const { key, path: sourcePath } of listWebImageSources(path.join(PROJECT_ROOT, 'src/assets'), ['astro'])) {
        const widths = planWebImageWidths(await getDisplayWidth(sourcePath));
        if (widths.length === 0 || !widths.every((width) => keysOnR2.has(webImageKey(key, width)))) continue;
        if (JSON.stringify(manifest[key]) === JSON.stringify(widths)) continue;
        manifest[key] = widths;
        changedCount++;
    }
    if (changedCount > 0) {
        const sorted = Object.fromEntries(
            Object.keys(manifest)
                .sort()
                .map((key) => [key, manifest[key]]),
        );
        fs.writeFileSync(WEB_IMAGES_MANIFEST_PATH, `${JSON.stringify(sorted, null, 2)}\n`);
    }
    return changedCount;
}

/**
 * Limite le nombre d'appels simultanés d'une fonction asynchrone.
 *
 * @param {(...args: A) => Promise<R>} fn - Fonction à limiter.
 * @param {number} limit - Appels simultanés au plus.
 * @returns {(...args: A) => Promise<R>} La fonction limitée.
 * @template A, R
 */
function limitConcurrency(fn, limit) {
    let active = 0;
    const queue = [];
    const next = () => {
        if (active >= limit || queue.length === 0) return;
        active++;
        const { args, resolve, reject } = queue.shift();
        fn(...args)
            .then(resolve, reject)
            .finally(() => {
                active--;
                next();
            });
    };
    return (...args) =>
        new Promise((resolve, reject) => {
            queue.push({ args, resolve, reject });
            next();
        });
}

/**
 * Mode --ci : scrape, traitements locaux, envoi sur R2 en deux temps, manifeste et contrôle final.
 *
 * @returns {Promise<void>} Se termine par process.exit(1) en cas d'échec.
 */
async function runCiPipeline() {
    // POURQUOI : vérifier R2 avant le scrape, pour ne pas découvrir un secret manquant après 6 minutes.
    const r2Config = requireR2Config();
    const s3 = createR2Client(r2Config);
    const bucket = r2Config.bucketName;
    if (!fs.existsSync(path.join(ASTROBIN_DIR, 'scrape_astrobin.py'))) {
        failCi(`scrape_astrobin.py introuvable dans ${ASTROBIN_DIR} (voir ASTROBIN_DIR).`);
    }

    console.log('\n=== Scrape AstroBin (nouvelles photos seulement) ===');
    const scrapeArgs = [path.join(ASTROBIN_DIR, 'scrape_astrobin.py'), '--incremental', '--check-r2', '--no-sync'];
    if ((await runCommand(process.env.PYTHON || 'python3', scrapeArgs, ASTROBIN_DIR)) !== 0) {
        exitIfStopped();
        failCi('Scrape en échec ou incomplet : arrêt avant tout import.');
    }

    console.log(`\n=== Import du CSV depuis ${ASTROBIN_DIR} ===`);
    const previousRows = readCsvRows();
    importDataFiles(false);

    console.log('\n=== Années modifiées dans le CSV (alts) ===');
    migrateAltYears(previousRows);

    console.log('\n=== Import des nouveaux raws, annotations et skyplots ===');
    importImages(false);

    console.log('\n=== Textes alternatifs (depuis le CSV) ===');
    fillAstroAlts(false);

    const failures = await runSteps(CI_SCRIPT_STEPS, false);
    exitIfStopped();
    if (failures.length > 0) failCi(`Étapes en échec : ${failures.join(' ; ')}. Rien n'a été envoyé sur R2.`);

    const runPrefix = astroStagingPrefix(getCiRunId());
    const files = [
        ...listFilesWithKeys(path.join(PROJECT_ROOT, 'src/assets'), 'astrophotographies'),
        ...listFilesWithKeys(WEB_IMAGES_OUTPUT_ROOT, 'web/astrophotographies'),
    ];
    console.log(`\n=== Envoi sous ${runPrefix} (${files.length} fichier(s) locaux) ===`);
    const staging = await stageFiles({ s3, bucket, files, prefix: runPrefix });
    console.log(`${staging.staged.length} envoyé(s), ${staging.unchanged.length} déjà identique(s) sur R2.`);
    if (staging.errors.length > 0) {
        staging.errors.forEach((line) => console.error(`❌ ${line}`));
        await deleteStagedFiles({ s3, bucket, staged: staging.staged });
        failCi(`${staging.errors.length} envoi(s) en échec : rien n'a été copié vers la production.`);
    }
    exitIfStopped();

    console.log('\n=== Copie vers les clés définitives ===');
    const promotion = await promoteStagedFiles({ s3, bucket, staged: staging.staged });
    console.log(`${promotion.promoted.length} fichier(s) copié(s).`);
    if (promotion.errors.length > 0) {
        promotion.errors.forEach((line) => console.error(`❌ ${line}`));
        // POURQUOI : le préfixe temporaire est gardé, pour rejouer ou examiner la copie ratée.
        failCi(`${promotion.errors.length} copie(s) en échec. Fichiers temporaires gardés sous ${runPrefix}.`);
    }
    const cleanupErrors = await deleteStagedFiles({ s3, bucket, staged: staging.staged });
    if (cleanupErrors.length > 0) console.warn(`⚠️  Ménage de ${runPrefix} incomplet : ${cleanupErrors.join(' ; ')}`);

    console.log('\n=== Manifeste des versions web ===');
    const keysOnR2 = new Set([...promotion.promoted, ...staging.unchanged]);
    console.log(`${await addWebImageEntries(keysOnR2)} entrée(s) ajoutée(s) à src/data/web-images.json.`);

    const replacedImages = staging.staged
        .filter(({ isReplacement, key }) => isReplacement && /^astrophotographies\/.*\.(jpe?g|png|webp)$/i.test(key))
        .map(({ key }) => key);
    if (replacedImages.length > 0) {
        console.log(`\n=== Images remplacées (${replacedImages.length}) : cache du worker ===`);
        replacedImages.forEach((key) => console.log(`   ${key}`));
        const { IMAGE_WORKER_URL: workerUrl, IMAGE_WORKER_PURGE_KEY: purgeKey } = process.env;
        if (workerUrl && purgeKey) {
            const failedCount = await purgeImageKeys(replacedImages, { workerUrl, purgeKey });
            if (failedCount > 0)
                console.warn(`⚠️  ${failedCount} purge(s) en échec : l'ancienne version peut rester en cache.`);
        } else {
            console.warn('⚠️  IMAGE_WORKER_URL ou IMAGE_WORKER_PURGE_KEY absent : cache non purgé.');
        }
    }

    console.log('\n=== Bilan (vérifié sur R2) ===');
    const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, relativePath), 'utf8'));
    const existsOnR2 = limitConcurrency(
        async (key) => Boolean(await headObject(s3, bucket, `astrophotographies/${key}`)),
        R2_CHECK_CONCURRENCY,
    );
    const incomplete = await findIncompletePhotosWith(
        readCsvRows(),
        existsOnR2,
        readJson('src/data/alt.json'),
        readJson('src/data/seo.json'),
    );
    for (const { id, title, missing } of incomplete)
        console.warn(`⚠️  ${id} (${title}) : manque ${missing.join(', ')}`);
    if (incomplete.length === 0) console.log('✅ Toutes les photos du CSV sont complètes.');
    if (incomplete.some(({ missing }) => missing.includes('seo'))) {
        console.warn('Descriptions SEO à écrire via Claude Code : /generate-seo astro');
    }
    const brokenCount = incomplete.filter(({ missing }) => missing.includes('raw') || missing.includes('mini')).length;
    if (brokenCount > 0) failCi(`${brokenCount} photo(s) sans raw ou sans miniature sur R2.`);
    console.log('\nPipeline CI terminé avec succès.');
}

/**
 * Enchaîne les étapes.
 *
 * @returns {Promise<void>}
 */
async function main() {
    let parsed;
    try {
        parsed = parseCliArgs(process.argv.slice(2), { flags: { dryRun: ['--dry-run'], ci: ['--ci'] } });
    } catch (error) {
        console.error(`❌ ${error.message}`);
        process.exit(1);
    }
    const { dryRun, ci } = parsed.flags;
    if (parsed.positionals.length > 0) {
        console.error('❌ Ce script ne prend aucun argument positionnel.');
        process.exit(1);
    }
    if (ci && dryRun) {
        console.error('❌ --ci et --dry-run sont incompatibles.');
        process.exit(1);
    }
    if (ci) {
        await runCiPipeline();
        return;
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
