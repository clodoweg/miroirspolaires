/**
 * Parcours de connexion de l'admin distant : début du login, retour de GitHub, déconnexion.
 *
 * Responsabilité : logique des routes `src/pages/api/auth/github/{login,callback,logout}.ts`, gardée
 * ici pour être testée sans Astro.
 *
 * WARNING: sécurité. Le callback vérifie l'état anti-CSRF (cookie signé, 10 min), le PKCE et
 * l'identifiant GitHub du compte avant d'émettre la session. Aucun détail d'erreur n'est renvoyé.
 */
import { errorResponse } from '@/lib/api/http';
import type { AdminAccessMode, RemoteAdminConfig } from './config';
import { buildAuthorizeUrl, exchangeCodeForIdentity, randomToken, sanitizeReturnTo } from './github-oauth';
import {
    ADMIN_SESSION_COOKIE,
    OAUTH_STATE_COOKIE,
    OAUTH_STATE_TTL_SECONDS,
    SESSION_TTL_SECONDS,
    buildCookieHeader,
    readCookie,
    signValue,
    verifySignedValue,
    type AdminSession,
    type OAuthState,
} from './session';

export const CALLBACK_PATH = '/api/auth/github/callback';

function redirect(location: string, cookies: string[] = []): Response {
    const headers = new Headers({ Location: location, 'Cache-Control': 'no-store' });
    for (const cookie of cookies) headers.append('Set-Cookie', cookie);
    return new Response(null, { status: 302, headers });
}

/**
 * Début du login : redirige vers GitHub avec un état et un vérificateur PKCE frais.
 *
 * @param url - URL de la requête (`?returnTo=/admin/...`).
 * @param mode - Mode d'accès de l'environnement.
 * @param config - Configuration de l'admin distant.
 * @param nowSeconds - Instant courant (secondes).
 * @returns La redirection (ou 404 hors admin distant, `/admin` en local).
 */
export function startLogin(
    url: URL,
    mode: AdminAccessMode,
    config: RemoteAdminConfig | null,
    nowSeconds: number,
): Response {
    if (mode === 'local') return redirect('/admin');
    if (mode !== 'remote' || !config) return errorResponse(404, 'Not Found');

    const oauthState: OAuthState = {
        state: randomToken(),
        codeVerifier: randomToken(48),
        returnTo: sanitizeReturnTo(url.searchParams.get('returnTo')),
        expiresAt: nowSeconds + OAUTH_STATE_TTL_SECONDS,
    };
    const authorizeUrl = buildAuthorizeUrl({
        clientId: config.clientId,
        redirectUri: `${url.origin}${CALLBACK_PATH}`,
        state: oauthState.state,
        codeVerifier: oauthState.codeVerifier,
    });
    return redirect(authorizeUrl, [
        buildCookieHeader(OAUTH_STATE_COOKIE, signValue(oauthState, config.sessionSecret), OAUTH_STATE_TTL_SECONDS),
    ]);
}

/**
 * Retour de GitHub : vérifie l'état, échange le code et ouvre la session de l'administrateur.
 *
 * @param request - Requête du callback (porte le cookie d'état).
 * @param url - URL du callback (`?code=…&state=…`).
 * @param mode - Mode d'accès de l'environnement.
 * @param config - Configuration de l'admin distant.
 * @param nowSeconds - Instant courant (secondes).
 * @param fetchImpl - `fetch` injectable (tests).
 * @returns La redirection vers l'admin avec le cookie de session, 400 si l'état est invalide,
 *   403 si le compte n'est pas l'administrateur, 502 si GitHub refuse l'échange.
 */
export async function completeLogin(
    request: Request,
    url: URL,
    mode: AdminAccessMode,
    config: RemoteAdminConfig | null,
    nowSeconds: number,
    fetchImpl?: typeof fetch,
): Promise<Response> {
    if (mode !== 'remote' || !config) return errorResponse(404, 'Not Found');

    const clearState = buildCookieHeader(OAUTH_STATE_COOKIE, '', 0);
    const saved = verifySignedValue<OAuthState>(
        readCookie(request, OAUTH_STATE_COOKIE),
        config.sessionSecret,
        nowSeconds,
    );
    const code = url.searchParams.get('code');
    if (!saved || !code || url.searchParams.get('state') !== saved.state) {
        return withCookie(errorResponse(400, 'Login expiré ou invalide, recommencez.'), clearState);
    }

    let identity;
    try {
        identity = await exchangeCodeForIdentity({
            clientId: config.clientId,
            clientSecret: config.clientSecret,
            code,
            redirectUri: `${url.origin}${CALLBACK_PATH}`,
            codeVerifier: saved.codeVerifier,
            fetchImpl,
        });
    } catch (error) {
        console.error('[admin-auth] échange OAuth', error);
        return withCookie(errorResponse(502, 'GitHub n’a pas confirmé la connexion.'), clearState);
    }

    if (identity.id !== config.adminUserId) {
        console.warn(`[admin-auth] connexion refusée pour le compte GitHub ${identity.id}`);
        return withCookie(errorResponse(403, 'Ce compte n’a pas accès à l’administration.'), clearState);
    }

    const session: AdminSession = {
        userId: identity.id,
        login: identity.login,
        expiresAt: nowSeconds + SESSION_TTL_SECONDS,
    };
    return redirect(sanitizeReturnTo(saved.returnTo), [
        clearState,
        buildCookieHeader(ADMIN_SESSION_COOKIE, signValue(session, config.sessionSecret), SESSION_TTL_SECONDS),
    ]);
}

/**
 * Déconnexion : efface la session et revient à l'accueil du site.
 *
 * @returns La redirection.
 */
export function logout(): Response {
    return redirect('/', [buildCookieHeader(ADMIN_SESSION_COOKIE, '', 0)]);
}

function withCookie(response: Response, cookie: string): Response {
    response.headers.append('Set-Cookie', cookie);
    return response;
}
