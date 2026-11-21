// @vitest-environment node
import { createClient } from '@libsql/client';
import { describe, expect, it, vi } from 'vitest';
import { GitHubApiError, type GitHubAppClient } from './github/app-client';
import { appendJobLogs, getJob, insertJob, readJobLogs, updateJob, type JobDatabase } from './job-store.mjs';
import { JobRequestError, cancelRemoteJob, readRemoteJob, startRemoteJob, toJobErrorResponse } from './jobs';

function memoryDatabase(): JobDatabase {
    return createClient({ url: ':memory:' }) as unknown as JobDatabase;
}

function fakeClient(status = 204) {
    const request = vi.fn(async () => new Response(null, { status }));
    return { client: { repoPath: '/repos/o/r', request } as unknown as GitHubAppClient, request };
}

describe('startRemoteJob', () => {
    it('crée le job puis déclenche le workflow sur la branche de contenu', async () => {
        const database = memoryDatabase();
        const { client, request } = fakeClient();
        const job = await startRemoteJob({
            scriptId: 'update-exoplanets',
            actor: 'clodoweg',
            client,
            contentBranch: 'dev',
            database,
        });
        expect(job).toMatchObject({ scriptId: 'update-exoplanets', status: 'queued', actor: 'clodoweg' });
        expect(request).toHaveBeenCalledWith('/repos/o/r/actions/workflows/admin-job.yml/dispatches', {
            method: 'POST',
            body: JSON.stringify({ ref: 'dev', inputs: { job_id: job.id, script_id: 'update-exoplanets' } }),
        });
    });

    it.each(['mirror-r2', 'update-variable-stars', 'inconnu'])('refuse le script %s', async (scriptId) => {
        const error = await startRemoteJob({
            scriptId,
            actor: 'a',
            client: fakeClient().client,
            contentBranch: 'dev',
            database: memoryDatabase(),
        }).catch((e) => e);
        expect(error).toBeInstanceOf(JobRequestError);
        expect(error.status).toBe(400);
    });

    it('refuse un second job actif du même script', async () => {
        const database = memoryDatabase();
        const options = {
            scriptId: 'seo-check',
            actor: 'a',
            client: fakeClient().client,
            contentBranch: 'dev',
            database,
        };
        await startRemoteJob(options);
        await expect(startRemoteJob(options)).rejects.toMatchObject({ status: 409 });
    });

    it('marque le job en échec si GitHub refuse le déclenchement', async () => {
        const database = memoryDatabase();
        const error = await startRemoteJob({
            scriptId: 'seo-check',
            actor: 'a',
            client: fakeClient(403).client,
            contentBranch: 'dev',
            database,
        }).catch((e) => e);
        expect(error).toBeInstanceOf(GitHubApiError);
        const result = await database.execute('SELECT id, status FROM admin_jobs');
        expect(result.rows[0].status).toBe('failed');
        expect((await readJobLogs(database, String(result.rows[0].id)))[0].line).toContain('HTTP 403');
    });

    it('signale Turso absent', async () => {
        vi.resetModules();
        vi.doMock('@/lib/db', () => {
            throw new Error('TURSO_DATABASE_URL manquante');
        });
        const module = await import('./jobs');
        await expect(module.readRemoteJob('x', 0)).rejects.toMatchObject({ status: 503 });
        vi.doUnmock('@/lib/db');
    });
});

describe('readRemoteJob et cancelRemoteJob', () => {
    async function seed(status: string, runId: string | null) {
        const database = memoryDatabase();
        await insertJob(database, { id: 'j', scriptId: 'seo-check', actor: 'a', createdAt: 't' });
        await updateJob(database, 'j', { status, runId: runId ?? undefined });
        await appendJobLogs(database, 'j', [{ at: 't', stream: 'stdout', line: 'ligne' }]);
        return database;
    }

    it('relit le job et ses lignes, 404 sinon', async () => {
        const database = await seed('running', '7');
        expect(await readRemoteJob('j', 0, database)).toMatchObject({
            job: { status: 'running' },
            logs: [{ line: 'ligne' }],
        });
        await expect(readRemoteJob('absent', 0, database)).rejects.toMatchObject({ status: 404 });
    });

    it('annule le run démarré, ou seulement le job en attente', async () => {
        const running = await seed('running', '7');
        const { client, request } = fakeClient(202);
        expect((await cancelRemoteJob('j', client, running)).status).toBe('cancelled');
        expect(request).toHaveBeenCalledWith('/repos/o/r/actions/runs/7/cancel', { method: 'POST' });

        const queued = await seed('queued', null);
        const second = fakeClient();
        await cancelRemoteJob('j', second.client, queued);
        expect(second.request).not.toHaveBeenCalled();
        expect((await getJob(queued, 'j'))?.status).toBe('cancelled');
    });

    it('refuse un job terminé ou absent, et remonte un refus GitHub', async () => {
        await expect(cancelRemoteJob('j', fakeClient().client, await seed('succeeded', '7'))).rejects.toMatchObject({
            status: 409,
        });
        await expect(cancelRemoteJob('absent', fakeClient().client, await seed('running', null))).rejects.toMatchObject(
            { status: 404 },
        );
        await expect(cancelRemoteJob('j', fakeClient(500).client, await seed('running', '7'))).rejects.toBeInstanceOf(
            GitHubApiError,
        );
    });
});

describe('toJobErrorResponse', () => {
    it('traduit les erreurs connues et relance les autres', () => {
        expect(toJobErrorResponse(new JobRequestError(409, 'x')).status).toBe(409);
        vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(toJobErrorResponse(new GitHubApiError(403, 'x')).status).toBe(502);
        vi.restoreAllMocks();
        expect(() => toJobErrorResponse(new Error('autre'))).toThrow('autre');
    });
});
