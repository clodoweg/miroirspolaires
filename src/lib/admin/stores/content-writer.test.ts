// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GitHubApiError, type GitHubAppClient } from '../github/app-client';
import {
    ContentConflictError,
    assertRevision,
    computeRevision,
    createFsContentWriter,
    createGitHubContentWriter,
    getContentWriter,
    toWriteErrorResponse,
} from './content-writer';

describe('computeRevision et assertRevision', () => {
    it('produit l’empreinte Git d’un blob', () => {
        // POURQUOI : `git hash-object` fait foi ; l'empreinte doit correspondre à celle que renvoie GitHub.
        const sample = 'Aurores à Tromsø\n';
        const expected = execFileSync('git', ['hash-object', '--stdin'], { input: sample }).toString().trim();
        expect(computeRevision(sample)).toBe(expected);
    });

    it('refuse une révision différente ou un fichier disparu, accepte l’absence de contrôle', () => {
        const revision = computeRevision('a');
        expect(() => assertRevision('a', revision, 'f.md')).not.toThrow();
        expect(() => assertRevision('a', undefined, 'f.md')).not.toThrow();
        expect(() => assertRevision('b', revision, 'f.md')).toThrow(ContentConflictError);
        expect(() => assertRevision(null, revision, 'f.md')).toThrow('f.md');
    });
});

describe('createFsContentWriter', () => {
    let root: string;
    beforeEach(() => {
        root = mkdtempSync(path.join(tmpdir(), 'mp-writer-'));
    });
    afterEach(() => rmSync(root, { recursive: true, force: true }));

    it('écrit, crée les dossiers et supprime', async () => {
        mkdirSync(path.join(root, 'src/data'), { recursive: true });
        writeFileSync(path.join(root, 'src/data/old.json'), '{}');
        const writer = createFsContentWriter(root);
        expect(
            await writer.commit(
                [
                    { path: 'src/content/blog/2026/a.md', content: 'A' },
                    { path: 'src/data/old.json', content: null },
                    { path: 'src/data/absent.json', content: null },
                ],
                'msg',
            ),
        ).toEqual({ commitSha: null });
        expect(readFileSync(path.join(root, 'src/content/blog/2026/a.md'), 'utf-8')).toBe('A');
        expect(existsSync(path.join(root, 'src/data/old.json'))).toBe(false);
        expect(existsSync(path.join(root, 'src/content/blog/2026/a.md.tmp'))).toBe(false);
    });

    it('refuse un chemin qui sort du dépôt', async () => {
        await expect(createFsContentWriter(root).commit([{ path: '../x', content: 'x' }], 'm')).rejects.toThrow(
            'Chemin refusé',
        );
    });
});

