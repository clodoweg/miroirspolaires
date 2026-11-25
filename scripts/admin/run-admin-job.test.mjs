// @vitest-environment node
import { EventEmitter } from 'node:events';
import { createClient } from '@libsql/client';
import { describe, expect, it, vi } from 'vitest';
import { getJob, insertJob, readJobLogs, updateJob } from '../../src/lib/admin/job-store.mjs';
import { finalizeAdminJob, runAdminJob } from './run-admin-job.mjs';

const SCRIPTS = {
    'seo-check': { id: 'seo-check', command: 'node', args: ['scripts/audit/seo-coverage.mjs'], remote: true },
    'mirror-r2': { id: 'mirror-r2', command: 'node', args: ['x'], devOnly: true },
};
const getScript = (id) => SCRIPTS[id];
const now = () => '2026-11-11T10:00:00.000Z';

async function seed(scriptId = 'seo-check', status = 'queued') {
    const database = createClient({ url: ':memory:' });
    await insertJob(database, { id: 'job', scriptId, actor: 'a', createdAt: now() });
    if (status !== 'queued') await updateJob(database, 'job', { status });
    return database;
}

function fakeSpawn({ stdout = [], stderr = [], code = 0, error = null }) {
    return vi.fn(() => {
        const child = new EventEmitter();
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        setTimeout(() => {
            for (const chunk of stdout) child.stdout.emit('data', Buffer.from(chunk));
            for (const chunk of stderr) child.stderr.emit('data', Buffer.from(chunk));
            if (error) child.emit('error', error);
            else child.emit('close', code);
        }, 5);
        return child;
    });
}

