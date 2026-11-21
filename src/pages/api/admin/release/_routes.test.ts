// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const release = vi.hoisted(() => ({
    getReleaseStatus: vi.fn(),
    openReleasePullRequest: vi.fn(),
    mergeReleasePullRequest: vi.fn(),
}));
vi.mock('@/lib/admin/github/release', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/admin/github/release')>()),
    ...release,
}));

import { ReleaseNotReadyError } from '@/lib/admin/github/release';
import { GET, POST } from './index';
import { POST as merge } from './merge';

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
const LOCALS = { adminAccess: { mode: 'remote' as const, session: { userId: 42, login: 'clodoweg', expiresAt: 0 } } };
const HEAD = 'a'.repeat(40);

function context(body?: unknown) {
    const request = new Request('http://x/api/admin/release', {
        method: body === undefined ? 'GET' : 'POST',
        body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    return { request, locals: LOCALS } as unknown as Context;
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('DEV', false);
    for (const [key, value] of Object.entries(REMOTE_ENV)) vi.stubEnv(key, value);
});
afterEach(() => vi.unstubAllEnvs());

describe('/api/admin/release', () => {
    it('renvoie l’état et ouvre la PR au nom de l’administrateur', async () => {
        release.getReleaseStatus.mockResolvedValue({ ahead: 3 });
        expect(await (await GET(context())).json()).toEqual({ ahead: 3 });
        expect(release.getReleaseStatus.mock.calls[0][1]).toEqual({ contentBranch: 'dev', productionBranch: 'main' });
        release.openReleasePullRequest.mockResolvedValue({ number: 7 });
        expect(await (await POST(context({}))).json()).toEqual({ number: 7 });
        expect(release.openReleasePullRequest.mock.calls[0][2]).toBe('clodoweg');
    });

    it('traduit les refus', async () => {
        release.openReleasePullRequest.mockRejectedValue(new ReleaseNotReadyError('Rien à mettre en production.'));
        expect((await POST(context({}))).status).toBe(409);
        release.getReleaseStatus.mockRejectedValue(new ReleaseNotReadyError('x'));
        expect((await GET(context())).status).toBe(409);
    });

    it('répond 501 en local', async () => {
        vi.stubEnv('DEV', true);
        expect((await GET(context())).status).toBe(501);
        expect((await POST(context({}))).status).toBe(501);
        expect((await merge(context({ pullNumber: 7, headSha: HEAD }))).status).toBe(501);
    });
});

describe('/api/admin/release/merge', () => {
    it('fusionne avec la tête attendue', async () => {
        release.mergeReleasePullRequest.mockResolvedValue({ sha: 'm' });
        expect(await (await merge(context({ pullNumber: 7, headSha: HEAD }))).json()).toEqual({ ok: true, sha: 'm' });
        expect(release.mergeReleasePullRequest.mock.calls[0].slice(1)).toEqual([7, HEAD]);
    });

    it.each([{ pullNumber: 'x', headSha: HEAD }, { pullNumber: 7, headSha: 'court' }, '{'])(
        'refuse %j',
        async (body) => {
            expect((await merge(context(body))).status).toBe(400);
            expect(release.mergeReleasePullRequest).not.toHaveBeenCalled();
        },
    );

    it('traduit un refus de fusion', async () => {
        release.mergeReleasePullRequest.mockRejectedValue(new ReleaseNotReadyError('CI'));
        expect((await merge(context({ pullNumber: 7, headSha: HEAD }))).status).toBe(409);
    });
});
