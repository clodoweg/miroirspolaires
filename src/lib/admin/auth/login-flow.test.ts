// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RemoteAdminConfig } from './config';
import { buildAuthorizeUrl, pkceChallenge, sanitizeReturnTo, exchangeCodeForIdentity } from './github-oauth';
import { completeLogin, logout, startLogin } from './login-flow';
import { ADMIN_SESSION_COOKIE, OAUTH_STATE_COOKIE, readAdminSession, signValue } from './session';

const NOW = 1_800_000_000;
const CONFIG: RemoteAdminConfig = {
    contentBranch: 'dev',
    productionBranch: 'main',
    repository: { owner: 'clodoweg', name: 'miroirspolaires' },
    appId: '1',
    privateKey: 'unused',
    installationId: '2',
    clientId: 'Iv1.client',
    clientSecret: 'client-secret',
    adminUserId: 42,
    sessionSecret: 'k'.repeat(32),
};
const ORIGIN = 'https://dev.miroirspolaires.fr';

function githubFetch(identity: { id: number; login: string } | null, tokenOk = true) {
    return vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('access_token')) {
            return tokenOk
                ? Response.json({ access_token: 'user-token' })
                : Response.json({ error: 'bad_verification_code' });
        }
        return identity ? Response.json(identity) : new Response('nope', { status: 401 });
    }) as unknown as typeof fetch;
}

function callbackRequest(state: string, stateCookie: string | null) {
    const url = new URL(`${ORIGIN}/api/auth/github/callback?code=abc&state=${state}`);
    const headers: Record<string, string> = stateCookie ? { Cookie: `${OAUTH_STATE_COOKIE}=${stateCookie}` } : {};
    return { url, request: new Request(url, { headers }) };
}

function savedState(overrides: Partial<{ state: string; returnTo: string; expiresAt: number }> = {}) {
    return signValue(
        { state: 'st', codeVerifier: 'verifier', returnTo: '/admin/blog', expiresAt: NOW + 60, ...overrides },
        CONFIG.sessionSecret,
    );
}

afterEach(() => vi.restoreAllMocks());

describe('github-oauth', () => {
    it('construit l’URL d’autorisation avec état et PKCE S256', () => {
        const url = new URL(
            buildAuthorizeUrl({ clientId: 'cid', redirectUri: `${ORIGIN}/cb`, state: 'st', codeVerifier: 'v' }),
        );
        expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize');
        expect(url.searchParams.get('code_challenge')).toBe(pkceChallenge('v'));
        expect(url.searchParams.get('code_challenge_method')).toBe('S256');
        expect(url.searchParams.get('state')).toBe('st');
    });

    it.each([
        [null, '/admin'],
        ['/admin/blog', '/admin/blog'],
        ['/admin/blog?id=3', '/admin/blog?id=3'],
        ['https://evil.test/admin', '/admin'],
        ['//evil.test', '/admin'],
        ['/autre', '/admin'],
    ])('limite le retour après login (%s → %s)', (candidate, expected) => {
        expect(sanitizeReturnTo(candidate)).toBe(expected);
    });

    it('lève si GitHub ne renvoie pas d’identité', async () => {
        await expect(
            exchangeCodeForIdentity({
                clientId: 'c',
                clientSecret: 's',
                code: 'x',
                redirectUri: 'r',
                codeVerifier: 'v',
                fetchImpl: githubFetch(null),
            }),
        ).rejects.toThrow('Identité GitHub illisible');
    });
});

describe('startLogin', () => {
    it('redirige vers GitHub et pose le cookie d’état', () => {
        const response = startLogin(
            new URL(`${ORIGIN}/api/auth/github/login?returnTo=/admin/seo`),
            'remote',
            CONFIG,
            NOW,
        );
        expect(response.status).toBe(302);
        const location = new URL(response.headers.get('Location') ?? '');
        expect(location.host).toBe('github.com');
        expect(location.searchParams.get('redirect_uri')).toBe(`${ORIGIN}/api/auth/github/callback`);
        expect(response.headers.get('Set-Cookie')).toContain(`${OAUTH_STATE_COOKIE}=`);
    });

    it('renvoie vers /admin en local et 404 hors admin distant', () => {
        expect(startLogin(new URL(`${ORIGIN}/x`), 'local', null, NOW).headers.get('Location')).toBe('/admin');
        expect(startLogin(new URL(`${ORIGIN}/x`), 'disabled', CONFIG, NOW).status).toBe(404);
    });
});

describe('completeLogin', () => {
    it('ouvre la session de l’administrateur et revient à la page demandée', async () => {
        const { url, request } = callbackRequest('st', savedState());
        const response = await completeLogin(
            request,
            url,
            'remote',
            CONFIG,
            NOW,
            githubFetch({ id: 42, login: 'clodoweg' }),
        );
        expect(response.status).toBe(302);
        expect(response.headers.get('Location')).toBe('/admin/blog');
        const sessionCookie = response.headers
            .getSetCookie()
            .find((cookie) => cookie.startsWith(`${ADMIN_SESSION_COOKIE}=`))
            ?.split(';')[0];
        const session = readAdminSession(
            new Request(ORIGIN, { headers: { Cookie: sessionCookie ?? '' } }),
            CONFIG.sessionSecret,
            NOW,
        );
        expect(session).toMatchObject({ userId: 42, login: 'clodoweg' });
    });

    it('refuse (403) un autre compte GitHub', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { url, request } = callbackRequest('st', savedState());
        const response = await completeLogin(
            request,
            url,
            'remote',
            CONFIG,
            NOW,
            githubFetch({ id: 7, login: 'intrus' }),
        );
        expect(response.status).toBe(403);
        expect(response.headers.getSetCookie().some((c) => c.startsWith(`${ADMIN_SESSION_COOKIE}=`))).toBe(false);
    });

    it.each([
        ['état différent', 'autre', savedState()],
        ['cookie absent', 'st', null],
        ['cookie expiré', 'st', savedState({ expiresAt: NOW - 1 })],
    ])('refuse (400) un retour avec %s', async (_label, state, cookie) => {
        const { url, request } = callbackRequest(state, cookie);
        const fetchImpl = githubFetch({ id: 42, login: 'clodoweg' });
        const response = await completeLogin(request, url, 'remote', CONFIG, NOW, fetchImpl);
        expect(response.status).toBe(400);
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('répond 502 sans détail si GitHub refuse l’échange', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const { url, request } = callbackRequest('st', savedState());
        const response = await completeLogin(request, url, 'remote', CONFIG, NOW, githubFetch(null, false));
        expect(response.status).toBe(502);
        expect(await response.text()).not.toContain('bad_verification_code');
    });

    it('répond 404 hors admin distant', async () => {
        const { url, request } = callbackRequest('st', savedState());
        expect((await completeLogin(request, url, 'disabled', CONFIG, NOW)).status).toBe(404);
    });
});

describe('logout', () => {
    it('efface la session', () => {
        const response = logout();
        expect(response.status).toBe(302);
        expect(response.headers.get('Set-Cookie')).toContain(`${ADMIN_SESSION_COOKIE}=; Path=/; Max-Age=0`);
    });
});
