/**
 * Demandes de remise en main propre et codes d'accès associés.
 *
 * Responsabilité : ranger dans Turso (table `shop_pickup_requests`, créée au premier usage) les demandes
 * envoyées depuis `/boutique`, les décisions prises dans `/admin/boutique` et le cycle de vie du code
 * délivré à l'acheteur : `pending` → `approved` (code émis) → `used` (paiement Stripe terminé), ou
 * `rejected` / `revoked`.
 *
 * POURQUOI Turso : la production (`/api/shop/**`) et l'admin (local ou Preview de `dev`) partagent la même
 * base ; un code accepté dans l'admin est aussitôt valable sur le site public, sans redéploiement.
 *
 * WARNING: sécurité. Le code est la seule preuve de l'accord de l'auteur : il est tiré au hasard
 * (`crypto.getRandomValues`), lié à l'e-mail de la demande (imposé dans Stripe Checkout), expire et ne
 * sert qu'à une commande payée.
 */

/** Sous-ensemble du client libSQL utilisé ici (injectable dans les tests). */
export interface PickupDatabase {
    execute(statement: { sql: string; args?: (string | number | null)[] } | string): Promise<{
        rows: ArrayLike<Record<string, unknown>>;
        rowsAffected?: number;
    }>;
}

export type PickupRequestStatus = 'pending' | 'approved' | 'rejected' | 'revoked' | 'used';

export interface PickupRequest {
    id: string;
    createdAt: string;
    name: string;
    email: string;
    place: string;
    message: string;
    status: PickupRequestStatus;
    code: string | null;
    decidedAt: string | null;
    expiresAt: string | null;
    stripeSessionId: string | null;
    usedAt: string | null;
}

export interface NewPickupRequest {
    name: string;
    email: string;
    place: string;
    message: string;
    /** Empreinte de l'adresse IP (jamais l'adresse elle-même), pour limiter le débit. */
    clientHash: string;
}

/** Durée de validité d'un code après acceptation. */
export const PICKUP_CODE_VALIDITY_DAYS = 30;
/** Plafonds de demandes : par e-mail sur 24 h, par client (IP) sur une heure. */
export const PICKUP_REQUEST_LIMITS = { perEmailPerDay: 3, perClientPerHour: 5 } as const;

const TABLE = 'shop_pickup_requests';
// POURQUOI sans 0/O, 1/I/L : le code se recopie à la main depuis un e-mail ou se dicte.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_GROUP_LENGTH = 4;
const CODE_PREFIX = 'MP';

let defaultDatabase: Promise<PickupDatabase | null> | null = null;
const preparedDatabases = new WeakSet<PickupDatabase>();

/**
 * Base Turso par défaut, ou `null` si elle n'est pas configurée.
 *
 * @param database - Base injectée (tests).
 * @returns La base à utiliser.
 */
export async function resolvePickupDatabase(database?: PickupDatabase): Promise<PickupDatabase | null> {
    if (database) return database;
    // POURQUOI import dynamique : `@/lib/db` lève une exception sans TURSO_DATABASE_URL ; la boutique doit
    // alors refuser proprement la remise en main propre au lieu de faire échouer toute la route.
    defaultDatabase ??= import('@/lib/db').then(
        (module) => module.db as unknown as PickupDatabase,
        () => null,
    );
    return defaultDatabase;
}

async function ensureTable(database: PickupDatabase): Promise<void> {
    if (preparedDatabases.has(database)) return;
    await database.execute(
        `CREATE TABLE IF NOT EXISTS ${TABLE} (
            id TEXT PRIMARY KEY,
            created_at TEXT NOT NULL,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            place TEXT NOT NULL,
            message TEXT NOT NULL,
            client_hash TEXT NOT NULL,
            status TEXT NOT NULL,
            code TEXT UNIQUE,
            decided_at TEXT,
            expires_at TEXT,
            stripe_session_id TEXT,
            used_at TEXT
        )`,
    );
    await database.execute(`CREATE INDEX IF NOT EXISTS ${TABLE}_email_created ON ${TABLE} (email, created_at)`);
    await database.execute(`CREATE INDEX IF NOT EXISTS ${TABLE}_client_created ON ${TABLE} (client_hash, created_at)`);
    preparedDatabases.add(database);
}

async function requireDatabase(database?: PickupDatabase): Promise<PickupDatabase> {
    const target = await resolvePickupDatabase(database);
    if (!target) throw new Error('Turso non configuré');
    await ensureTable(target);
    return target;
}

function toNullableString(value: unknown): string | null {
    return value == null ? null : String(value);
}

function rowToRequest(row: Record<string, unknown>): PickupRequest {
    return {
        id: String(row.id),
        createdAt: String(row.created_at),
        name: String(row.name),
        email: String(row.email),
        place: String(row.place),
        message: String(row.message),
        status: String(row.status) as PickupRequestStatus,
        code: toNullableString(row.code),
        decidedAt: toNullableString(row.decided_at),
        expiresAt: toNullableString(row.expires_at),
        stripeSessionId: toNullableString(row.stripe_session_id),
        usedAt: toNullableString(row.used_at),
    };
}

