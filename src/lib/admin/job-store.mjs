/**
 * Stockage des jobs de l'admin distant (scripts lancés dans GitHub Actions), dans Turso.
 *
 * Responsabilité : SQL des tables `admin_jobs` (un job par lancement : script, options choisies, état, auteur,
 * dates, code de sortie, run GitHub, commit produit) et `admin_job_logs` (lignes de sortie, dans l'ordre). Partagé
 * par l'admin (routes `/api/admin/jobs/**`) et par le runner `scripts/admin/run-admin-job.mjs`, qui
 * passent chacun leur client libSQL.
 *
 * POURQUOI un `.mjs` : le runner tourne avec Node seul dans GitHub Actions, sans les alias d'Astro.
 */

/** États d'un job : `queued` (workflow demandé), `running`, puis `succeeded`, `failed` ou `cancelled`. */
export const JOB_STATUSES = ['queued', 'running', 'succeeded', 'failed', 'cancelled'];
export const TERMINAL_JOB_STATUSES = ['succeeded', 'failed', 'cancelled'];

/** Longueur maximale d'une ligne de journal conservée. */
const MAX_LINE_LENGTH = 2000;

/**
 * @typedef {{ execute(statement: string | { sql: string, args?: (string | number | null)[] }): Promise<{ rows: ArrayLike<Record<string, unknown>> }> }} JobDatabase
 * @typedef {{ id: string, scriptId: string, status: string, actor: string, createdAt: string, startedAt: string | null, finishedAt: string | null, exitCode: number | null, runId: string | null, commitSha: string | null, options: Record<string, unknown> | null }} AdminJob
 * @typedef {{ id: number, at: string, stream: string, line: string }} JobLogLine
 */

const preparedDatabases = new WeakSet();

/**
 * Crée les tables au premier usage d'une base.
 *
 * @param {JobDatabase} database - Client libSQL.
 * @returns {Promise<void>}
 */
export async function ensureJobTables(database) {
    if (preparedDatabases.has(database)) return;
    await database.execute(`CREATE TABLE IF NOT EXISTS admin_jobs (
        id TEXT PRIMARY KEY,
        script_id TEXT NOT NULL,
        status TEXT NOT NULL,
        actor TEXT NOT NULL,
        created_at TEXT NOT NULL,
        started_at TEXT,
        finished_at TEXT,
        exit_code INTEGER,
        run_id TEXT,
        commit_sha TEXT,
        options TEXT
    )`);
    // POURQUOI : la colonne `options` est arrivée après la création de la table en production.
    const columns = await database.execute('PRAGMA table_info(admin_jobs)');
    if (!Array.from(columns.rows).some((column) => column.name === 'options')) {
        await database.execute('ALTER TABLE admin_jobs ADD COLUMN options TEXT');
    }
    await database.execute(`CREATE TABLE IF NOT EXISTS admin_job_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL,
        at TEXT NOT NULL,
        stream TEXT NOT NULL,
        line TEXT NOT NULL
    )`);
    await database.execute('CREATE INDEX IF NOT EXISTS admin_job_logs_job ON admin_job_logs (job_id, id)');
    preparedDatabases.add(database);
}

/**
 * @param {unknown} value - Colonne `options` (JSON ou `NULL`).
 * @returns {Record<string, unknown> | null} Les options, ou `null` si absentes ou illisibles.
 */
