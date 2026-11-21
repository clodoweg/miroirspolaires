/**
 * Exécution d'un job de l'admin distant dans GitHub Actions (`.github/workflows/admin-job.yml`)
 *
 * Responsabilité principale :
 * - Mode exécution : vérifier que le job existe dans Turso et correspond au script demandé, que le
 *   script est marqué `remote` dans `SCRIPTS` (`src/lib/admin/scripts.ts`), le lancer avec ses arguments
 *   figés, envoyer sa sortie dans `admin_job_logs` par lots (une seconde), puis enregistrer le code de
 *   sortie et l'état du job (`admin_jobs`).
 * - Mode clôture (`--finalize`, étape `if: always()` du workflow) : enregistrer le commit produit, et
 *   marquer le job en échec ou annulé si le workflow n'a pas abouti (échec de `npm ci`, du commit,
 *   annulation depuis l'admin).
 *
 * WARNING: sécurité. Aucun argument libre n'est transmis au script : seul `--script` choisit une entrée
 * de la liste blanche, dont la commande et les arguments sont figés dans `SCRIPTS`.
 *
 * Effet distant : Turso (tables `admin_jobs` et `admin_job_logs`), plus ce que fait le script lancé.
 *
 * Options disponibles (toute autre option est refusée, code de sortie 1) :
 *   --job=<id>                  : identifiant du job créé par l'admin (obligatoire).
 *   --script=<id>               : entrée de `SCRIPTS` à lancer (mode exécution).
 *   --finalize                  : mode clôture.
 *   --outcome=<success|failure|cancelled> : résultat du workflow (mode clôture).
 *   --commit=<sha>              : commit poussé sur la branche de contenu, s'il y en a un (mode clôture).
 *
 * Variables d'environnement : TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, GITHUB_RUN_ID (fourni par Actions).
 *
 * Exemples d'utilisation :
 *   node scripts/admin/run-admin-job.mjs --job=1b2c… --script=update-exoplanets
 *   node scripts/admin/run-admin-job.mjs --finalize --job=1b2c… --outcome=success --commit=abc123…
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PROJECT_ROOT } from '../lib/env.mjs';
import { parseCliArgs } from '../lib/args.mjs';
import { appendJobLogs, getJob, TERMINAL_JOB_STATUSES, updateJob } from '../../src/lib/admin/job-store.mjs';

const FLUSH_INTERVAL_MS = 1000;

/**
 * @typedef {import('../../src/lib/admin/job-store.mjs').JobDatabase} JobDatabase
 */

/**
 * Lance le script d'un job et journalise sa sortie.
 *
 * @param {Object} options
 * @param {string} options.jobId - Identifiant du job.
 * @param {string} options.scriptId - Script demandé par le workflow.
 * @param {JobDatabase} options.database - Client libSQL.
 * @param {(id: string) => { id: string, command: string, args: string[], remote?: boolean } | undefined} options.getScript - Registre des scripts.
 * @param {typeof spawn} [options.spawnImpl] - `spawn` injectable (tests).
 * @param {() => string} [options.now] - Horloge ISO injectable (tests).
 * @param {string | null} [options.runId] - Identifiant du run GitHub Actions.
 * @param {number} [options.flushIntervalMs] - Intervalle d'envoi des lignes.
 * @returns {Promise<number>} Le code de sortie du script (1 si le job est refusé).
 */
