import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

type ReportModule = typeof import('./report');

let tempRoot: string;

async function loadRoute(): Promise<ReportModule> {
    vi.resetModules();
    vi.spyOn(process, 'cwd').mockReturnValue(tempRoot);
    return import('./report');
}

function callGet(route: ReportModule) {
    return route.GET({} as unknown as Parameters<ReportModule['GET']>[0]);
}

function writeReport(content: string) {
    mkdirSync(path.join(tempRoot, 'src/data'), { recursive: true });
    writeFileSync(path.join(tempRoot, 'src/data/lighthouse-results.json'), content);
}

describe('GET /api/admin/lighthouse/report', () => {
    beforeEach(() => {
        tempRoot = mkdtempSync(path.join(tmpdir(), 'mp-lighthouse-'));
        vi.stubEnv('DEV', true);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
        rmSync(tempRoot, { recursive: true, force: true });
    });

    it('renvoie 404 hors du mode développement', async () => {
        vi.stubEnv('DEV', false);
        const response = await callGet(await loadRoute());
        expect(response.status).toBe(404);
    });

    it('renvoie 404 avec une liste vide quand le rapport est absent', async () => {
        const response = await callGet(await loadRoute());
        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: 'No report found', results: [] });
    });

    it('renvoie le rapport JSON tel quel', async () => {
        const report = { summary: { averagePerformance: 97 }, results: [{ url: '/' }] };
        writeReport(JSON.stringify(report));
        const response = await callGet(await loadRoute());
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(report);
    });

    it('renvoie 500 si le rapport est illisible', async () => {
        writeReport('{ pas du json');
        const response = await callGet(await loadRoute());
        const body = await response.json();
        expect(response.status).toBe(500);
        expect(body.error).toMatch(/^Failed to read report: /);
        expect(body.results).toEqual([]);
    });
});
