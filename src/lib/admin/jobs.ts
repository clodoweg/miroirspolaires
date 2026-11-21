/**
 * Scripts de l'admin distant exécutés dans GitHub Actions.
 *
 * Responsabilité : créer un job (Turso) et déclencher le workflow `admin-job.yml` sur la branche de
 * contenu, relire l'état et le journal d'un job, l'annuler. L'exécution elle-même est faite par
 * `scripts/admin/run-admin-job.mjs` dans le workflow.
 *
 * WARNING: sécurité. Seules les entrées `remote: true` de `SCRIPTS` peuvent être lancées, sans argument ;
 * le workflow revérifie le script contre la même liste blanche.
 */
import { randomUUID } from 'node:crypto';
import { GitHubApiError, type GitHubAppClient } from './github/app-client';
import {
    appendJobLogs,
    findActiveJob,
    getJob,
    insertJob,
    readJobLogs,
    TERMINAL_JOB_STATUSES,
    updateJob,
    type AdminJob,
    type JobDatabase,
    type JobLogLine,
} from './job-store.mjs';
import { getScript } from './scripts';
import { jsonResponse } from './shared';

export type { AdminJob, JobLogLine };

/** Fichier du workflow déclenché (`.github/workflows/`). */
export const ADMIN_JOB_WORKFLOW = 'admin-job.yml';

export class JobRequestError extends Error {
    constructor(
        readonly status: 400 | 404 | 409 | 503,
        message: string,
    ) {
        super(message);
        this.name = 'JobRequestError';
    }
}

let defaultDatabase: Promise<JobDatabase | null> | null = null;

/**
 * Base Turso des jobs.
 *
 * @returns Le client, ou `null` si `@/lib/db` ne peut pas se charger (Turso non configuré).
 */
export function getJobDatabase(): Promise<JobDatabase | null> {
    defaultDatabase ??= import('@/lib/db').then(
        (module) => module.db as unknown as JobDatabase,
        () => null,
    );
    return defaultDatabase;
}

async function requireDatabase(database?: JobDatabase | null): Promise<JobDatabase> {
    const target = database ?? (await getJobDatabase());
    if (!target) throw new JobRequestError(503, 'Turso n’est pas configuré sur ce déploiement.');
    return target;
}

/**
 * Crée un job et déclenche le workflow.
 *
 * @param options - Script, auteur, client GitHub, branche de contenu, base (injectable).
 * @returns Le job créé (`queued`).
 * @throws JobRequestError 400 si le script n'est pas lançable à distance, 409 si un job du même script est actif.
 */
export async function startRemoteJob(options: {
    scriptId: string;
    actor: string;
    client: GitHubAppClient;
    contentBranch: string;
    database?: JobDatabase | null;
    now?: () => string;
}): Promise<AdminJob> {
    const now = options.now ?? (() => new Date().toISOString());
    const script = getScript(options.scriptId);
    if (!script || script.remote !== true) {
        throw new JobRequestError(400, 'Ce script ne se lance pas depuis l’admin distant.');
    }
    const database = await requireDatabase(options.database);
    const active = await findActiveJob(database, script.id);
    if (active) throw new JobRequestError(409, 'Ce script tourne déjà : attendez la fin du job en cours.');

    const job = { id: randomUUID(), scriptId: script.id, actor: options.actor, createdAt: now() };
    await insertJob(database, job);
    const response = await options.client.request(
        `${options.client.repoPath}/actions/workflows/${ADMIN_JOB_WORKFLOW}/dispatches`,
        {
            method: 'POST',
            body: JSON.stringify({ ref: options.contentBranch, inputs: { job_id: job.id, script_id: script.id } }),
        },
    );
    if (!response.ok) {
        await appendJobLogs(database, job.id, [
            {
                at: now(),
                stream: 'system',
                line: `GitHub a refusé le lancement du workflow (HTTP ${response.status}).`,
            },
        ]);
        await updateJob(database, job.id, { status: 'failed', finishedAt: now() });
        throw new GitHubApiError(response.status, `Lancement du workflow : ${response.status}`);
    }
    return (await getJob(database, job.id)) as AdminJob;
}

/**
 * État d'un job et lignes de journal nouvelles.
 *
 * @param jobId - Identifiant du job.
 * @param afterLogId - Dernière ligne déjà reçue.
 * @param database - Base (injectable).
 * @returns Le job et les lignes.
 * @throws JobRequestError 404 si le job n'existe pas.
 */
export async function readRemoteJob(
    jobId: string,
    afterLogId: number,
    database?: JobDatabase | null,
): Promise<{ job: AdminJob; logs: JobLogLine[] }> {
    const target = await requireDatabase(database);
    const job = await getJob(target, jobId);
    if (!job) throw new JobRequestError(404, 'Job introuvable.');
    return { job, logs: await readJobLogs(target, jobId, afterLogId) };
}

/**
 * Annule un job : annule le run GitHub s'il a démarré, sinon marque le job annulé (le runner refusera
 * de le lancer).
 *
 * @param jobId - Identifiant du job.
 * @param client - Client GitHub App.
 * @param database - Base (injectable).
 * @param now - Horloge ISO injectable.
 * @returns Le job à jour.
 * @throws JobRequestError 404 si le job n'existe pas, 409 s'il est déjà terminé.
 */
export async function cancelRemoteJob(
    jobId: string,
    client: GitHubAppClient,
    database?: JobDatabase | null,
    now: () => string = () => new Date().toISOString(),
): Promise<AdminJob> {
    const target = await requireDatabase(database);
    const job = await getJob(target, jobId);
    if (!job) throw new JobRequestError(404, 'Job introuvable.');
    if (TERMINAL_JOB_STATUSES.includes(job.status)) throw new JobRequestError(409, 'Ce job est déjà terminé.');
    if (job.runId) {
        const response = await client.request(
            `${client.repoPath}/actions/runs/${encodeURIComponent(job.runId)}/cancel`,
            {
                method: 'POST',
            },
        );
        if (!response.ok && response.status !== 409) {
            throw new GitHubApiError(response.status, `Annulation du run : ${response.status}`);
        }
    }
    await appendJobLogs(target, jobId, [{ at: now(), stream: 'system', line: 'Annulation demandée depuis l’admin.' }]);
    await updateJob(target, jobId, { status: 'cancelled', finishedAt: now() });
    return (await getJob(target, jobId)) as AdminJob;
}

/**
 * Traduit l'échec d'une opération de job en réponse HTTP.
 *
 * @param error - Erreur levée par une fonction de ce module.
 * @returns La réponse (statut de `JobRequestError`, 502 si GitHub refuse).
 * @throws L'erreur d'origine dans les autres cas.
 */
export function toJobErrorResponse(error: unknown): Response {
    if (error instanceof JobRequestError) return jsonResponse({ error: error.message }, error.status);
    if (error instanceof GitHubApiError) {
        console.error('[admin-jobs] GitHub', error);
        return jsonResponse({ error: 'GitHub a refusé l’opération (permission Actions de l’App ?).' }, 502);
    }
    throw error;
}