/**
 * Tire un code d'accès lisible (`MP-XXXX-XXXX`, environ 40 bits d'aléa).
 *
 * @returns Le code, en majuscules.
 */
export function generatePickupCode(): string {
    const groups: string[] = [];
    // POURQUOI le rejet des octets ≥ 248 : 248 est le plus grand multiple de 31 sous 256 ; sans cela, les
    // premières lettres de l'alphabet sortiraient plus souvent.
    const limit = Math.floor(256 / CODE_ALPHABET.length) * CODE_ALPHABET.length;
    for (let group = 0; group < 2; group++) {
        let chunk = '';
        while (chunk.length < CODE_GROUP_LENGTH) {
            const [byte] = crypto.getRandomValues(new Uint8Array(1));
            if (byte < limit) chunk += CODE_ALPHABET[byte % CODE_ALPHABET.length];
        }
        groups.push(chunk);
    }
    return [CODE_PREFIX, ...groups].join('-');
}

/**
 * Remet en forme un code saisi par l'acheteur (casse, espaces, tirets oubliés).
 *
 * @param raw - Saisie brute.
 * @returns Le code au format `MP-XXXX-XXXX`, ou `null` s'il ne peut pas en être un.
 */
export function normalizePickupCode(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    const compact = raw.toUpperCase().replace(/[\s-]/g, '');
    const body = compact.startsWith(CODE_PREFIX) ? compact.slice(CODE_PREFIX.length) : compact;
    const expectedLength = CODE_GROUP_LENGTH * 2;
    if (body.length !== expectedLength) return null;
    if (![...body].every((character) => CODE_ALPHABET.includes(character))) return null;
    return `${CODE_PREFIX}-${body.slice(0, CODE_GROUP_LENGTH)}-${body.slice(CODE_GROUP_LENGTH)}`;
}

/**
 * Compte les demandes récentes d'un e-mail et d'un client, pour plafonner le débit.
 *
 * @param email - E-mail normalisé.
 * @param clientHash - Empreinte du client.
 * @param now - Instant courant.
 * @param database - Base (par défaut, Turso).
 * @returns `true` si une nouvelle demande dépasserait un plafond.
 */
export async function isPickupRequestRateLimited(
    email: string,
    clientHash: string,
    now: Date,
    database?: PickupDatabase,
): Promise<boolean> {
    const target = await requireDatabase(database);
    const dayAgo = new Date(now.getTime() - 24 * 3_600_000).toISOString();
    const hourAgo = new Date(now.getTime() - 3_600_000).toISOString();
    const result = await target.execute({
        sql: `SELECT
                (SELECT COUNT(*) FROM ${TABLE} WHERE email = ? AND created_at >= ?) AS by_email,
                (SELECT COUNT(*) FROM ${TABLE} WHERE client_hash = ? AND created_at >= ?) AS by_client`,
        args: [email, dayAgo, clientHash, hourAgo],
    });
    const row = result.rows[0] ?? {};
    return (
        Number(row.by_email ?? 0) >= PICKUP_REQUEST_LIMITS.perEmailPerDay ||
        Number(row.by_client ?? 0) >= PICKUP_REQUEST_LIMITS.perClientPerHour
    );
}

/**
 * Enregistre une nouvelle demande (statut `pending`).
 *
 * @param request - Champs déjà validés.
 * @param now - Instant courant.
 * @param database - Base (par défaut, Turso).
 * @returns La demande créée.
 */
