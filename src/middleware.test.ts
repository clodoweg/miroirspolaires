// @vitest-environment node
import { afterEach, describe, it, expect, vi } from 'vitest';

const audit = vi.hoisted(() => ({ countAdminActionsSince: vi.fn(), recordAdminAction: vi.fn() }));
vi.mock('./lib/admin/audit-log', async (importOriginal) => ({
    ...(await importOriginal<typeof import('./lib/admin/audit-log')>()),
    ...audit,
}));

import { onRequest } from './middleware';
import { ADMIN_SESSION_COOKIE, signValue } from './lib/admin/auth/session';

type Context = { url: URL; request: Request; locals: App.Locals };
type Handler = (context: Context, next: () => Promise<Response>) => Response | Promise<Response>;

const SESSION_SECRET = 'k'.repeat(32);
const REMOTE_ENV: Record<string, string> = {
    VERCEL_ENV: 'preview',
    VERCEL_GIT_COMMIT_REF: 'dev',
    VERCEL_GIT_REPO_OWNER: 'clodoweg',
    VERCEL_GIT_REPO_SLUG: 'miroirspolaires',
    GITHUB_APP_ID: '1',
    GITHUB_APP_PRIVATE_KEY: 'pem',
    GITHUB_APP_INSTALLATION_ID: '2',
    GITHUB_APP_CLIENT_ID: 'c',
    GITHUB_APP_CLIENT_SECRET: 's',
    ADMIN_GITHUB_USER_ID: '42',
    ADMIN_SESSION_SECRET: SESSION_SECRET,
};

function run(path: string, headers: Record<string, string> = {}, method = 'GET') {
    const url = new URL(`https://dev.miroirspolaires.fr${path}`);
    const next = vi.fn(async () => new Response('ok'));
    const locals: App.Locals = {};
    const result = (onRequest as unknown as Handler)(
        { url, request: new Request(url, { headers, method }), locals },
        next,
    );
    return { result: Promise.resolve(result), next, locals };
}

function sessionCookie(userId = 42): Record<string, string> {
    const value = signValue(
        { userId, login: 'clodoweg', expiresAt: Math.floor(Date.now() / 1000) + 600 },
        SESSION_SECRET,
    );
    return { Cookie: `${ADMIN_SESSION_COOKIE}=${value}`, 'Sec-Fetch-Site': 'same-origin' };
}

function stubRemote(overrides: Record<string, string> = {}) {
    vi.stubEnv('DEV', false);
    for (const [key, value] of Object.entries({ ...REMOTE_ENV, ...overrides })) vi.stubEnv(key, value);
}

afterEach(() => {
    vi.unstubAllEnvs();
    audit.countAdminActionsSince.mockReset();
    audit.recordAdminAction.mockReset();
});

