/**
 * Session de l'admin distant : valeurs signées dans des cookies.
 *
 * Responsabilité : signer et vérifier (HMAC-SHA256) la session de l'administrateur et l'état
 * temporaire du login OAuth, construire les en-têtes `Set-Cookie` et relire les cookies d'une requête.
 *
 * WARNING: sécurité. Le cookie n'est pas chiffré : il ne contient que l'identifiant et le login GitHub,
 * jamais de jeton. Toute valeur dont la signature ou l'expiration est invalide est rejetée.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const ADMIN_SESSION_COOKIE = 'mp_admin_session';
export const OAUTH_STATE_COOKIE = 'mp_admin_oauth';
export const SESSION_TTL_SECONDS = 12 * 60 * 60;
export const OAUTH_STATE_TTL_SECONDS = 10 * 60;

export interface AdminSession {
    userId: number;
    login: string;
    /** Expiration en secondes depuis l'epoch. */
    expiresAt: number;
}

export interface OAuthState {
    state: string;
    codeVerifier: string;
    /** Chemin `/admin…` où revenir après le login. */
    returnTo: string;
    expiresAt: number;
}

function sign(encodedPayload: string, secret: string): string {
    return createHmac('sha256', secret).update(encodedPayload).digest('base64url');
}

/**
 * Sérialise et signe une valeur expirante.
 *
 * @param payload - Objet JSON portant `expiresAt` (secondes).
 * @param secret - Secret HMAC (`ADMIN_SESSION_SECRET`).
 * @returns `<payload base64url>.<signature base64url>`.
 */
export function signValue<T extends { expiresAt: number }>(payload: T, secret: string): string {
    const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    return `${encoded}.${sign(encoded, secret)}`;
}

/**
 * Vérifie une valeur produite par `signValue`.
 *
 * @param value - Valeur du cookie.
 * @param secret - Secret HMAC.
 * @param nowSeconds - Instant courant (secondes).
 * @returns L'objet décodé, ou `null` si la signature est fausse, le format invalide ou la valeur expirée.
 */
export function verifySignedValue<T extends { expiresAt: number }>(
    value: string | null | undefined,
    secret: string,
    nowSeconds: number,
): T | null {
    if (!value) return null;
    const [encoded, signature, extra] = value.split('.');
    if (!encoded || !signature || extra !== undefined) return null;
    const expected = Buffer.from(sign(encoded, secret));
    const received = Buffer.from(signature);
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
    try {
        const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as T;
        if (typeof payload?.expiresAt !== 'number' || payload.expiresAt <= nowSeconds) return null;
        return payload;
    } catch {
        return null;
    }
}

/**
 * Relit et vérifie la session d'une requête.
 *
 * @param request - Requête entrante.
 * @param secret - Secret HMAC.
 * @param nowSeconds - Instant courant (secondes).
 * @returns La session, ou `null` si elle est absente, falsifiée, expirée ou mal formée.
 */
export function readAdminSession(request: Request, secret: string, nowSeconds: number): AdminSession | null {
    const session = verifySignedValue<AdminSession>(readCookie(request, ADMIN_SESSION_COOKIE), secret, nowSeconds);
    if (!session || !Number.isSafeInteger(session.userId) || typeof session.login !== 'string') return null;
    return session;
}

/**
 * Lit un cookie dans l'en-tête `Cookie`.
 *
 * @param request - Requête entrante.
 * @param name - Nom du cookie.
 * @returns Sa valeur, ou `null`.
 */
export function readCookie(request: Request, name: string): string | null {
    const header = request.headers.get('Cookie');
    if (!header) return null;
    for (const part of header.split(';')) {
        const separator = part.indexOf('=');
        if (separator === -1) continue;
        if (part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim();
    }
    return null;
}

/**
 * Construit un en-tête `Set-Cookie` pour l'admin.
 *
 * POURQUOI `SameSite=Lax` : le retour de GitHub vers le callback est une navigation inter-sites ;
 * avec `Strict`, le cookie d'état OAuth ne serait pas envoyé. Les écritures restent protégées par le
 * contrôle inter-sites du middleware.
 *
 * @param name - Nom du cookie.
 * @param value - Valeur (vide pour effacer).
 * @param maxAgeSeconds - Durée de vie ; 0 efface le cookie.
 * @returns La valeur de l'en-tête.
 */
export function buildCookieHeader(name: string, value: string, maxAgeSeconds: number): string {
    return `${name}=${value}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; Secure; SameSite=Lax`;
}