export async function createPickupRequest(
    request: NewPickupRequest,
    now: Date,
    database?: PickupDatabase,
): Promise<PickupRequest> {
    const target = await requireDatabase(database);
    const id = crypto.randomUUID();
    const createdAt = now.toISOString();
    await target.execute({
        sql: `INSERT INTO ${TABLE} (id, created_at, name, email, place, message, client_hash, status)
              VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
        args: [id, createdAt, request.name, request.email, request.place, request.message, request.clientHash],
    });
    return {
        id,
        createdAt,
        name: request.name,
        email: request.email,
        place: request.place,
        message: request.message,
        status: 'pending',
        code: null,
        decidedAt: null,
        expiresAt: null,
        stripeSessionId: null,
        usedAt: null,
    };
}

/**
 * Dernières demandes, les plus récentes en premier.
 *
 * @param limit - Nombre maximal (1 à 500).
 * @param database - Base (par défaut, Turso).
 * @returns Les demandes.
 */
export async function listPickupRequests(limit = 200, database?: PickupDatabase): Promise<PickupRequest[]> {
    const target = await requireDatabase(database);
    const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 500);
    const result = await target.execute({
        sql: `SELECT * FROM ${TABLE} ORDER BY created_at DESC LIMIT ?`,
        args: [boundedLimit],
    });
    return Array.from(result.rows, rowToRequest);
}

/**
 * Relit une demande.
 *
 * @param id - Identifiant de la demande.
 * @param database - Base (par défaut, Turso).
 * @returns La demande, ou `null` si elle n'existe pas.
 */
export async function getPickupRequest(id: string, database?: PickupDatabase): Promise<PickupRequest | null> {
    const target = await requireDatabase(database);
    const result = await target.execute({ sql: `SELECT * FROM ${TABLE} WHERE id = ?`, args: [id] });
    const row = result.rows[0];
    return row ? rowToRequest(row) : null;
}

/**
 * Accepte une demande en attente et lui attribue un code.
 *
 * @param id - Identifiant de la demande.
 * @param now - Instant de la décision.
 * @param database - Base (par défaut, Turso).
 * @returns La demande acceptée, ou `null` si elle n'existe pas ou n'est plus en attente.
 */
export async function approvePickupRequest(
    id: string,
    now: Date,
    database?: PickupDatabase,
): Promise<PickupRequest | null> {
    const target = await requireDatabase(database);
    const expiresAt = new Date(now.getTime() + PICKUP_CODE_VALIDITY_DAYS * 86_400_000).toISOString();
    // POURQUOI la boucle : la contrainte UNIQUE sur `code` refuse une collision (improbable) ; on retire.
    for (let attempt = 0; attempt < 5; attempt++) {
        try {
            const result = await target.execute({
                sql: `UPDATE ${TABLE} SET status = 'approved', code = ?, decided_at = ?, expires_at = ?
                      WHERE id = ? AND status = 'pending'`,
                args: [generatePickupCode(), now.toISOString(), expiresAt, id],
            });
            if (result.rowsAffected === 0) return null;
            return getPickupRequest(id, target);
        } catch (error) {
            if (!/UNIQUE/i.test(String(error))) throw error;
        }
    }
    throw new Error('Impossible de tirer un code unique');
}

/**
 * Refuse une demande en attente, ou révoque un code accepté et pas encore utilisé.
 *
 * @param id - Identifiant de la demande.
 * @param now - Instant de la décision.
 * @param database - Base (par défaut, Turso).
 * @returns La demande mise à jour, ou `null` si son statut ne le permet pas.
 */
export async function closePickupRequest(
    id: string,
    now: Date,
    database?: PickupDatabase,
): Promise<PickupRequest | null> {
    const target = await requireDatabase(database);
    const result = await target.execute({
        sql: `UPDATE ${TABLE}
              SET status = CASE status WHEN 'pending' THEN 'rejected' ELSE 'revoked' END, decided_at = ?
              WHERE id = ? AND status IN ('pending', 'approved')`,
        args: [now.toISOString(), id],
    });
    if (result.rowsAffected === 0) return null;
    return getPickupRequest(id, target);
}

/**
 * Retrouve la demande acceptée correspondant à un code encore valable.
 *
 * @param code - Code normalisé (`normalizePickupCode`).
 * @param now - Instant courant.
 * @param database - Base (par défaut, Turso).
 * @returns La demande, ou `null` si le code est inconnu, expiré, révoqué ou déjà utilisé.
 */
export async function findUsablePickupCode(
    code: string,
    now: Date,
    database?: PickupDatabase,
): Promise<PickupRequest | null> {
    const target = await requireDatabase(database);
    const result = await target.execute({
        sql: `SELECT * FROM ${TABLE} WHERE code = ? AND status = 'approved' AND expires_at > ?`,
        args: [code, now.toISOString()],
    });
    const row = result.rows[0];
    return row ? rowToRequest(row) : null;
}

/**
 * Rattache au code la session Stripe qui vient d'être créée (la précédente, s'il y en avait une, a été
 * expirée par l'appelant).
 *
 * @param id - Identifiant de la demande.
 * @param stripeSessionId - Identifiant de la session Checkout.
 * @param database - Base (par défaut, Turso).
 */
export async function attachCheckoutSession(
    id: string,
    stripeSessionId: string,
    database?: PickupDatabase,
): Promise<void> {
    const target = await requireDatabase(database);
    await target.execute({
        sql: `UPDATE ${TABLE} SET stripe_session_id = ? WHERE id = ? AND status = 'approved'`,
        args: [stripeSessionId, id],
    });
}

/**
 * Marque le code comme utilisé une fois la commande payée.
 *
 * @param id - Identifiant de la demande.
 * @param stripeSessionId - Session Checkout payée.
 * @param now - Instant du paiement.
 * @param database - Base (par défaut, Turso).
 * @returns `true` si la demande est passée à `used` (ou l'était déjà avec cette session).
 */
export async function markPickupCodeUsed(
    id: string,
    stripeSessionId: string,
    now: Date,
    database?: PickupDatabase,
): Promise<boolean> {
    const target = await requireDatabase(database);
    const result = await target.execute({
        sql: `UPDATE ${TABLE} SET status = 'used', used_at = ?, stripe_session_id = ?
              WHERE id = ? AND status IN ('approved', 'revoked')`,
        args: [now.toISOString(), stripeSessionId, id],
    });
    if ((result.rowsAffected ?? 0) > 0) return true;
    const current = await getPickupRequest(id, target);
    return current?.status === 'used' && current.stripeSessionId === stripeSessionId;
}