describe('runAdminJob', () => {
    it('lance le script figé, journalise sa sortie ligne à ligne et note le succès', async () => {
        vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
        vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
        const database = await seed();
        const spawnImpl = fakeSpawn({ stdout: ['ligne 1\nlig', 'ne 2\nfin sans retour'], stderr: ['attention\n'] });
        const code = await runAdminJob({
            jobId: 'job',
            scriptId: 'seo-check',
            database,
            getScript,
            spawnImpl,
            now,
            runId: '99',
            flushIntervalMs: 1,
        });
        expect(code).toBe(0);
        expect(spawnImpl).toHaveBeenCalledWith(
            'node',
            ['scripts/audit/seo-coverage.mjs'],
            expect.objectContaining({ env: expect.objectContaining({ FORCE_COLOR: '0' }) }),
        );
        const lines = (await readJobLogs(database, 'job')).map((line) => `${line.stream}:${line.line}`);
        expect(lines).toEqual([
            'system:$ node scripts/audit/seo-coverage.mjs',
            'stdout:ligne 1',
            'stdout:ligne 2',
            'stderr:attention',
            'stdout:fin sans retour',
            'system:Code de sortie : 0',
        ]);
        expect(await getJob(database, 'job')).toMatchObject({ status: 'succeeded', exitCode: 0, runId: '99' });
        vi.restoreAllMocks();
    });

    it('ajoute les options du job après revalidation, ou refuse le job', async () => {
        vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
        const database = createClient({ url: ':memory:' });
        await insertJob(database, {
            id: 'job',
            scriptId: 'seo-check',
            actor: 'a',
            createdAt: now(),
            options: { x: 1 },
        });
        const spawnImpl = fakeSpawn({});
        const buildScriptArgs = vi.fn(() => ['--missing']);
        expect(
            await runAdminJob({
                jobId: 'job',
                scriptId: 'seo-check',
                database,
                getScript,
                buildScriptArgs,
                spawnImpl,
                now,
            }),
        ).toBe(0);
        expect(buildScriptArgs).toHaveBeenCalledWith(SCRIPTS['seo-check'], { x: 1 });
        expect(spawnImpl).toHaveBeenCalledWith(
            'node',
            ['scripts/audit/seo-coverage.mjs', '--missing'],
            expect.anything(),
        );

        const refused = createClient({ url: ':memory:' });
        await insertJob(refused, { id: 'job', scriptId: 'seo-check', actor: 'a', createdAt: now(), options: { x: 1 } });
        const spawnRefused = fakeSpawn({});
        const reject = () => {
            throw new Error('Option inconnue : x');
        };
        expect(
            await runAdminJob({
                jobId: 'job',
                scriptId: 'seo-check',
                database: refused,
                getScript,
                buildScriptArgs: reject,
                spawnImpl: spawnRefused,
                now,
            }),
        ).toBe(1);
        expect(spawnRefused).not.toHaveBeenCalled();
        expect((await readJobLogs(refused, 'job')).map((line) => line.line)).toEqual([
            'Options refusées : Option inconnue : x',
        ]);
        expect(await getJob(refused, 'job')).toMatchObject({ status: 'failed', exitCode: 1 });
        vi.restoreAllMocks();
    });

    it('note l’échec du script ou de son lancement', async () => {
        const failing = await seed();
        expect(
            await runAdminJob({
                jobId: 'job',
                scriptId: 'seo-check',
                database: failing,
                getScript,
                spawnImpl: fakeSpawn({ code: 2 }),
                now,
            }),
        ).toBe(2);
        expect((await getJob(failing, 'job'))?.status).toBe('failed');

        const broken = await seed();
        expect(
            await runAdminJob({
                jobId: 'job',
                scriptId: 'seo-check',
                database: broken,
                getScript,
                spawnImpl: fakeSpawn({ error: new Error('ENOENT') }),
                now,
            }),
        ).toBe(1);
        expect((await readJobLogs(broken, 'job')).some((line) => line.line.includes('ENOENT'))).toBe(true);
    });

    it.each([
        ['un script non distant', 'mirror-r2', 'mirror-r2'],
        ['un script différent de celui du job', 'seo-check', 'mirror-r2'],
    ])('refuse %s sans rien lancer', async (_label, jobScript, requested) => {
        const database = await seed(jobScript);
        const spawnImpl = fakeSpawn({});
        expect(await runAdminJob({ jobId: 'job', scriptId: requested, database, getScript, spawnImpl, now })).toBe(1);
        expect(spawnImpl).not.toHaveBeenCalled();
        expect((await getJob(database, 'job'))?.status).toBe('failed');
    });

    it('ne lance pas un job déjà annulé, et refuse un job inconnu', async () => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        const spawnImpl = fakeSpawn({});
        expect(
            await runAdminJob({
                jobId: 'job',
                scriptId: 'seo-check',
                database: await seed('seo-check', 'cancelled'),
                getScript,
                spawnImpl,
                now,
            }),
        ).toBe(0);
        expect(
            await runAdminJob({
                jobId: 'job',
                scriptId: 'seo-check',
                database: await seed('seo-check', 'running'),
                getScript,
                spawnImpl,
                now,
            }),
        ).toBe(1);
        expect(spawnImpl).not.toHaveBeenCalled();
        await expect(
            runAdminJob({ jobId: 'absent', scriptId: 'seo-check', database: await seed(), getScript, now }),
        ).rejects.toThrow('Job inconnu');
        vi.restoreAllMocks();
    });
});

describe('finalizeAdminJob', () => {
    it('note le commit et garde le succès', async () => {
        const database = await seed('seo-check', 'succeeded');
        await finalizeAdminJob({ jobId: 'job', outcome: 'success', commitSha: 'abc123', database, now });
        expect(await getJob(database, 'job')).toMatchObject({ status: 'succeeded', commitSha: 'abc123' });
        expect((await readJobLogs(database, 'job'))[0].line).toContain('abc123');
    });

    it('termine un job resté actif, et note l’échec ou l’annulation du workflow', async () => {
        const stuck = await seed('seo-check', 'running');
        await finalizeAdminJob({ jobId: 'job', outcome: 'success', database: stuck, now });
        expect((await getJob(stuck, 'job'))?.status).toBe('succeeded');

        const failed = await seed('seo-check', 'succeeded');
        await finalizeAdminJob({ jobId: 'job', outcome: 'failure', database: failed, now });
        expect((await getJob(failed, 'job'))?.status).toBe('failed');

        const cancelled = await seed('seo-check', 'running');
        await finalizeAdminJob({ jobId: 'job', outcome: 'cancelled', database: cancelled, now });
        expect((await getJob(cancelled, 'job'))?.status).toBe('cancelled');

        await expect(
            finalizeAdminJob({ jobId: 'absent', outcome: 'success', database: await seed(), now }),
        ).rejects.toThrow('Job inconnu');
    });
});
