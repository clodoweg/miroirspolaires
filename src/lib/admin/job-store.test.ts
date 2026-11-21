// @vitest-environment node
import { createClient } from '@libsql/client';
import { describe, expect, it } from 'vitest';
import {
    appendJobLogs,
    findActiveJob,
    getJob,
    insertJob,
    listJobs,
    readJobLogs,
    updateJob,
    type JobDatabase,
} from './job-store.mjs';

function memoryDatabase(): JobDatabase {
    return createClient({ url: ':memory:' }) as unknown as JobDatabase;
}

describe('job-store (SQL réel, base en mémoire)', () => {
    it('crée, met à jour, liste et retrouve les jobs actifs', async () => {
        const database = memoryDatabase();
        await insertJob(database, {
            id: 'a',
            scriptId: 'update-exoplanets',
            actor: 'clodoweg',
            createdAt: '2026-11-11T08:00:00Z',
        });
        await insertJob(database, {
            id: 'b',
            scriptId: 'seo-check',
            actor: 'clodoweg',
            createdAt: '2026-11-11T09:00:00Z',
        });

        expect(await getJob(database, 'a')).toEqual({
            id: 'a',
            scriptId: 'update-exoplanets',
            status: 'queued',
            actor: 'clodoweg',
            createdAt: '2026-11-11T08:00:00Z',
            startedAt: null,
            finishedAt: null,
            exitCode: null,
            runId: null,
            commitSha: null,
        });
        expect((await findActiveJob(database, 'update-exoplanets'))?.id).toBe('a');

        await updateJob(database, 'a', {
            status: 'succeeded',
            exitCode: 0,
            runId: '42',
            finishedAt: 'x',
            ignored: 1,
        } as never);
        await updateJob(database, 'a', {});
        expect(await getJob(database, 'a')).toMatchObject({ status: 'succeeded', exitCode: 0, runId: '42' });
        expect(await findActiveJob(database, 'update-exoplanets')).toBeNull();
        expect((await listJobs(database, 1)).map((job) => job.id)).toEqual(['b']);
        expect(await getJob(database, 'absent')).toBeNull();
    });

    it('ajoute et relit le journal avec un curseur, en tronquant les lignes trop longues', async () => {
        const database = memoryDatabase();
        await appendJobLogs(database, 'a', []);
        await appendJobLogs(database, 'a', [
            { at: 't1', stream: 'stdout', line: 'première' },
            { at: 't2', stream: 'stderr', line: 'x'.repeat(3000) },
        ]);
        await appendJobLogs(database, 'b', [{ at: 't3', stream: 'stdout', line: 'autre job' }]);
        const all = await readJobLogs(database, 'a');
        expect(all.map((line) => line.stream)).toEqual(['stdout', 'stderr']);
        expect(all[1].line).toHaveLength(2000);
        expect(await readJobLogs(database, 'a', all[0].id)).toHaveLength(1);
        expect(await readJobLogs(database, 'a', -5, 1)).toHaveLength(1);
    });
});