export async function runAdminJob({
    jobId,
    scriptId,
    database,
    getScript,
    spawnImpl = spawn,
    now = () => new Date().toISOString(),
    runId = null,
    flushIntervalMs = FLUSH_INTERVAL_MS,
}) {
    const job = await getJob(database, jobId);
    if (!job) throw new Error(`Job inconnu : ${jobId}`);
    // POURQUOI : un job annulé depuis l'admin avant le démarrage du run ne doit jamais s'exécuter.
    if (job.status !== 'queued') {
        console.log(`Job ${jobId} déjà ${job.status} : rien à lancer.`);
        return job.status === 'cancelled' ? 0 : 1;
    }
    const script = getScript(scriptId);
    if (job.scriptId !== scriptId || !script || script.remote !== true) {
        await appendJobLogs(database, jobId, [
            { at: now(), stream: 'system', line: `Script refusé : ${scriptId} n'est pas lançable à distance.` },
        ]);
        await updateJob(database, jobId, { status: 'failed', finishedAt: now(), exitCode: 1, runId });
        return 1;
    }

    await updateJob(database, jobId, { status: 'running', startedAt: now(), runId });
    /** @type {{ at: string, stream: string, line: string }[]} */
    let pending = [{ at: now(), stream: 'system', line: `$ ${script.command} ${script.args.join(' ')}` }];
    let flushing = Promise.resolve();
    const flush = () => {
        const batch = pending;
        pending = [];
        flushing = flushing
            .then(() => appendJobLogs(database, jobId, batch))
            .catch((error) => {
                console.error('Envoi du journal impossible :', error);
            });
        return flushing;
    };
    const partial = { stdout: '', stderr: '' };
    const collect = (stream) => (chunk) => {
        const text = `${partial[stream]}${chunk.toString('utf8')}`;
        const lines = text.split('\n');
        partial[stream] = lines.pop() ?? '';
        for (const line of lines) {
            process[stream].write(`${line}\n`);
            pending.push({ at: now(), stream, line });
        }
    };

    const timer = setInterval(() => void flush(), flushIntervalMs);
    const exitCode = await new Promise((resolve) => {
        const child = spawnImpl(script.command, script.args, {
            cwd: PROJECT_ROOT,
            env: { ...process.env, FORCE_COLOR: '0' },
        });
        child.stdout?.on('data', collect('stdout'));
        child.stderr?.on('data', collect('stderr'));
        child.on('error', (error) => {
            pending.push({ at: now(), stream: 'system', line: `Lancement impossible : ${error.message}` });
            resolve(1);
        });
        child.on('close', (code) => resolve(code ?? 1));
    });
    clearInterval(timer);

    for (const stream of ['stdout', 'stderr']) {
        if (partial[stream]) pending.push({ at: now(), stream, line: partial[stream] });
    }
    pending.push({ at: now(), stream: 'system', line: `Code de sortie : ${exitCode}` });
    await flush();
    await updateJob(database, jobId, {
        status: exitCode === 0 ? 'succeeded' : 'failed',
        finishedAt: now(),
        exitCode,
    });
    return exitCode;
}

/**
 * Clôt un job après l'exécution du workflow.
 *
 * @param {Object} options
 * @param {string} options.jobId - Identifiant du job.
 * @param {string} options.outcome - `success`, `failure` ou `cancelled` (`job.status` du workflow).
 * @param {string} [options.commitSha] - Commit poussé, s'il y en a un.
 * @param {JobDatabase} options.database - Client libSQL.
 * @param {() => string} [options.now] - Horloge ISO injectable (tests).
 * @returns {Promise<void>}
 */
export async function finalizeAdminJob({ jobId, outcome, commitSha, database, now = () => new Date().toISOString() }) {
    const job = await getJob(database, jobId);
    if (!job) throw new Error(`Job inconnu : ${jobId}`);
    if (commitSha) {
        await appendJobLogs(database, jobId, [
            { at: now(), stream: 'system', line: `Résultat committé sur la branche de contenu : ${commitSha}` },
        ]);
        await updateJob(database, jobId, { commitSha });
    }
    if (outcome === 'success') {
        if (!TERMINAL_JOB_STATUSES.includes(job.status)) {
            await updateJob(database, jobId, { status: 'succeeded', finishedAt: now() });
        }
        return;
    }
    const status = outcome === 'cancelled' ? 'cancelled' : 'failed';
    await appendJobLogs(database, jobId, [
        {
            at: now(),
            stream: 'system',
            line: status === 'cancelled' ? 'Job annulé.' : 'Le workflow a échoué (voir le run GitHub Actions).',
        },
    ]);
    await updateJob(database, jobId, { status, finishedAt: now() });
}

async function main() {
    const args = parseCliArgs(process.argv.slice(2), {
        flags: { finalize: ['--finalize'] },
        valueOptions: ['--job', '--script', '--outcome', '--commit'],
    });
    const jobId = args.values['--job'];
    if (!jobId) throw new Error('--job est obligatoire');
    const { createTursoClient } = await import('../lib/turso.mjs');
    const database = createTursoClient();

    if (args.flags.finalize) {
        await finalizeAdminJob({
            jobId,
            outcome: args.values['--outcome'] ?? 'failure',
            commitSha: args.values['--commit'] || undefined,
            database,
        });
        return 0;
    }
    const scriptId = args.values['--script'];
    if (!scriptId) throw new Error('--script est obligatoire');
    // POURQUOI : Node ≥ 22.18 exécute un `.ts` sans types non effaçables ; la liste blanche reste unique.
    const { getScript } = await import('../../src/lib/admin/scripts.ts');
    return runAdminJob({ jobId, scriptId, database, getScript, runId: process.env.GITHUB_RUN_ID ?? null });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    main()
        .then((code) => process.exit(code))
        .catch((error) => {
            console.error(`❌ ${error.message}`);
            process.exit(1);
        });
}
