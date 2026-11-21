// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET as callback } from './callback';
import { GET as login } from './login';
import { POST as logout } from './logout';

type LoginContext = Parameters<typeof login>[0];

afterEach(() => vi.unstubAllEnvs());

describe('routes /api/auth/github', () => {
    it('login renvoie vers /admin en dev', async () => {
        vi.stubEnv('DEV', true);
        const url = new URL('http://localhost:4321/api/auth/github/login');
        const response = await login({ url, request: new Request(url) } as LoginContext);
        expect(response.headers.get('Location')).toBe('/admin');
    });

    it('login et callback répondent 404 hors admin distant', async () => {
        vi.stubEnv('DEV', false);
        vi.stubEnv('VERCEL_ENV', 'production');
        const url = new URL('https://www.miroirspolaires.fr/api/auth/github/callback?code=x&state=y');
        const context = { url, request: new Request(url) } as LoginContext;
        expect((await login(context)).status).toBe(404);
        expect((await callback(context)).status).toBe(404);
    });

    it('logout efface la session', async () => {
        const response = await logout({} as LoginContext);
        expect(response.status).toBe(302);
        expect(response.headers.get('Set-Cookie')).toContain('Max-Age=0');
    });
});
