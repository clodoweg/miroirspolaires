/**
 * Redessine les calques d'annotations des astrophotos (bouton « Redessiner les annotations » de
 * /admin/astrophotos/importer), sans retélécharger les photos.
 *
 * Responsabilité principale, dans l'ordre :
 *  1. Lire sur R2 l'origine de chaque calque `astrophotographies/annotations/<année>/<id>_annotation.svg`
 *     (début du fichier, `classifyAnnotationSvg`) et retenir les photos du CSV dont le calque est absent ou
 *     ne vient pas d'annotate_astro.py (toutes avec --all).
 *  2. Lancer `annotate_astro.py --from-dimensions --force --ids=…` dans le dépôt astrobin : le WCS vient de la
 *     résolution d'AstroBin sur nova.astrometry.net, les dimensions de src/data/image-dimensions.json.
 *  3. Ajouter son rapport à src/data/annotation-runs.json (historique affiché dans la liste des astrophotos).
 *  4. Envoyer les SVG produits sur R2 en deux temps (préfixe temporaire incoming/astro/, puis clés définitives)
 *     et purger le CDN de R2 des calques remplacés.
 *
 * Une photo en échec ou ignorée (pas de solution, proportions différentes de l'image du site) n'arrête pas le
 * job : elle garde son calque actuel et apparaît dans l'historique. Seul un échec général (R2, script Python
 * sans rapport) donne le code de sortie 1, et alors rien n'est committé.
 *
 * Effet distant : R2 (écriture sous astrophotographies/annotations/ et incoming/astro/ ; R2_ACCOUNT_ID,
 * R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME obligatoires), purge du CDN de R2 (CLOUDFLARE_ZONE_ID,
 * CLOUDFLARE_API_TOKEN, PUBLIC_R2_URL, facultatives), nova.astrometry.net en lecture.
 * Effet local : src/data/annotation-runs.json (committé par le workflow) et le dossier
 * astrophotographies/annotations/ du dépôt astrobin.
 *
 * Options disponibles (toute autre option est refusée, code de sortie 1) :
 *   --all     : Redessine toutes les photos, même celles dont le calque vient déjà d'annotate_astro.py.
 *   --dry-run : Liste les photos à redessiner sans rien dessiner, écrire ni envoyer (R2 est seulement lu).
 *
 * Variables d'environnement :
 *   ASTROBIN_DIR : dossier du dépôt astrobin (défaut : ../astrobin).
 *   PYTHON       : interpréteur d'annotate_astro.py (défaut : python3).
 *   GITHUB_RUN_ID, GITHUB_RUN_ATTEMPT : nomment le préfixe temporaire (sinon, la date).
 *
 * Exemples d'utilisation :
 *   node scripts/pipeline/update-annotations.mjs --dry-run
 *   ASTROBIN_DIR=_astrobin node scripts/pipeline/update-annotations.mjs          # GitHub Actions
 *   ASTROBIN_DIR=_astrobin node scripts/pipeline/update-annotations.mjs --all    # tout redessiner
 */

