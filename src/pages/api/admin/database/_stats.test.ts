// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: { execute } }));

type StatsModule = typeof import('./stats');
type Row = Record<string, unknown>;
type ExecuteArgument = string | { sql: string; args: unknown[] };

let tempRoot: string;
let metadataRows: Row[];
let variableCountRows: Row[];
let variableTypeRows: Row[];
let failMetadata: boolean;
let failVariableCount: boolean;

function sqlOf(argument: ExecuteArgument): string {
    return typeof argument === 'string' ? argument : argument.sql;
}

async function fakeExecute(argument: ExecuteArgument): Promise<{ rows: Row[] }> {
    const sql = sqlOf(argument);
    if (sql.includes('CREATE TABLE IF NOT EXISTS database_metadata')) {
        if (failMetadata) throw new Error('no such table');
        return { rows: [] };
    }
    if (sql.includes('SELECT key, value FROM database_metadata')) return { rows: metadataRows };
    if (sql.includes('INSERT OR REPLACE INTO database_metadata')) return { rows: [] };
    if (sql.includes('FROM exoplanets') && sql.includes('GROUP BY constellation')) {
        return { rows: [{ name: 'Cyg', count: 12 }] };
    }
    if (sql.includes('FROM exoplanets')) {
        return {
            rows: [
                { total: 10, confirmed: 7, candidate: 3, historical: 2, min_dist: 1.3, max_dist: 8000, avg_dist: 400 },
            ],
        };
    }
    if (sql.includes('FROM comets')) return { rows: [{ total: 5, periodic: 4, non_periodic: 1, min_q: 0.5 }] };
    if (sql.includes('FROM asteroids')) return { rows: [{ total: 100, max_a: 3.2 }] };
    if (sql.includes('SELECT COUNT(*) as total FROM variable_stars')) {
        if (failVariableCount) throw new Error('timeout');
        return { rows: variableCountRows };
    }
    if (sql.includes('FROM variable_stars') && sql.includes('GROUP BY constellation')) {
        return { rows: [{ name: 'Sgr', count: 40 }] };
    }
    if (sql.includes('GROUP BY type')) return { rows: variableTypeRows };
    if (sql.includes('FROM variable_stars')) return { rows: [{ min_dist: 2, max_amp: 6.5 }] };
    throw new Error(`requête inattendue : ${sql}`);
}

async function callGet(): Promise<Response> {
    vi.resetModules();
    vi.spyOn(process, 'cwd').mockReturnValue(tempRoot);
    const route: StatsModule = await import('./stats');
    return route.GET({} as unknown as Parameters<StatsModule['GET']>[0]);
}

function executedSql(): string[] {
    return execute.mock.calls.map(([argument]) => sqlOf(argument as ExecuteArgument));
}

