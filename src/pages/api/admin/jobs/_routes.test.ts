// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const jobs = vi.hoisted(() => ({
    startRemoteJob: vi.fn(),
    readRemoteJob: vi.fn(),
    cancelRemoteJob: vi.fn(),
    getJobDatabase: vi.fn(),
}));
const store = vi.hoisted(() => ({ listJobs: vi.fn() }));
vi.mock('@/lib/admin/jobs', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/admin/jobs')>()),
    ...jobs,
}));
vi.mock('@/lib/admin/job-store.mjs', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/admin/job-store.mjs')>()),
    ...store,
}));

import { JobRequestError } from '@/lib/admin/jobs';
import { GET as getJobRoute } from './[id]';
import { POST as cancelRoute } from './[id]/cancel';
import { GET, POST } from './index';

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
const JOB_ID = '0f0e8a3c-1234-4abc-9def-0123456789ab';

function context(options: { body?: unknown; params?: Record<string, string>; search?: string } = {}) {
    const url = new URL(`http://x/api/admin/jobs${options.search ?? ''}`);
    const request = new Request(url, {
        method: options.body === undefined ? 'GET' : 'POST',
        body:
            options.body === undefined
                ? undefined
                : typeof options.body === 'string'
                  ? options.body
                  : JSON.stringify(options.body),
    });
    return { request, url, params: options.params ?? {}, locals: LOCALS } as unknown as Context;
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('DEV', false);
    for (const [key, value] of Object.entries(REMOTE_ENV)) vi.stubEnv(key, value);
});
afterEach(() => vi.unstubAllEnvs());

describe('/api/admin/jobs', () => {
    it('liste les scripts distants et les derniers jobs', async () => {
        jobs.getJobDatabase.mockResolvedValue({});
        store.listJobs.mockResolvedValue([{ id: JOB_ID }]);
        const body = await (await GET(context())).json();
        expect(body.jobs).toEqual([{ id: JOB_ID }]);
        expect(body.scripts.map((script: { id: string }) => script.id)).toContain('update-exoplanets');
        expect(body.scripts.map((script: { id: string }) => script.id)).not.toContain('mirror-r2');
    });

    it('signale Turso absent sans échouer', async () => {
        jobs.getJobDatabase.mockResolvedValue(null);
        const body = await (await GET(context())).json();
        expect(body.jobs).toEqual([]);
        expect(body.error).toContain('Turso');
    });

    it('lance un job au nom de l’administrateur', async () => {
        jobs.startRemoteJob.mockResolvedValue({ id: JOB_ID, status: 'queued' });
        const response = await POST(context({ body: { scriptId: 'seo-check' } }));
        expect(response.status).toBe(201);
        expect(jobs.startRemoteJob.mock.calls[0][0]).toMatchObject({
            scriptId: 'seo-check',
            actor: 'clodoweg',
            contentBranch: 'dev',
        });
    });

    it('refuse un corps invalide et traduit les refus', async () => {
        expect((await POST(context({ body: '{' }))).status).toBe(400);
        jobs.startRemoteJob.mockRejectedValue(new JobRequestError(409, 'déjà en cours'));
        expect((await POST(context({ body: { scriptId: 'seo-check' } }))).status).toBe(409);
    });

    it('répond 501 en local', async () => {
        vi.stubEnv('DEV', true);
        expect((await GET(context())).status).toBe(501);
        expect((await POST(context({ body: { scriptId: 'seo-check' } }))).status).toBe(501);
        expect((await getJobRoute(context({ params: { id: JOB_ID } }))).status).toBe(501);
        expect((await cancelRoute(context({ body: {}, params: { id: JOB_ID } }))).status).toBe(501);
    });
});

describe('/api/admin/jobs/[id]', () => {
    it('renvoie l’état et les lignes après le curseur', async () => {
        jobs.readRemoteJob.mockResolvedValue({ job: { id: JOB_ID }, logs: [] });
        await getJobRoute(context({ params: { id: JOB_ID }, search: '?after=12' }));
        expect(jobs.readRemoteJob).toHaveBeenCalledWith(JOB_ID, 12);
        await getJobRoute(context({ params: { id: JOB_ID }, search: '?after=-3' }));
        expect(jobs.readRemoteJob).toHaveBeenLastCalledWith(JOB_ID, 0);
    });

    it('refuse un identifiant invalide et traduit 404', async () => {
        expect((await getJobRoute(context({ params: { id: '../x' } }))).status).toBe(400);
        jobs.readRemoteJob.mockRejectedValue(new JobRequestError(404, 'Job introuvable.'));
        expect((await getJobRoute(context({ params: { id: JOB_ID } }))).status).toBe(404);
    });

    it('annule un job', async () => {
        jobs.cancelRemoteJob.mockResolvedValue({ id: JOB_ID, status: 'cancelled' });
        expect(await (await cancelRoute(context({ body: {}, params: { id: JOB_ID } }))).json()).toMatchObject({
            status: 'cancelled',
        });
        expect((await cancelRoute(context({ body: {}, params: { id: 'x' } }))).status).toBe(400);
        jobs.cancelRemoteJob.mockRejectedValue(new JobRequestError(409, 'terminé'));
        expect((await cancelRoute(context({ body: {}, params: { id: JOB_ID } }))).status).toBe(409);
    });
});