function parseOptions(value) {
    if (value === null || value === undefined || value === '') return null;
    try {
        const parsed = JSON.parse(String(value));
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

/**
 * @param {Record<string, unknown>} row
 * @returns {AdminJob}
 */
function toJob(row) {
    const optionalText = (value) => (value === null || value === undefined ? null : String(value));
    return {
        id: String(row.id),
        scriptId: String(row.script_id),
        status: String(row.status),
        actor: String(row.actor),
        createdAt: String(row.created_at),
        startedAt: optionalText(row.started_at),
        finishedAt: optionalText(row.finished_at),
        exitCode: row.exit_code === null || row.exit_code === undefined ? null : Number(row.exit_code),
        runId: optionalText(row.run_id),
        commitSha: optionalText(row.commit_sha),
        options: parseOptions(row.options),
    };
}

/**
 * Enregistre un job demandé.
 *
 * @param {JobDatabase} database - Client libSQL.
 * @param {{ id: string, scriptId: string, actor: string, createdAt: string, options?: Record<string, unknown> | null }} job
 *   Job à créer ; `options` sont les valeurs déjà validées par `buildScriptArgs`.
 * @returns {Promise<void>}
 */
export async function insertJob(database, job) {
    await ensureJobTables(database);
    await database.execute({
        sql: 'INSERT INTO admin_jobs (id, script_id, status, actor, created_at, options) VALUES (?, ?, ?, ?, ?, ?)',
        args: [
            job.id,
            job.scriptId,
            'queued',
            job.actor,
            job.createdAt,
            job.options && Object.keys(job.options).length > 0 ? JSON.stringify(job.options) : null,
        ],
    });
}

/**
 * Met à jour les champs d'un job.
 *
 * @param {JobDatabase} database - Client libSQL.
 * @param {string} id - Identifiant du job.
 * @param {Partial<Pick<AdminJob, 'status' | 'startedAt' | 'finishedAt' | 'exitCode' | 'runId' | 'commitSha'>>} fields - Champs à écrire.
 * @returns {Promise<void>}
 */
export async function updateJob(database, id, fields) {
    const columns = {
        status: 'status',
        startedAt: 'started_at',
        finishedAt: 'finished_at',
        exitCode: 'exit_code',
        runId: 'run_id',
        commitSha: 'commit_sha',
    };
    const entries = Object.entries(fields).filter(([key, value]) => key in columns && value !== undefined);
    if (entries.length === 0) return;
    await ensureJobTables(database);
    await database.execute({
        sql: `UPDATE admin_jobs SET ${entries.map(([key]) => `${columns[key]} = ?`).join(', ')} WHERE id = ?`,
        args: [...entries.map(([, value]) => value), id],
    });
}

/**
 * Lit un job.
 *
 * @param {JobDatabase} database - Client libSQL.
 * @param {string} id - Identifiant du job.
 * @returns {Promise<AdminJob | null>} Le job, ou `null`.
 */
export async function getJob(database, id) {
    await ensureJobTables(database);
    const result = await database.execute({ sql: 'SELECT * FROM admin_jobs WHERE id = ?', args: [id] });
    return result.rows.length > 0 ? toJob(result.rows[0]) : null;
}

/**
 * Derniers jobs, les plus récents en premier.
 *
 * @param {JobDatabase} database - Client libSQL.
 * @param {number} [limit] - Nombre maximal (1 à 100).
 * @returns {Promise<AdminJob[]>}
 */
export async function listJobs(database, limit = 30) {
    await ensureJobTables(database);
    const result = await database.execute({
        sql: 'SELECT * FROM admin_jobs ORDER BY created_at DESC LIMIT ?',
        args: [Math.min(Math.max(Math.trunc(limit), 1), 100)],
    });
    return Array.from(result.rows, toJob);
}

/**
 * Job encore actif (demandé ou en cours) pour un script.
 *
 * @param {JobDatabase} database - Client libSQL.
 * @param {string} scriptId - Script.
 * @returns {Promise<AdminJob | null>}
 */
export async function findActiveJob(database, scriptId) {
    await ensureJobTables(database);
    const result = await database.execute({
        sql: "SELECT * FROM admin_jobs WHERE script_id = ? AND status IN ('queued', 'running') ORDER BY created_at DESC LIMIT 1",
        args: [scriptId],
    });
    return result.rows.length > 0 ? toJob(result.rows[0]) : null;
}

/**
 * Ajoute des lignes au journal d'un job.
 *
 * @param {JobDatabase} database - Client libSQL.
 * @param {string} jobId - Identifiant du job.
 * @param {{ at: string, stream: string, line: string }[]} lines - Lignes, dans l'ordre.
 * @returns {Promise<void>}
 */
export async function appendJobLogs(database, jobId, lines) {
    if (lines.length === 0) return;
    await ensureJobTables(database);
    const placeholders = lines.map(() => '(?, ?, ?, ?)').join(', ');
    await database.execute({
        sql: `INSERT INTO admin_job_logs (job_id, at, stream, line) VALUES ${placeholders}`,
        args: lines.flatMap(({ at, stream, line }) => [jobId, at, stream, line.slice(0, MAX_LINE_LENGTH)]),
    });
}

/**
 * Lignes du journal d'un job après un curseur.
 *
 * @param {JobDatabase} database - Client libSQL.
 * @param {string} jobId - Identifiant du job.
 * @param {number} [afterId] - Dernier identifiant déjà lu (0 pour tout lire).
 * @param {number} [limit] - Nombre maximal de lignes (1 à 2000).
 * @returns {Promise<JobLogLine[]>}
 */
export async function readJobLogs(database, jobId, afterId = 0, limit = 1000) {
    await ensureJobTables(database);
    const result = await database.execute({
        sql: 'SELECT id, at, stream, line FROM admin_job_logs WHERE job_id = ? AND id > ? ORDER BY id LIMIT ?',
        args: [jobId, Math.max(Math.trunc(afterId) || 0, 0), Math.min(Math.max(Math.trunc(limit), 1), 2000)],
    });
    return Array.from(result.rows, (row) => ({
        id: Number(row.id),
        at: String(row.at),
        stream: String(row.stream),
        line: String(row.line),
    }));
}
