// @vitest-environment node
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GitHubAppClient } from '../github/app-client';
import { countMarkdownEntries, listMarkdownEntriesWith } from '../content-files';
import {
    createFsContentReader,
    createGitHubContentReader,
    getContentReader,
    splitSafeRelativePath,
    toProjectRelativePath,
} from './content-reader';

describe('splitSafeRelativePath', () => {
    it('découpe un chemin sûr', () => {
        expect(splitSafeRelativePath('src/content/blog/2026/a-b.md')).toEqual([
            'src',
            'content',
            'blog',
            '2026',
            'a-b.md',
        ]);
        expect(splitSafeRelativePath('')).toEqual([]);
    });

    it.each(['../secret', 'a/../b', '/etc/passwd', 'a//b', 'a/b?ref=main', 'a/./b'])('refuse %s', (candidate) => {
        expect(() => splitSafeRelativePath(candidate)).toThrow('Chemin refusé');
    });
});

describe('createFsContentReader', () => {
    let root: string;

    beforeEach(() => {
        root = mkdtempSync(path.join(tmpdir(), 'mp-reader-'));
        mkdirSync(path.join(root, 'src/content/blog/2026'), { recursive: true });
        mkdirSync(path.join(root, 'src/content/blog/brouillons'), { recursive: true });
        writeFileSync(path.join(root, 'src/content/blog/2026/aurores.md'), '---\ntitle: Aurores\n---\nCorps');
        writeFileSync(path.join(root, 'src/content/blog/2026/notes.txt'), 'ignoré');
    });

    afterEach(() => rmSync(root, { recursive: true, force: true }));

    it('lit un fichier et renvoie null pour un fichier absent', async () => {
        const reader = createFsContentReader(root);
        expect(await reader.readText('src/content/blog/2026/aurores.md')).toContain('Corps');
        expect(await reader.readText('src/content/blog/2026/absent.md')).toBeNull();
    });

    it('liste un dossier et renvoie null pour un dossier absent', async () => {
        const reader = createFsContentReader(root);
        expect(await reader.listDir('src/content/blog')).toEqual(
            expect.arrayContaining([
                { name: '2026', type: 'dir' },
                { name: 'brouillons', type: 'dir' },
            ]),
        );
        expect(await reader.listDir('src/content/videos')).toBeNull();
        expect(await reader.listDir('src/content/blog/2026/aurores.md')).toBeNull();
    });

    it('alimente listMarkdownEntriesWith et countMarkdownEntries', async () => {
        const reader = createFsContentReader(root);
        expect(await listMarkdownEntriesWith(reader, 'src/content/blog')).toEqual([
            { year: '2026', slug: 'aurores', data: { title: 'Aurores' } },
        ]);
        expect(await countMarkdownEntries(reader, 'src/content/blog')).toBe(1);
        expect(await countMarkdownEntries(reader, 'src/content/absent')).toBe(0);
    });

    it('utilise process.cwd() par défaut', async () => {
        vi.spyOn(process, 'cwd').mockReturnValue(root);
        expect(await createFsContentReader().readText('src/content/blog/2026/aurores.md')).toContain('Aurores');
        expect(toProjectRelativePath(path.join(root, 'src/data/x.json'))).toBe('src/data/x.json');
        vi.restoreAllMocks();
    });
});

describe('createGitHubContentReader', () => {
    function fakeClient(routes: Record<string, () => Response>) {
        const request = vi.fn(async (apiPath: string) => {
            const handler = routes[apiPath];
            return handler ? handler() : new Response('{}', { status: 404 });
        });
        return { client: { repoPath: '/repos/o/r', request } as unknown as GitHubAppClient, request };
    }

    it('liste et lit la branche, avec cache par empreinte', async () => {
        const { client, request } = fakeClient({
            '/repos/o/r/contents/src/content/blog?ref=dev': () =>
                Response.json([
                    { name: '2026', type: 'dir', sha: 'd1' },
                    { name: 'lien', type: 'symlink', sha: 'l1' },
                ]),
            '/repos/o/r/contents/src/content/blog/2026?ref=dev': () =>
                Response.json([{ name: 'aurores.md', type: 'file', sha: 'f1' }]),
            '/repos/o/r/contents/src/content/blog/2026/aurores.md?ref=dev': () =>
                new Response('---\ntitle: Aurores\n---\n'),
        });
        const reader = createGitHubContentReader(client, 'dev');

        expect(await listMarkdownEntriesWith(reader, 'src/content/blog')).toEqual([
            { year: '2026', slug: 'aurores', data: { title: 'Aurores' } },
        ]);
        await listMarkdownEntriesWith(reader, 'src/content/blog');
        const fileReads = request.mock.calls.filter(([apiPath]) => apiPath.endsWith('aurores.md?ref=dev'));
        expect(fileReads).toHaveLength(1);
        expect(request).toHaveBeenCalledWith('/repos/o/r/contents/src/content/blog/2026/aurores.md?ref=dev', {
            accept: 'application/vnd.github.raw+json',
        });
    });

    it('renvoie null sur 404 et lève sur une autre erreur', async () => {
        const { client } = fakeClient({
            '/repos/o/r/contents/boom.json?ref=dev': () => new Response('x', { status: 500 }),
            '/repos/o/r/contents/boom?ref=dev': () => new Response('x', { status: 500 }),
            '/repos/o/r/contents/fichier?ref=dev': () => Response.json({ type: 'file' }),
        });
        const reader = createGitHubContentReader(client, 'dev');
        expect(await reader.readText('absent.json')).toBeNull();
        expect(await reader.listDir('absent')).toBeNull();
        expect(await reader.listDir('fichier')).toBeNull();
        await expect(reader.readText('boom.json')).rejects.toThrow('500');
        await expect(reader.listDir('boom')).rejects.toThrow('500');
    });
});

describe('getContentReader', () => {
    afterEach(() => vi.unstubAllEnvs());

    it('lit le disque en dev', async () => {
        vi.stubEnv('DEV', true);
        expect(await getContentReader().readText('package.json')).toContain('"name"');
    });

    it('lit la branche de contenu par GitHub sur l’admin distant, avec un lecteur réutilisé', () => {
        const env: Record<string, string> = {
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
        vi.stubEnv('DEV', false);
        for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
        const reader = getContentReader();
        expect(getContentReader()).toBe(reader);
    });
});
