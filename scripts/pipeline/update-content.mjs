/**
 * Mise à jour du blog ou des voyages (boutons « Mettre à jour » de /admin/blog et /admin/voyages)
 *
 * Responsabilité principale : pour un seul domaine, dans l'ordre :
 *  1. Blog : temps de lecture manquants (scripts/seo/blog-metadata.js).
 *  2. Envoyer sur R2 ce qui est absent ou modifié sous <domaine>/ (--changed, jamais de suppression).
 *  3. Recalculer src/data/image-dimensions.json (compute-image-dimensions.mjs --only=<domaine>).
 *  4. Générer et envoyer les versions web manquantes (generate-web-images.mjs --only=<domaine> --upload).
 *  5. Signaler les alts et les descriptions SEO manquants.
 *
 * POURQUOI ne pas générer ces textes : sans le récit, un modèle se trompe de lieu ou de sujet. Ils s'écrivent
 * via Claude Code, avec les commandes /generate-alts et /generate-seo.
 *
 * Tous les traitements sont incrémentaux : un second lancement ne refait que ce qui manque. L'échec
 * d'une étape n'empêche pas les suivantes, mais donne le code de sortie 1.
 *
 * Effet distant : R2 (écriture sous <domaine>/ et web/, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
 * R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME obligatoires).
 * Effet local : src/data/ (à committer ensuite).
 *
 * Options disponibles (toute autre option est refusée, code de sortie 1) :
 *   --scope=blog|voyages : domaine à traiter (obligatoire).
 *   --dry-run            : Simule : rien n'est écrit, ni en local ni sur R2 (R2 est seulement interrogé).
 *                          Les étapes sans simulation (temps de lecture, dimensions) sont signalées et sautées.
 *
 * Exemples d'utilisation :
 *   node scripts/pipeline/update-content.mjs --scope=blog --dry-run
 *   node scripts/pipeline/update-content.mjs --scope=voyages
 */

import { getContentGaps } from '../../src/lib/admin/content-gaps.mjs';
import { parseCliArgs } from '../lib/args.mjs';
import { PROJECT_ROOT, loadEnv } from '../lib/env.mjs';
import { exitIfStopped, runSteps } from '../lib/pipeline-runner.mjs';

loadEnv();

const SCOPES = ['blog', 'voyages'];

/**
 * Construit les étapes d'un domaine.
 *
 * @param {'blog' | 'voyages'} scope - Domaine à traiter.
 * @returns {{ label: string, args: string[], dryRunArgs?: string[] }[]} Les étapes.
 */
function buildSteps(scope) {
    const uploadArgs = ['scripts/r2/upload_local_to_r2.js', scope, '--changed'];
    return [
        ...(scope === 'blog' ? [{ label: 'Temps de lecture', args: ['scripts/seo/blog-metadata.js'] }] : []),
        { label: 'Envoi sur R2', args: uploadArgs, dryRunArgs: [...uploadArgs, '--dry-run'] },
        { label: "Dimensions d'images", args: ['scripts/build/compute-image-dimensions.mjs', `--only=${scope}`] },
        {
            label: 'Versions web sur R2',
            args: ['scripts/build/generate-web-images.mjs', `--only=${scope}`, '--upload'],
            dryRunArgs: ['scripts/build/generate-web-images.mjs', `--only=${scope}`, '--dry-run'],
        },
    ];
}

/**
 * Signale les textes à écrire via Claude Code.
 *
 * @param {'blog' | 'voyages'} scope - Domaine à traiter.
 * @returns {void}
 */
function reportGaps(scope) {
    const { missingAltCount, missingAltsByEntry, missingSeo } = getContentGaps(scope, PROJECT_ROOT);
    for (const [entry, count] of Object.entries(missingAltsByEntry)) {
        console.warn(`⚠️  ${entry} : ${count} image(s) sans alt`);
    }
    for (const entry of missingSeo) console.warn(`⚠️  ${entry} : description SEO manquante`);
    if (missingAltCount > 0) console.warn(`À écrire via Claude Code : /generate-alts ${scope}`);
    if (missingSeo.length > 0) console.warn(`À écrire via Claude Code : /generate-seo ${scope}`);
    if (missingAltCount === 0 && missingSeo.length === 0) console.log('✅ Aucun alt ni description SEO manquant.');
}

/**
 * Enchaîne les étapes.
 *
 * @returns {Promise<void>}
 */
async function main() {
    const { flags, values, positionals } = parseCliArgs(process.argv.slice(2), {
        flags: { dryRun: ['--dry-run'] },
        valueOptions: ['--scope'],
    });
    const scope = values['--scope'];
    if (positionals.length > 0 || !SCOPES.includes(scope)) {
        throw new Error('Usage : update-content.mjs --scope=blog|voyages [--dry-run]');
    }

    const failures = await runSteps(buildSteps(scope), flags.dryRun);
    exitIfStopped();

    console.log('\n=== Textes à écrire ===');
    reportGaps(scope);

    if (failures.length > 0) {
        console.error(`\n❌ Étapes en échec : ${failures.join(' ; ')}`);
        process.exit(1);
    }
    const filesToCommit = ['src/data/image-dimensions.json', 'src/data/web-images.json'];
    if (scope === 'blog') filesToCommit.unshift('src/data/blog.json');
    console.log(`\nÀ committer ensuite s'ils ont changé :\n${filesToCommit.map((file) => `  ${file}`).join('\n')}`);
    console.log('\nPipeline terminé avec succès.');
}

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
