/**
 * Enchaînement des étapes des pipelines de mise à jour
 *
 * Responsabilité : lancer des scripts Node l'un après l'autre à la racine du dépôt, relever ceux qui
 * échouent et relayer l'arrêt demandé par l'admin. Utilisé par `scripts/pipeline/update-photos.mjs` et
 * `scripts/pipeline/update-content.mjs`.
 *
 * Ce module n'est pas une CLI. L'importer installe les gestionnaires de SIGTERM et SIGINT.
 */

import { spawn } from 'node:child_process';
import { PROJECT_ROOT } from './env.mjs';

let currentChild = null;
let isStopping = false;

// WARNING: le bouton « Arrêter » de l'admin tue le pipeline (SIGTERM). Sans relais, l'enfant en cours
// continuerait seul à écrire sur R2.
for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => {
        isStopping = true;
        currentChild?.kill('SIGTERM');
    });
}

/**
 * Indique si un arrêt a été demandé.
 *
 * @returns {boolean} `true` après un SIGTERM ou un SIGINT.
 */
export function isStopRequested() {
    return isStopping;
}

/**
 * Lance un script Node à la racine du dépôt, sa sortie étant celle de ce processus.
 *
 * @param {string[]} args - Chemin du script et arguments.
 * @returns {Promise<number>} Le code de sortie (1 si le processus n'a pas pu démarrer ou a été tué).
 */
export function runScript(args) {
    return new Promise((resolve) => {
        currentChild = spawn(process.execPath, args, { cwd: PROJECT_ROOT, stdio: 'inherit' });
        currentChild.on('error', (error) => {
            console.error(`❌ ${error.message}`);
            resolve(1);
        });
        currentChild.on('close', (code) => resolve(code ?? 1));
    });
}

/**
 * Lance des étapes dans l'ordre. L'échec de l'une n'empêche pas les suivantes.
 *
 * @param {{ label: string, args: string[], dryRunArgs?: string[] }[]} steps - Étapes ; `dryRunArgs` absent :
 *   le script n'a pas de simulation, l'étape est sautée en `dryRun`.
 * @param {boolean} dryRun - Mode simulation.
 * @returns {Promise<string[]>} Les libellés des étapes en échec.
 */
export async function runSteps(steps, dryRun) {
    const failures = [];
    for (const { label, args, dryRunArgs } of steps) {
        if (isStopping) break;
        console.log(`\n=== ${label} ===`);
        const stepArgs = dryRun ? dryRunArgs : args;
        if (!stepArgs) {
            console.log('[dry-run] Étape sautée : ce script n’a pas de simulation.');
            continue;
        }
        if ((await runScript(stepArgs)) !== 0 && !isStopping) failures.push(label);
    }
    return failures;
}

/**
 * Termine le processus avec le code 1 si un arrêt a été demandé.
 *
 * @returns {void}
 */
export function exitIfStopped() {
    if (!isStopping) return;
    console.error('\n⛔ Mise à jour interrompue.');
    process.exit(1);
}
