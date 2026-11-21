// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { GitHubApiError, type GitHubAppClient } from './app-client';
import {
    ReleaseNotReadyError,
    getReleaseStatus,
    mergeReleasePullRequest,
    openReleasePullRequest,
    summarizeChecks,
    toReleaseErrorResponse,
} from './release';

const BRANCHES = { contentBranch: 'dev', productionBranch: 'main' };
const HEAD = 'a'.repeat(40);

interface FakeOptions {
    ahead?: number;
    openPulls?: number[];
    mergeable?: boolean | null;
    runs?: { status: string; conclusion: string | null }[];
    headSha?: string;
    mergeStatus?: number;
}

function fakeClient(options: FakeOptions = {}) {
    const calls: { path: string; method: string; body?: Record<string, unknown> }[] = [];
    const request = vi.fn(async (path: string, init: RequestInit = {}) => {
        const method = init.method ?? 'GET';
        calls.push({ path, method, body: init.body ? JSON.parse(String(init.body)) : undefined });
        if (path.startsWith('/repos/o/r/compare/')) {
            return Response.json({
                ahead_by: options.ahead ?? 2,
                commits: [
                    {
                        sha: '1'.repeat(40),
                        commit: { message: 'feat: a\n\ncorps', author: { name: 'bot', date: '2026-11-10T09:00:00Z' } },
                    },
                    { sha: '2'.repeat(40), commit: { message: 'fix: b' } },
                ],
            });
        }
        if (path.startsWith('/repos/o/r/pulls?'))
            return Response.json((options.openPulls ?? []).map((number) => ({ number })));
        if (path === '/repos/o/r/pulls' && method === 'POST') return Response.json({ number: 7 }, { status: 201 });
        if (/^\/repos\/o\/r\/pulls\/\d+$/.test(path)) {
            return Response.json({
                number: Number(path.split('/').pop()),
                html_url: 'https://github.com/o/r/pull/7',
                head: { sha: options.headSha ?? HEAD },
                mergeable: options.mergeable === undefined ? true : options.mergeable,
            });
        }
        if (path.includes('/check-runs'))
            return Response.json({ check_runs: options.runs ?? [{ status: 'completed', conclusion: 'success' }] });
        if (path.endsWith('/merge')) {
            return options.mergeStatus
                ? new Response('{}', { status: options.mergeStatus })
                : Response.json({ sha: 'm'.repeat(40) });
        }
        return new Response('{}', { status: 404 });
    });
    return { client: { repoPath: '/repos/o/r', request } as unknown as GitHubAppClient, calls };
}

describe('summarizeChecks', () => {
    it.each([
        [[], 'none'],
        [[{ status: 'in_progress', conclusion: null }], 'pending'],
        [
            [
                { status: 'completed', conclusion: 'success' },
                { status: 'completed', conclusion: 'skipped' },
            ],
            'success',
        ],
        [
            [
                { status: 'completed', conclusion: 'success' },
                { status: 'completed', conclusion: 'failure' },
            ],
            'failure',
        ],
    ])('%j → %s', (runs, expected) => {
        expect(summarizeChecks(runs)).toBe(expected);
    });
});

describe('getReleaseStatus', () => {
    it('liste les commits en attente, les plus récents en premier, et la PR ouverte', async () => {
        const { client, calls } = fakeClient({ openPulls: [7] });
        const status = await getReleaseStatus(client, BRANCHES);
        expect(status).toMatchObject({ ahead: 2, contentBranch: 'dev', productionBranch: 'main' });
        expect(status.commits.map((commit) => commit.message)).toEqual(['fix: b', 'feat: a']);
        expect(status.commits[1]).toMatchObject({ author: 'bot', date: '2026-11-10T09:00:00Z' });
        expect(status.pullRequest).toEqual({
            number: 7,
            url: 'https://github.com/o/r/pull/7',
            headSha: HEAD,
            mergeable: true,
            checks: 'success',
        });
        expect(calls[1].path).toBe('/repos/o/r/pulls?state=open&base=main&head=o%3Adev');
    });

    it('sans PR ouverte', async () => {
        expect((await getReleaseStatus(fakeClient().client, BRANCHES)).pullRequest).toBeNull();
    });
});

describe('openReleasePullRequest', () => {
    it('ouvre la PR dev → main avec la liste des commits', async () => {
        const { client, calls } = fakeClient();
        const pull = await openReleasePullRequest(client, BRANCHES, 'clodoweg');
        expect(pull.number).toBe(7);
        const created = calls.find((call) => call.path === '/repos/o/r/pulls' && call.method === 'POST');
        expect(created?.body).toMatchObject({ head: 'dev', base: 'main', title: 'chore: release dev to production' });
        expect(String(created?.body?.body)).toContain('clodoweg');
        expect(String(created?.body?.body)).toContain('fix: b (2222222)');
    });

    it('renvoie la PR déjà ouverte, refuse s’il n’y a rien à publier', async () => {
        const existing = fakeClient({ openPulls: [9] });
        expect((await openReleasePullRequest(existing.client, BRANCHES, 'x')).number).toBe(9);
        expect(existing.calls.some((call) => call.method === 'POST')).toBe(false);
        await expect(openReleasePullRequest(fakeClient({ ahead: 0 }).client, BRANCHES, 'x')).rejects.toThrow(
            'Rien à mettre en production',
        );
    });
});

describe('mergeReleasePullRequest', () => {
    it('fusionne sur la tête attendue quand la CI est verte', async () => {
        const { client, calls } = fakeClient();
        expect(await mergeReleasePullRequest(client, 7, HEAD)).toEqual({ sha: 'm'.repeat(40) });
        expect(calls.at(-1)).toMatchObject({ method: 'PUT', body: { merge_method: 'merge', sha: HEAD } });
    });

    it.each([
        ['tête changée', { headSha: 'b'.repeat(40) }, 'nouveaux commits'],
        ['CI en cours', { runs: [{ status: 'queued', conclusion: null }] }, 'pas entièrement verte'],
        ['CI rouge', { runs: [{ status: 'completed', conclusion: 'failure' }] }, 'pas entièrement verte'],
        ['conflit', { mergeable: false }, 'conflit'],
        ['refus GitHub', { mergeStatus: 405 }, 'refuse la fusion'],
    ])('refuse : %s', async (_label, options, message) => {
        const { client, calls } = fakeClient(options as FakeOptions);
        await expect(mergeReleasePullRequest(client, 7, HEAD)).rejects.toThrow(message);
        if (!('mergeStatus' in options)) expect(calls.some((call) => call.path.endsWith('/merge'))).toBe(false);
    });

    it('remonte une autre erreur GitHub', async () => {
        await expect(mergeReleasePullRequest(fakeClient({ mergeStatus: 500 }).client, 7, HEAD)).rejects.toBeInstanceOf(
            GitHubApiError,
        );
    });
});

describe('toReleaseErrorResponse', () => {
    it('traduit les erreurs connues et relance les autres', () => {
        expect(toReleaseErrorResponse(new ReleaseNotReadyError('x')).status).toBe(409);
        vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(toReleaseErrorResponse(new GitHubApiError(500, 'x')).status).toBe(502);
        vi.restoreAllMocks();
        expect(() => toReleaseErrorResponse(new Error('autre'))).toThrow('autre');
    });
});