describe('middleware : contrôle inter-sites', () => {
    it('refuse un déclenchement inter-sites de l’API admin et des routes de login', async () => {
        const { result, next } = run('/api/admin/scripts/run?id=sync-r2', { 'Sec-Fetch-Site': 'cross-site' });
        expect((await result).status).toBe(403);
        expect(next).not.toHaveBeenCalled();
        expect((await run('/api/auth/github/logout', { 'Sec-Fetch-Site': 'cross-site' }, 'POST').result).status).toBe(
            403,
        );
    });

    it('laisse passer le retour de GitHub, navigation GET inter-sites', async () => {
        vi.stubEnv('DEV', true);
        const { result, next } = run('/api/auth/github/callback?code=x&state=y', {
            'Sec-Fetch-Site': 'cross-site',
            'Sec-Fetch-Mode': 'navigate',
        });
        expect((await result).status).toBe(200);
        expect(next).toHaveBeenCalled();
    });

    it('laisse passer l’admin same-origin en dev et le reste du site', async () => {
        vi.stubEnv('DEV', true);
        const admin = run('/api/admin/scripts/run?id=x', { 'Sec-Fetch-Site': 'same-origin' });
        expect((await admin.result).status).toBe(200);
        expect(admin.locals.adminAccess).toEqual({ mode: 'local' });
        const publicRoute = run('/api/recommendations', { 'Sec-Fetch-Site': 'cross-site' });
        expect((await publicRoute.result).status).toBe(200);
        expect((await publicRoute.result).headers.get('X-Robots-Tag')).toBeNull();
    });

    it('marque les réponses de l’admin noindex et non cachables', async () => {
        vi.stubEnv('DEV', true);
        const response = await run('/admin').result;
        expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
        expect((await run('/api/auth/github/login').result).headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    });
});

describe('middleware : production et autres Previews', () => {
    it('répond 404 en production, même avec une session valide', async () => {
        stubRemote({ VERCEL_ENV: 'production' });
        for (const path of ['/admin', '/admin/blog', '/api/admin/posts']) {
            const { result, next } = run(path, sessionCookie());
            expect((await result).status).toBe(404);
            expect(next).not.toHaveBeenCalled();
        }
    });

    it('répond 404 sur la Preview d’une autre branche', async () => {
        stubRemote({ VERCEL_GIT_COMMIT_REF: 'feature' });
        expect((await run('/admin', sessionCookie()).result).status).toBe(404);
    });
});

describe('middleware : admin distant (Preview de dev)', () => {
    it('redirige une page sans session vers le login GitHub', async () => {
        stubRemote();
        const response = await run('/admin/blog?x=1').result;
        expect(response.status).toBe(302);
        expect(response.headers.get('Location')).toBe(
            `/api/auth/github/login?returnTo=${encodeURIComponent('/admin/blog?x=1')}`,
        );
    });

    it('répond 401 à l’API sans session ou avec un autre compte', async () => {
        stubRemote();
        expect((await run('/api/admin/posts').result).status).toBe(401);
        expect((await run('/api/admin/posts', sessionCookie(7)).result).status).toBe(401);
    });

    it('sert les pages et les routes en lecture à l’administrateur', async () => {
        stubRemote();
        const page = run('/admin', sessionCookie());
        expect((await page.result).status).toBe(200);
        expect(page.locals.adminAccess).toMatchObject({ mode: 'remote', session: { userId: 42 } });
        expect((await run('/api/admin/posts/2026/aurores', sessionCookie()).result).status).toBe(200);
    });

    it('sert une page admin ouverte depuis un lien externe, mais pas l’API', async () => {
        stubRemote();
        const external = { ...sessionCookie(), 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'navigate' };
        expect((await run('/admin/publication/diagnostic', external).result).status).toBe(200);
        expect((await run('/api/admin/diagnostics', external).result).status).toBe(403);
    });

    it('répond 501 aux écritures et aux routes non portées', async () => {
        stubRemote();
        for (const [path, method] of [
            ['/api/admin/images/2026/aurores', 'POST'],
            ['/api/admin/scripts/run?id=update-exoplanets', 'GET'],
            ['/api/admin/r2/status', 'GET'],
        ]) {
            const { result, next } = run(path, sessionCookie(), method);
            expect((await result).status, `${method} ${path}`).toBe(501);
            expect(next).not.toHaveBeenCalled();
        }
    });
});

describe('middleware : journal et limitation des écritures distantes', () => {
    it('journalise une écriture distante avec son résultat, pas une lecture', async () => {
        stubRemote();
        audit.countAdminActionsSince.mockResolvedValue(3);
        const write = run('/api/admin/posts/2026/aurores', sessionCookie(), 'PUT');
        expect((await write.result).status).toBe(200);
        expect(audit.recordAdminAction).toHaveBeenCalledWith(
            expect.objectContaining({
                actor: 'clodoweg',
                method: 'PUT',
                path: '/api/admin/posts/2026/aurores',
                status: 200,
            }),
        );
        audit.recordAdminAction.mockClear();
        await run('/api/admin/posts', sessionCookie()).result;
        expect(audit.recordAdminAction).not.toHaveBeenCalled();
        expect(audit.countAdminActionsSince).toHaveBeenCalledTimes(1);
    });

    it('répond 429 au-delà du plafond, sans exécuter la route', async () => {
        stubRemote();
        audit.countAdminActionsSince.mockResolvedValue(120);
        const { result, next } = run('/api/admin/posts/2026/aurores', sessionCookie(), 'PUT');
        const response = await result;
        expect(response.status).toBe(429);
        expect(response.headers.get('Retry-After')).toBe('60');
        expect(next).not.toHaveBeenCalled();
        expect(audit.recordAdminAction).not.toHaveBeenCalled();
    });

    it('laisse passer si le compteur est indisponible, et ne journalise rien en local', async () => {
        stubRemote();
        audit.countAdminActionsSince.mockResolvedValue(null);
        expect((await run('/api/admin/posts/2026/aurores', sessionCookie(), 'PUT').result).status).toBe(200);
        audit.recordAdminAction.mockClear();
        vi.unstubAllEnvs();
        vi.stubEnv('DEV', true);
        await run('/api/admin/posts/2026/aurores', { 'Sec-Fetch-Site': 'same-origin' }, 'PUT').result;
        expect(audit.recordAdminAction).not.toHaveBeenCalled();
    });
});