describe('GET /api/admin/database/stats', () => {
    beforeEach(() => {
        tempRoot = mkdtempSync(path.join(tmpdir(), 'mp-db-stats-'));
        vi.stubEnv('DEV', true);
        metadataRows = [];
        variableCountRows = [{ total: 0 }];
        variableTypeRows = [];
        failMetadata = false;
        failVariableCount = false;
        execute.mockReset();
        execute.mockImplementation(fakeExecute);
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
        rmSync(tempRoot, { recursive: true, force: true });
    });

    it('renvoie 404 hors du mode développement sans interroger la base', async () => {
        vi.stubEnv('DEV', false);
        expect((await callGet()).status).toBe(404);
        expect(execute).not.toHaveBeenCalled();
    });

    it('agrège exoplanètes, comètes et astéroïdes avec les métadonnées de synchronisation', async () => {
        metadataRows = [
            { key: 'exoplanets_last_sync', value: '2026-10-01T00:00:00.000Z' },
            { key: 'exoplanets_size_bytes', value: '2048' },
            { key: 'variable_stars_max_mag', value: '10.5' },
        ];
        const body = await (await callGet()).json();
        expect(body.exoplanets).toMatchObject({
            exists: true,
            sizeBytes: 2048,
            mtime: '2026-10-01T00:00:00.000Z',
            count: 10,
            confirmedCount: 7,
            candidateCount: 3,
            historicalCount: 2,
            topConstellations: [{ name: 'Cyg', count: 12 }],
        });
        expect(body.exoplanets.stats.distance).toEqual({ min: 1.3, max: 8000, avg: 400 });
        expect(body.exoplanets.stats.mass).toEqual({ min: 0, max: 0, avg: 0 });
        expect(body.comets).toMatchObject({ count: 5, periodicCount: 4, nonPeriodicCount: 1, sizeBytes: 0 });
        expect(body.comets.stats.q.min).toBe(0.5);
        expect(body.asteroids).toMatchObject({ count: 100 });
        expect(body.asteroids.stats.a.max).toBe(3.2);
        expect(body.variableStars).toMatchObject({ count: 0, maxMagLimit: 10.5 });
        expect(body.progress).toBeNull();
    });

    it('compte les étoiles variables en direct si la métadonnée manque, puis la mémorise', async () => {
        variableCountRows = [{ total: 120 }];
        variableTypeRows = [
            { type: 'mira', count: 30 },
            { type: 'eclipsing', count: 50 },
            { type: 'BY', count: 25 },
            { type: 'ZZ', count: 15 },
        ];
        const body = await (await callGet()).json();
        expect(body.variableStars.count).toBe(120);
        expect(body.variableStars.maxMagLimit).toBe(12);
        expect(body.variableStars.typesDistribution).toEqual({
            eclipsing: 50,
            cepheid: 0,
            mira: 30,
            semiregular: 0,
            cataclysmique: 0,
            other: 40,
        });
        expect(body.variableStars.topConstellations).toEqual([{ name: 'Sgr', count: 40 }]);
        expect(body.variableStars.stats.distance.min).toBe(2);
        expect(body.variableStars.stats.amplitude.max).toBe(6.5);
        const insert = execute.mock.calls
            .map(([argument]) => argument as ExecuteArgument)
            .find((argument) => typeof argument === 'object' && argument.sql.includes('INSERT OR REPLACE'));
        expect(insert).toMatchObject({ args: ['120'] });
    });

    it('utilise des statistiques estimées au-delà de 500 000 étoiles variables', async () => {
        metadataRows = [{ key: 'variable_stars_count', value: '1000000' }];
        const body = await (await callGet()).json();
        const distribution = body.variableStars.typesDistribution;
        expect(body.variableStars.count).toBe(1000000);
        expect(distribution.eclipsing).toBe(500000);
        expect(Object.values(distribution as Record<string, number>).reduce((a, b) => a + b, 0)).toBe(1000000);
        expect(body.variableStars.topConstellations[0]).toEqual({ name: 'Sgr', count: 100000 });
        expect(executedSql().some((sql) => sql.includes('SELECT COUNT(*) as total FROM variable_stars'))).toBe(false);
        expect(executedSql().some((sql) => sql.includes('GROUP BY type'))).toBe(false);
    });

    it('continue malgré une table de métadonnées ou un comptage inaccessibles', async () => {
        failMetadata = true;
        failVariableCount = true;
        const response = await callGet();
        const body = await response.json();
        expect(response.status).toBe(200);
        expect(body.variableStars.count).toBe(0);
        expect(console.warn).toHaveBeenCalledTimes(2);
    });

    it('lit la date du fichier local.db et la progression d’import', async () => {
        const dbFile = path.join(tempRoot, 'local.db');
        writeFileSync(dbFile, '');
        const mtime = new Date('2026-05-04T03:02:01.000Z');
        utimesSync(dbFile, mtime, mtime);
        mkdirSync(path.join(tempRoot, 'scripts/pipeline'), { recursive: true });
        writeFileSync(path.join(tempRoot, 'scripts/pipeline/import-progress.json'), '{"done":3,"total":10}');
        const body = await (await callGet()).json();
        expect(body.progress).toEqual({ done: 3, total: 10 });
        expect(body.comets.mtime).toBe(mtime.toISOString());
    });

    it('ignore une progression d’import corrompue', async () => {
        mkdirSync(path.join(tempRoot, 'scripts/pipeline'), { recursive: true });
        writeFileSync(path.join(tempRoot, 'scripts/pipeline/import-progress.json'), '{corrompu');
        const response = await callGet();
        expect(response.status).toBe(200);
        expect((await response.json()).progress).toBeNull();
        expect(console.error).toHaveBeenCalled();
    });

    it('renvoie 500 si une requête principale échoue', async () => {
        execute.mockImplementation(async (argument: ExecuteArgument) => {
            if (sqlOf(argument).includes('FROM comets')) throw new Error('SQLITE_BUSY');
            return fakeExecute(argument);
        });
        const response = await callGet();
        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: 'SQLITE_BUSY' });
    });
});