describe('createGitHubContentWriter', () => {
    function fakeClient(refUpdateStatuses: number[]) {
        const calls: { path: string; method: string; body?: unknown }[] = [];
        let commitCount = 0;
        const request = vi.fn(async (apiPath: string, init: RequestInit = {}) => {
            const method = init.method ?? 'GET';
            calls.push({ path: apiPath, method, body: init.body ? JSON.parse(String(init.body)) : undefined });
            if (apiPath.endsWith('/git/refs/heads/dev') && method === 'GET') {
                return Response.json({ object: { sha: `head${commitCount}` } });
            }
            if (apiPath.includes('/git/commits/head')) return Response.json({ tree: { sha: 'base-tree' } });
            if (apiPath.endsWith('/git/trees')) return Response.json({ sha: 'new-tree' }, { status: 201 });
            if (apiPath.endsWith('/git/commits')) {
                commitCount += 1;
                return Response.json({ sha: `commit${commitCount}` }, { status: 201 });
            }
            if (method === 'PATCH') {
                const status = refUpdateStatuses.shift() ?? 200;
                return new Response('{}', { status });
            }
            return new Response('{}', { status: 404 });
        });
        return { client: { repoPath: '/repos/o/r', request } as unknown as GitHubAppClient, calls };
    }

    it('crée un commit atomique sur la tête de la branche', async () => {
        const { client, calls } = fakeClient([200]);
        const result = await createGitHubContentWriter(client, 'dev').commit(
            [
                { path: 'src/content/blog/2026/a.md', content: 'A' },
                { path: 'src/content/blog/2026/b.md', content: null },
            ],
            'chore: update',
        );
        expect(result).toEqual({ commitSha: 'commit1' });
        const tree = calls.find((call) => call.path.endsWith('/git/trees'));
        expect(tree?.body).toEqual({
            base_tree: 'base-tree',
            tree: [
                { path: 'src/content/blog/2026/a.md', mode: '100644', type: 'blob', content: 'A' },
                { path: 'src/content/blog/2026/b.md', mode: '100644', type: 'blob', sha: null },
            ],
        });
        const commit = calls.find((call) => call.path.endsWith('/git/commits') && call.method === 'POST');
        expect(commit?.body).toEqual({ message: 'chore: update', tree: 'new-tree', parents: ['head0'] });
        expect(calls.at(-1)).toMatchObject({ method: 'PATCH', body: { sha: 'commit1', force: false } });
    });

    it('rejoue une fois sur la nouvelle tête si la branche a avancé', async () => {
        const { client, calls } = fakeClient([422, 200]);
        expect(await createGitHubContentWriter(client, 'dev').commit([{ path: 'a.md', content: 'A' }], 'm')).toEqual({
            commitSha: 'commit2',
        });
        expect(calls.filter((call) => call.method === 'PATCH')).toHaveLength(2);
    });

    it('abandonne après deux refus et remonte les erreurs GitHub', async () => {
        const writer = createGitHubContentWriter(fakeClient([422, 422]).client, 'dev');
        await expect(writer.commit([{ path: 'a.md', content: 'A' }], 'm')).rejects.toThrow('La branche a avancé');
        const failing = createGitHubContentWriter(fakeClient([500]).client, 'dev');
        await expect(failing.commit([{ path: 'a.md', content: 'A' }], 'm')).rejects.toBeInstanceOf(GitHubApiError);
    });

    it('ne fait rien sans modification', async () => {
        const { client, calls } = fakeClient([]);
        expect(await createGitHubContentWriter(client, 'dev').commit([], 'm')).toEqual({ commitSha: null });
        expect(calls).toHaveLength(0);
    });
});

describe('toWriteErrorResponse', () => {
    it('traduit conflit et refus GitHub, relance le reste', async () => {
        expect(toWriteErrorResponse(new ContentConflictError('a.md')).status).toBe(409);
        vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(toWriteErrorResponse(new GitHubApiError(500, 'x')).status).toBe(502);
        expect(() => toWriteErrorResponse(new Error('autre'))).toThrow('autre');
        vi.restoreAllMocks();
    });
});

describe('getContentWriter', () => {
    afterEach(() => vi.unstubAllEnvs());

    it('écrit sur le disque en dev et par commit sur l’admin distant', () => {
        vi.stubEnv('DEV', true);
        expect(getContentWriter()).toBeDefined();
        vi.stubEnv('DEV', false);
        const env: Record<string, string> = {
            VERCEL_ENV: 'preview',
            VERCEL_GIT_COMMIT_REF: 'dev',
            VERCEL_GIT_REPO_OWNER: 'o',
            VERCEL_GIT_REPO_SLUG: 'r',
            GITHUB_APP_ID: '1',
            GITHUB_APP_PRIVATE_KEY: 'pem',
            GITHUB_APP_INSTALLATION_ID: '2',
            GITHUB_APP_CLIENT_ID: 'c',
            GITHUB_APP_CLIENT_SECRET: 's',
            ADMIN_GITHUB_USER_ID: '42',
            ADMIN_SESSION_SECRET: 'x'.repeat(32),
        };
        for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
        const writer = getContentWriter();
        expect(getContentWriter()).toBe(writer);
    });
});
