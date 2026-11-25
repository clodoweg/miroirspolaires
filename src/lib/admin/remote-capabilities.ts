/**
 * Routes de l'API admin ouvertes sur l'admin distant (Preview de la branche de contenu).
 *
 * Responsabilité : liste blanche, appliquée par `src/middleware.ts`, des routes `/api/admin/**` qui
 * savent fonctionner sans disque de travail ni processus local. Toute autre route répond 501 à distance.
 *
 * WARNING: sécurité. Refus par défaut : une route n'est ajoutée ici qu'une fois portée sur les
 * abstractions distantes (lecture par `getContentReader()`, écriture par `getContentWriter()`, qui
 * committe sur la branche de contenu). Jamais de route qui écrit sur le disque ou lance un processus.
 */

interface RemoteRoute {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    pattern: RegExp;
}

const YEAR_SLUG = String.raw`\d{4}/[a-z0-9][a-z0-9-]*`;
// POURQUOI : `sync` est exclu (synchronisation depuis le disque local) ; aligné sur `validateFilename`.
const IMAGE_FILE = String.raw`(?!sync$)[A-Za-z0-9._~-]+`;

export const REMOTE_ADMIN_API_ROUTES: readonly RemoteRoute[] = [
    { method: 'GET', pattern: /^\/api\/admin\/posts\/?$/ },
    { method: 'POST', pattern: /^\/api\/admin\/posts\/?$/ },
    { method: 'GET', pattern: new RegExp(`^/api/admin/posts/${YEAR_SLUG}/?$`) },
    { method: 'PUT', pattern: new RegExp(`^/api/admin/posts/${YEAR_SLUG}/?$`) },
    { method: 'DELETE', pattern: new RegExp(`^/api/admin/posts/${YEAR_SLUG}/?$`) },
    { method: 'GET', pattern: /^\/api\/admin\/voyages\/?$/ },
    { method: 'POST', pattern: /^\/api\/admin\/voyages\/?$/ },
    { method: 'GET', pattern: new RegExp(`^/api/admin/voyages/${YEAR_SLUG}/?$`) },
    { method: 'PUT', pattern: new RegExp(`^/api/admin/voyages/${YEAR_SLUG}/?$`) },
    { method: 'DELETE', pattern: new RegExp(`^/api/admin/voyages/${YEAR_SLUG}/?$`) },
    { method: 'GET', pattern: new RegExp(`^/api/admin/(images|voyages-images)/${YEAR_SLUG}/?$`) },
    { method: 'GET', pattern: new RegExp(`^/api/admin/(images|voyages-images)/${YEAR_SLUG}/${IMAGE_FILE}$`) },
    { method: 'PUT', pattern: new RegExp(`^/api/admin/(images|voyages-images)/${YEAR_SLUG}/${IMAGE_FILE}$`) },
    { method: 'DELETE', pattern: new RegExp(`^/api/admin/(images|voyages-images)/${YEAR_SLUG}/${IMAGE_FILE}$`) },
    { method: 'POST', pattern: /^\/api\/admin\/uploads\/?$/ },
    { method: 'POST', pattern: /^\/api\/admin\/uploads\/finalize\/?$/ },
    { method: 'GET', pattern: /^\/api\/admin\/lighthouse\/report\/?$/ },
    { method: 'GET', pattern: /^\/api\/admin\/upstream\/?$/ },
    { method: 'PUT', pattern: /^\/api\/admin\/upstream\/?$/ },
    { method: 'GET', pattern: /^\/api\/admin\/cache\/status\/?$/ },
    { method: 'GET', pattern: /^\/api\/admin\/diagnostics\/?$/ },
    { method: 'GET', pattern: /^\/api\/admin\/content-gaps\/?$/ },
    { method: 'GET', pattern: /^\/api\/admin\/database\/stats\/?$/ },
    { method: 'GET', pattern: /^\/api\/admin\/astrophotos\/recent\/?$/ },
    { method: 'POST', pattern: /^\/api\/admin\/astrophotos\/update\/?$/ },
    { method: 'GET', pattern: /^\/api\/admin\/release\/?$/ },
    { method: 'POST', pattern: /^\/api\/admin\/release\/?$/ },
    { method: 'POST', pattern: /^\/api\/admin\/release\/merge\/?$/ },
    { method: 'GET', pattern: /^\/api\/admin\/jobs\/?$/ },
    { method: 'POST', pattern: /^\/api\/admin\/jobs\/?$/ },
    { method: 'GET', pattern: /^\/api\/admin\/jobs\/[0-9a-f-]{36}\/?$/ },
    { method: 'POST', pattern: /^\/api\/admin\/jobs\/[0-9a-f-]{36}\/cancel\/?$/ },
];

/**
 * Indique si une route de l'API admin est disponible sur l'admin distant.
 *
 * @param method - Méthode HTTP.
 * @param pathname - Chemin de la requête.
 * @returns `true` si la route figure dans la liste blanche.
 */
export function isAvailableRemotely(method: string, pathname: string): boolean {
    const normalizedMethod = method === 'HEAD' ? 'GET' : method;
    return REMOTE_ADMIN_API_ROUTES.some((route) => route.method === normalizedMethod && route.pattern.test(pathname));
}
