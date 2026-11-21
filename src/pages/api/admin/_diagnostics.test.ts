// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ diagnose: vi.fn() }));
vi.mock('@/lib/admin/github/diagnostics', () => ({ diagnoseRemoteAccess: mocks.diagnose }));

import { GET } from './diagnostics';

type Context = Parameters<typeof GET>[0];

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
    ADMIN_SESSION_SECRET: 'x'.repeat(32),
};

afterEach(() => {
    vi.unstubAllEnvs();
    mocks.diagnose.mockReset();
});

describe('GET /api/admin/diagnostics', () => {
    it('signale le mode local en dev', async () => {
        vi.stubEnv('DEV', true);
        const response = await GET({ locals: {} } as Context);
        expect(await response.json()).toEqual({ mode: 'local', ok: true, steps: [] });
    });

    it('répond 404 sans accès accordé hors dev', async () => {
        vi.stubEnv('DEV', false);
        expect((await GET({ locals: {} } as Context)).status).toBe(404);
    });

    it('renvoie le diagnostic distant, 503 en cas d’échec', async () => {
        vi.stubEnv('DEV', false);
        for (const [key, value] of Object.entries(REMOTE_ENV)) vi.stubEnv(key, value);
        const locals = { adminAccess: { mode: 'remote' as const, session: { userId: 42, login: 'a', expiresAt: 0 } } };
        mocks.diagnose.mockResolvedValueOnce({
            repository: 'clodoweg/miroirspolaires',
            branch: 'dev',
            ok: false,
            steps: [],
        });
        const response = await GET({ locals } as Context);
        expect(response.status).toBe(503);
        expect(await response.json()).toMatchObject({ mode: 'remote', ok: false, branch: 'dev' });
        mocks.diagnose.mockResolvedValueOnce({ repository: 'r', branch: 'dev', ok: true, steps: [] });
        expect((await GET({ locals } as Context)).status).toBe(200);
    });
});
