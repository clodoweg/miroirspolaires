/**
 * Journal d'audit et limitation de débit de l'admin distant.
 *
 * Responsabilité : enregistrer dans Turso chaque requête d'écriture faite sur l'admin distant (qui, quoi,
 * quand, résultat), relire les dernières entrées pour `/admin/journal`, et compter les écritures
 * récentes pour plafonner leur débit (`src/middleware.ts`).
 *
 * POURQUOI Turso plutôt que la mémoire : les fonctions Vercel tournent sur plusieurs instances
 * éphémères ; seul un stockage partagé donne un journal complet et un compteur fiable.
 *
 * WARNING: ce module ne doit jamais faire échouer une action admin. Sans Turso, ou si Turso refuse
 * l'écriture, l'action passe, l'erreur est seulement journalisée dans les logs Vercel.
 */

/** Sous-ensemble du client libSQL utilisé ici (injectable dans les tests). */
export interface AuditDatabase {
    execute(statement: { sql: string; args?: (string | number)[] } | string): Promise<{
        rows: ArrayLike<Record<string, unknown>>;
    }>;
}

export interface AuditEntry {
    at: string;
    actor: string;
    method: string;
    path: string;
    status: number;
}

/** Plafond d'écritures par minute et par administrateur sur l'admin distant. */
export const WRITE_RATE_LIMIT_PER_MINUTE = 120;
const TABLE = 'admin_audit_log';

let defaultDatabase: Promise<AuditDatabase | null> | null = null;
const preparedDatabases = new WeakSet<AuditDatabase>();

async function resolveDatabase(database?: AuditDatabase): Promise<AuditDatabase | null> {
    if (database) return database;
    // POURQUOI import dynamique : `@/lib/db` lève une exception sans TURSO_DATABASE_URL ; le journal doit
    // alors se désactiver au lieu de casser le middleware.
    defaultDatabase ??= import('@/lib/db').then(
        (module) => module.db as unknown as AuditDatabase,
        () => null,
    );
    return defaultDatabase;
}

async function ensureTable(database: AuditDatabase): Promise<void> {
    if (preparedDatabases.has(database)) return;
    await database.execute(
        `CREATE TABLE IF NOT EXISTS ${TABLE} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            at TEXT NOT NULL,
            actor TEXT NOT NULL,
            method TEXT NOT NULL,
            path TEXT NOT NULL,
            status INTEGER NOT NULL
        )`,
    );
    await database.execute(`CREATE INDEX IF NOT EXISTS ${TABLE}_actor_at ON ${TABLE} (actor, at)`);
    preparedDatabases.add(database);
}

/**
 * Indique si une requête vers l'API admin doit être journalisée et comptée.
 *
 * @param method - Méthode HTTP.
 * @param pathname - Chemin de la requête.
 * @returns `true` pour toute écriture (méthode autre que GET/HEAD) sous `/api/admin/`.
 */
export function isAuditedRequest(method: string, pathname: string): boolean {
    return pathname.startsWith('/api/admin/') && method !== 'GET' && method !== 'HEAD';
}

/**
 * Enregistre une action ; n'échoue jamais.
 *
 * @param entry - Action à enregistrer.
 * @param database - Base (par défaut, Turso).
 */
export async function recordAdminAction(entry: AuditEntry, database?: AuditDatabase): Promise<void> {
    try {
        const target = await resolveDatabase(database);
        if (!target) return;
        await ensureTable(target);
        await target.execute({
            sql: `INSERT INTO ${TABLE} (at, actor, method, path, status) VALUES (?, ?, ?, ?, ?)`,
            args: [entry.at, entry.actor, entry.method, entry.path.slice(0, 500), entry.status],
        });
    } catch (error) {
        console.error('[admin-audit] écriture impossible', error);
    }
}

/**
 * Compte les écritures d'un administrateur depuis un instant donné.
 *
 * @param actor - Login GitHub.
 * @param sinceIso - Début de la fenêtre (ISO 8601).
 * @param database - Base (par défaut, Turso).
 * @returns Le nombre, ou `null` si la base est indisponible (pas de limitation dans ce cas).
 */
export async function countAdminActionsSince(
    actor: string,
    sinceIso: string,
    database?: AuditDatabase,
): Promise<number | null> {
    try {
        const target = await resolveDatabase(database);
        if (!target) return null;
        await ensureTable(target);
        const result = await target.execute({
            sql: `SELECT COUNT(*) AS total FROM ${TABLE} WHERE actor = ? AND at >= ?`,
            args: [actor, sinceIso],
        });
        return Number(result.rows[0]?.total ?? 0);
    } catch (error) {
        console.error('[admin-audit] comptage impossible', error);
        return null;
    }
}

/**
 * Dernières actions enregistrées, les plus récentes en premier.
 *
 * @param limit - Nombre maximal d'entrées (1 à 500).
 * @param database - Base (par défaut, Turso).
 * @returns Les entrées, ou une erreur lisible si la base est indisponible.
 */
export async function listAdminActions(
    limit = 100,
    database?: AuditDatabase,
): Promise<{ entries: AuditEntry[]; error?: string }> {
    const target = await resolveDatabase(database);
    if (!target) return { entries: [], error: 'Turso n’est pas configuré sur ce déploiement.' };
    try {
        await ensureTable(target);
        const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 500);
        const result = await target.execute({
            sql: `SELECT at, actor, method, path, status FROM ${TABLE} ORDER BY id DESC LIMIT ?`,
            args: [boundedLimit],
        });
        return {
            entries: Array.from(result.rows, (row) => ({
                at: String(row.at),
                actor: String(row.actor),
                method: String(row.method),
                path: String(row.path),
                status: Number(row.status),
            })),
        };
    } catch (error) {
        console.error('[admin-audit] lecture impossible', error);
        return { entries: [], error: 'Lecture du journal impossible (Turso).' };
    }
}
