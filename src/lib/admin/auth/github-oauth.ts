/**
 * Login GitHub de l'admin distant (OAuth utilisateur de la GitHub App).
 *
 * Responsabilité : produire l'URL d'autorisation (état + PKCE), échanger le code contre un jeton
 * utilisateur et lire l'identité du compte. Le jeton utilisateur n'est jamais conservé : il sert
 * seulement à connaître l'identifiant GitHub, comparé ensuite à `ADMIN_GITHUB_USER_ID`.
 */
import { createHash, randomBytes } from 'node:crypto';

const AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const USER_URL = 'https://api.github.com/user';

export interface GitHubIdentity {
    id: number;
    login: string;
}

/**
 * Génère une valeur aléatoire sûre pour une URL.
 *
 * @param bytes - Nombre d'octets aléatoires.
 * @returns La valeur en base64url.
 */
export function randomToken(bytes = 32): string {
    return randomBytes(bytes).toString('base64url');
}

/**
 * Calcule le `code_challenge` PKCE (S256) d'un vérificateur.
 *
 * @param codeVerifier - Vérificateur PKCE.
 * @returns Le challenge en base64url.
 */
export function pkceChallenge(codeVerifier: string): string {
    return createHash('sha256').update(codeVerifier).digest('base64url');
}

/**
 * Construit l'URL d'autorisation GitHub.
 *
 * @param options - Client OAuth, URL de retour, état anti-CSRF et vérificateur PKCE.
 * @returns L'URL vers laquelle rediriger le navigateur.
 */
export function buildAuthorizeUrl(options: {
    clientId: string;
    redirectUri: string;
    state: string;
    codeVerifier: string;
}): string {
    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set('client_id', options.clientId);
    url.searchParams.set('redirect_uri', options.redirectUri);
    url.searchParams.set('state', options.state);
    url.searchParams.set('code_challenge', pkceChallenge(options.codeVerifier));
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('allow_signup', 'false');
    return url.toString();
}

/**
 * Échange le code d'autorisation et renvoie l'identité GitHub du compte connecté.
 *
 * @param options - Client OAuth, code reçu, URL de retour, vérificateur PKCE et `fetch` (injectable).
 * @returns L'identifiant numérique et le login GitHub.
 * @throws Si GitHub refuse l'échange ou ne renvoie pas d'identité.
 */
export async function exchangeCodeForIdentity(options: {
    clientId: string;
    clientSecret: string;
    code: string;
    redirectUri: string;
    codeVerifier: string;
    fetchImpl?: typeof fetch;
}): Promise<GitHubIdentity> {
    const fetchImpl = options.fetchImpl ?? fetch;
    const tokenResponse = await fetchImpl(TOKEN_URL, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
            client_id: options.clientId,
            client_secret: options.clientSecret,
            code: options.code,
            redirect_uri: options.redirectUri,
            code_verifier: options.codeVerifier,
        }),
    });
    const tokenBody = (await tokenResponse.json().catch(() => null)) as {
        access_token?: string;
        error?: string;
    } | null;
    if (!tokenResponse.ok || !tokenBody?.access_token) {
        throw new Error(`Échange OAuth refusé : ${tokenBody?.error ?? tokenResponse.status}`);
    }

    const userResponse = await fetchImpl(USER_URL, {
        headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${tokenBody.access_token}`,
            'X-GitHub-Api-Version': '2022-11-28',
        },
    });
    const user = (await userResponse.json().catch(() => null)) as { id?: unknown; login?: unknown } | null;
    if (!userResponse.ok || typeof user?.id !== 'number' || typeof user.login !== 'string') {
        throw new Error(`Identité GitHub illisible (${userResponse.status})`);
    }
    return { id: user.id, login: user.login };
}

/**
 * Restreint la page de retour après login aux pages de l'admin.
 *
 * WARNING: sécurité. Empêche une redirection ouverte (`?returnTo=https://…` ou `//autre-site`).
 *
 * @param candidate - Valeur fournie dans l'URL.
 * @returns Un chemin `/admin…` sûr, `/admin` par défaut.
 */
export function sanitizeReturnTo(candidate: string | null): string {
    if (!candidate || !/^\/admin(\/[A-Za-z0-9/_-]*)?(\?[A-Za-z0-9=&_%-]*)?$/.test(candidate)) return '/admin';
    return candidate;
}
