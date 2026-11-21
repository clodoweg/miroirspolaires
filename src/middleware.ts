/**
 * Middleware Astro
 *
 * Responsabilité : protéger l'administration (`/admin/**`, `/api/admin/**`) et les routes de login
 * (`/api/auth/**`).
 *  1. Refuser (403) les requêtes inter-sites vers l'API admin et la déconnexion (le callback GitHub,
 *     navigation GET inter-sites par nature, est protégé par l'état signé et le PKCE).
 *  2. Décider de l'accès (`authorizeAdminRequest`) : `npm run dev` passe sans login ; la Preview de la
 *     branche de contenu exige la session GitHub de l'administrateur ; partout ailleurs, 404.
 *  3. Sur l'admin distant, n'ouvrir que les routes API de `remote-capabilities.ts` (501 sinon).
 *  4. Sur l'admin distant, plafonner les écritures (429) puis les journaliser (`audit-log.ts`).
 *  5. Déposer le verdict dans `locals.adminAccess`, revérifié par chaque page et chaque route.
 *
 * WARNING: `npm run dev` expose `/api/admin/**`, qui lance des scripts, écrit sur le disque, sur R2 et
 * dans Turso, parfois sur un simple GET (`/api/admin/scripts/run`, consommé par EventSource). Sans le
 * contrôle inter-sites, n'importe quelle page ouverte dans le navigateur pendant le dev pourrait
 * déclencher ces actions (CSRF par `<img src>` ou `fetch` en `no-cors`).
 *
 * POURQUOI ce middleware n'alourdit pas le site public : les pages prérendues ne le traversent pas à
 * l'exécution, et il rend la main immédiatement pour tout chemin hors administration.
 */

import { defineMiddleware } from 'astro:middleware';
import { authorizeAdminRequest } from './lib/admin/auth/access';
import { getAdminAccessMode, readRemoteAdminConfig } from './lib/admin/auth/config';
import { isCrossSiteRequest } from './lib/admin/cross-site';
import { isAvailableRemotely } from './lib/admin/remote-capabilities';
import {
    WRITE_RATE_LIMIT_PER_MINUTE,
    countAdminActionsSince,
    isAuditedRequest,
    recordAdminAction,
} from './lib/admin/audit-log';

const ADMIN_PAGE_RE = /^\/admin(\/|$)/;
const ADMIN_API_PREFIX = '/api/admin/';
const AUTH_API_PREFIX = '/api/auth/';

function withAdminHeaders(response: Response): Response {
    // POURQUOI : une réponse de redirection ou une réponse immuable lève sur `headers.set` ; on la recopie.
    const copy = new Response(response.body, response);
    copy.headers.set('X-Robots-Tag', 'noindex, nofollow');
    copy.headers.set('Cache-Control', 'private, no-store');
    return copy;
}

function jsonError(message: string, status: number): Response {
    return new Response(JSON.stringify({ error: message }), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

export const onRequest = defineMiddleware(async (context, next) => {
    const { pathname } = context.url;
    const isAdminApi = pathname.startsWith(ADMIN_API_PREFIX);
    const isAdminPage = ADMIN_PAGE_RE.test(pathname);
    const isAuthApi = pathname.startsWith(AUTH_API_PREFIX);

    // POURQUOI : le retour de GitHub vers `/api/auth/github/callback` est une navigation GET inter-sites ;
    // la refuser bloquerait tout login. Les GET de `/api/auth/**` n'ont pas d'effet sans l'état signé
    // (cookie + PKCE) ; seule la déconnexion (POST) reste soumise au contrôle inter-sites.
    const isGuardedAuthRequest = isAuthApi && context.request.method !== 'GET';
    if ((isAdminApi || isGuardedAuthRequest) && isCrossSiteRequest(context.request)) {
        return new Response('Forbidden', { status: 403 });
    }
    if (!isAdminApi && !isAdminPage) {
        return isAuthApi ? withAdminHeaders(await next()) : next();
    }

    const mode = getAdminAccessMode();
    const authorization = authorizeAdminRequest(
        context.request,
        mode,
        mode === 'remote' ? readRemoteAdminConfig(process.env) : null,
        Math.floor(Date.now() / 1000),
    );

    if (authorization.kind === 'not-found') return new Response('Not Found', { status: 404 });
    if (authorization.kind === 'unauthenticated') {
        if (isAdminApi) return withAdminHeaders(jsonError('Session requise', 401));
        const returnTo = encodeURIComponent(`${pathname}${context.url.search}`);
        return withAdminHeaders(
            new Response(null, { status: 302, headers: { Location: `/api/auth/github/login?returnTo=${returnTo}` } }),
        );
    }

    if (
        authorization.access.mode === 'remote' &&
        isAdminApi &&
        !isAvailableRemotely(context.request.method, pathname)
    ) {
        return withAdminHeaders(jsonError('Pas encore disponible sur l’admin distant.', 501));
    }

    // POURQUOI : à distance, chaque écriture est plafonnée puis journalisée (Turso) ; un cookie volé ou une
    // boucle côté client ne peut pas enchaîner des centaines de commits ou d'envois R2.
    const remoteActor = authorization.access.mode === 'remote' ? authorization.access.session.login : null;
    const isAuditedWrite = remoteActor !== null && isAuditedRequest(context.request.method, pathname);
    if (isAuditedWrite) {
        const since = new Date(Date.now() - 60_000).toISOString();
        const recentWrites = await countAdminActionsSince(remoteActor, since);
        if (recentWrites !== null && recentWrites >= WRITE_RATE_LIMIT_PER_MINUTE) {
            const limited = withAdminHeaders(
                jsonError('Trop d’écritures en une minute, réessayez dans un instant.', 429),
            );
            limited.headers.set('Retry-After', '60');
            return limited;
        }
    }

    if (context.locals) context.locals.adminAccess = authorization.access;
    const response = await next();
    if (isAuditedWrite) {
        await recordAdminAction({
            at: new Date().toISOString(),
            actor: remoteActor,
            method: context.request.method,
            path: pathname,
            status: response.status,
        });
    }
    return withAdminHeaders(response);
});
