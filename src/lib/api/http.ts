/**
 * Helpers HTTP partagés par les routes `src/pages/api/**`
 *
 * Responsabilité : construire les réponses JSON, renvoyer des erreurs génériques au client
 * (le détail ne part que dans les logs serveur) et lire les paramètres de requête avec des
 * bornes strictes, pour qu'aucune route publique n'accepte de valeur non plafonnée.
 */

const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';

/**
 * Délais d'expiration des appels sortants (CDS, NED, Wikipédia).
 *
 * POURQUOI : sans délai, une panne d'un service tiers bloquait la fonction serverless jusqu'à
 * sa durée maximale. Les requêtes TAP du CDS (catalogues entiers, aussi lancées au build) ont
 * droit à plus de temps que les résolutions unitaires.
 */
export const UPSTREAM_TIMEOUT_MS = { tap: 25_000, lookup: 10_000 } as const;

/**
 * Construit une réponse JSON.
 *
 * @param data - Corps sérialisé en JSON.
 * @param init - Statut (200 par défaut) et en-têtes supplémentaires.
 * @returns La réponse prête à renvoyer.
 */
export function jsonResponse(data: unknown, init: { status?: number; headers?: HeadersInit } = {}): Response {
    const headers = new Headers(init.headers);
    headers.set('Content-Type', JSON_CONTENT_TYPE);
    return new Response(JSON.stringify(data), { status: init.status ?? 200, headers });
}

/**
 * Réponse d'erreur au format `{ error }`, sans cache.
 *
 * @param status - Code HTTP (4xx ou 5xx).
 * @param message - Message destiné au client : jamais de détail interne.
 * @returns La réponse d'erreur.
 */
export function errorResponse(status: number, message: string): Response {
    return jsonResponse({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * Journalise une erreur interne et renvoie un 500 générique.
 *
 * WARNING: ne jamais renvoyer `error.message` au client : il peut contenir des détails de
 * configuration, de requête SQL ou de service tiers (OWASP API8).
 *
 * @param context - Libellé de la route, repris dans le log.
 * @param error - Erreur attrapée.
 * @returns Un 500 au message générique.
 */
export function internalErrorResponse(context: string, error: unknown): Response {
    console.error(`[api] ${context}:`, error);
    return errorResponse(500, 'Erreur interne du serveur');
}

/**
 * Lit un entier borné. Une valeur absente, non entière ou hors bornes est ramenée
 * dans l'intervalle (ou remplacée par la valeur par défaut si elle n'est pas un nombre).
 *
 * @param value - Valeur brute (`searchParams.get`).
 * @param options - Valeur par défaut et bornes incluses.
 * @returns Un entier dans [min, max].
 */
export function parseBoundedInt(
    value: string | null | undefined,
    options: { fallback: number; min: number; max: number },
): number {
    const parsed = value == null || value.trim() === '' ? NaN : Number(value);
    if (!Number.isFinite(parsed)) return options.fallback;
    return Math.min(options.max, Math.max(options.min, Math.trunc(parsed)));
}

/**
 * Lit un nombre décimal qui doit se trouver dans un intervalle.
 *
 * @param value - Valeur brute (`searchParams.get`).
 * @param options - Bornes incluses.
 * @returns Le nombre, ou `undefined` s'il est absent, invalide ou hors bornes.
 */
export function parseNumberInRange(
    value: string | null | undefined,
    options: { min: number; max: number },
): number | undefined {
    if (value == null || value.trim() === '') return undefined;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < options.min || parsed > options.max) return undefined;
    return parsed;
}

/**
 * Lit une chaîne en la tronquant après `trim()`.
 *
 * @param value - Valeur brute.
 * @param maxLength - Longueur maximale conservée.
 * @returns La chaîne nettoyée (vide si absente).
 */
export function parseBoundedString(value: string | null | undefined, maxLength: number): string {
    return (value ?? '').trim().slice(0, maxLength);
}

/**
 * Lit une date ISO (ou tout format accepté par `Date`).
 *
 * @param value - Valeur brute.
 * @returns La date, `null` si absente, ou `undefined` si invalide.
 */
export function parseDateParam(value: string | null | undefined): Date | null | undefined {
    if (value == null || value.trim() === '') return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * Échappe `\`, `%` et `_` pour un motif `LIKE … ESCAPE '\'`.
 *
 * @param value - Texte saisi par l'utilisateur.
 * @returns Le texte à insérer dans le motif, sans jokers actifs.
 */
export function escapeLikePattern(value: string): string {
    return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}