import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import { GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { importAnnotationReportFile, planAnnotationTargets } from '../lib/annotation-runs.mjs';
import { parseCliArgs } from '../lib/args.mjs';
import { purgeCdnKeys } from '../lib/cdn-cache.mjs';
import { PROJECT_ROOT, loadEnv } from '../lib/env.mjs';
import { exitIfStopped, runCommand } from '../lib/pipeline-runner.mjs';
import { createR2Client, requireR2Config } from '../lib/r2.mjs';
import {
    astroStagingPrefix,
    deleteStagedFiles,
    listFilesWithKeys,
    promoteStagedFiles,
    stageFiles,
} from '../lib/r2-staging.mjs';
import { ANNOTATION_HEAD_BYTES, classifyAnnotationSvg } from '../../src/lib/admin/annotation-source.ts';

loadEnv();

const ASTROBIN_DIR = path.resolve(PROJECT_ROOT, process.env.ASTROBIN_DIR ?? '../astrobin');
const CSV_PATH = path.join(PROJECT_ROOT, 'data/astrobin_clodoweg_gallery_python.csv');
const ANNOTATIONS_PREFIX = 'astrophotographies/annotations/';
const READ_CONCURRENCY = 12;

function fail(message) {
    console.error(`\n❌ ${message}`);
    console.error('Rien ne doit être committé : le workflow ne committe que sur un code de sortie 0.');
    process.exit(1);
}

/**
 * Origine de chaque calque présent sur R2, lue en tête de fichier.
 *
 * @param {import('@aws-sdk/client-s3').S3Client} s3 - Client R2.
 * @param {string} bucket - Bucket.
 * @returns {Promise<Map<string, string>>} L'origine (`miroirs`, `astrobin`…) par clé.
 */
async function readAnnotationKinds(s3, bucket) {
    const keys = [];
    let continuationToken;
    do {
        const page = await s3.send(
            new ListObjectsV2Command({
                Bucket: bucket,
                Prefix: ANNOTATIONS_PREFIX,
                ContinuationToken: continuationToken,
            }),
        );
        for (const object of page.Contents ?? []) if (object.Key?.endsWith('.svg')) keys.push(object.Key);
        continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (continuationToken);

    const kinds = new Map();
    let next = 0;
    const worker = async () => {
        while (next < keys.length) {
            const key = keys[next++];
            try {
                const object = await s3.send(
                    new GetObjectCommand({ Bucket: bucket, Key: key, Range: `bytes=0-${ANNOTATION_HEAD_BYTES - 1}` }),
                );
                kinds.set(key, classifyAnnotationSvg((await object.Body?.transformToString('utf-8')) ?? '').kind);
            } catch (error) {
                // POURQUOI : un calque illisible est traité comme à refaire, sans arrêter le job.
                console.warn(`⚠️  Lecture impossible : ${key} (${error.message})`);
            }
        }
    };
    await Promise.all(Array.from({ length: Math.min(READ_CONCURRENCY, keys.length) }, worker));
    return kinds;
}

async function main() {
    let parsed;
    try {
        parsed = parseCliArgs(process.argv.slice(2), { flags: { all: ['--all'], dryRun: ['--dry-run'] } });
    } catch (error) {
        console.error(`❌ ${error.message}`);
        process.exit(1);
    }
    if (parsed.positionals.length > 0) fail('Ce script ne prend aucun argument positionnel.');
    const { all, dryRun } = parsed.flags;
    if (!fs.existsSync(path.join(ASTROBIN_DIR, 'annotate_astro.py'))) {
        fail(`annotate_astro.py introuvable dans ${ASTROBIN_DIR} (voir ASTROBIN_DIR).`);
    }

    const r2Config = requireR2Config();
    const s3 = createR2Client(r2Config);
    const bucket = r2Config.bucketName;

    console.log('=== Origine des calques sur R2 ===');
    const kinds = await readAnnotationKinds(s3, bucket);
    const counts = {};
    for (const kind of kinds.values()) counts[kind] = (counts[kind] ?? 0) + 1;
    console.log(`${kinds.size} calque(s) : ${JSON.stringify(counts)}`);

    const rows = Papa.parse(fs.readFileSync(CSV_PATH, 'utf8'), { header: true, skipEmptyLines: true }).data;
    const targets = planAnnotationTargets(rows, kinds, { all });
    console.log(`\n=== ${targets.length} photo(s) à redessiner${all ? ' (--all)' : ''} ===`);
    if (targets.length > 0) console.log(targets.join(', '));
    if (targets.length === 0) return;

    const reportPath = path.join(ASTROBIN_DIR, 'annotations-report.json');
    // POURQUOI : un rapport d'un passage précédent serait repris à tort si le script Python s'arrêtait avant d'écrire.
    fs.rmSync(reportPath, { force: true });
    // POURQUOI : annotate_astro.py lit les catalogues, la police et image-dimensions.json de ce dépôt-ci.
    process.env.MIROIRSPOLAIRES_DIR = PROJECT_ROOT;
    const annotateArgs = ['annotate_astro.py', '--from-dimensions', '--force', `--ids=${targets.join(',')}`];
    if (dryRun) annotateArgs.push('--dry-run');

    console.log('\n=== Dessin des calques (annotate_astro.py) ===');
    const exitCode = await runCommand(process.env.PYTHON || 'python3', annotateArgs, ASTROBIN_DIR);
    exitIfStopped();
    if (dryRun) return;
    if (!fs.existsSync(reportPath)) fail(`annotate_astro.py s’est arrêté sans rapport (code ${exitCode}).`);
    if (exitCode !== 0) console.warn('⚠️  Certaines photos sont en échec : elles gardent leur calque actuel.');

    console.log('\n=== Historique des annotations ===');
    importAnnotationReportFile({
        reportPath,
        historyPath: path.join(PROJECT_ROOT, 'src/data/annotation-runs.json'),
    });

    const targetSet = new Set(targets);
    const files = listFilesWithKeys(ASTROBIN_DIR, ANNOTATIONS_PREFIX).filter((file) => {
        const id = /\/(\d+)_annotation\.svg$/.exec(file.key)?.[1];
        return id !== undefined && targetSet.has(id);
    });
    const runId = process.env.GITHUB_RUN_ID
        ? `${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT || '1'}`
        : new Date().toISOString().replace(/[:.]/g, '-');
    const runPrefix = astroStagingPrefix(runId);
    console.log(`\n=== Envoi sous ${runPrefix} (${files.length} calque(s)) ===`);
    const staging = await stageFiles({ s3, bucket, files, prefix: runPrefix });
    console.log(`${staging.staged.length} envoyé(s), ${staging.unchanged.length} déjà identique(s) sur R2.`);
    if (staging.errors.length > 0) {
        staging.errors.forEach((line) => console.error(`❌ ${line}`));
        await deleteStagedFiles({ s3, bucket, staged: staging.staged });
        fail(`${staging.errors.length} envoi(s) en échec : rien n'a été copié vers la production.`);
    }

    console.log('\n=== Copie vers les clés définitives ===');
    const promotion = await promoteStagedFiles({ s3, bucket, staged: staging.staged });
    console.log(`${promotion.promoted.length} calque(s) copié(s).`);
    if (promotion.errors.length > 0) {
        promotion.errors.forEach((line) => console.error(`❌ ${line}`));
        fail(`${promotion.errors.length} copie(s) en échec. Fichiers temporaires gardés sous ${runPrefix}.`);
    }
    const cleanupErrors = await deleteStagedFiles({ s3, bucket, staged: staging.staged });
    if (cleanupErrors.length > 0) console.warn(`⚠️  Ménage de ${runPrefix} incomplet : ${cleanupErrors.join(' ; ')}`);

    // POURQUOI : le domaine public de R2 sert les calques ; un calque remplacé doit quitter le cache du CDN.
    const replacedKeys = staging.staged.filter(({ isReplacement }) => isReplacement).map(({ key }) => key);
    if (replacedKeys.length > 0) {
        const cdn = await purgeCdnKeys(replacedKeys);
        if (cdn.skippedReason) {
            console.warn('⚠️  CLOUDFLARE_ZONE_ID, CLOUDFLARE_API_TOKEN ou PUBLIC_R2_URL absent : CDN de R2 non purgé.');
        } else {
            console.log(
                `🧹 CDN de R2 : ${cdn.urlCount} URL purgée(s)${cdn.failedCount ? `, ${cdn.failedCount} échec(s)` : ''}.`,
            );
        }
    }
    console.log('\n✅ Calques à jour. La liste des astrophotos de l’admin montre le résultat photo par photo.');
}

main().catch((error) => fail(error.stack ?? String(error)));
