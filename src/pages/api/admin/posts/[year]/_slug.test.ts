// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const files = vi.hoisted(() => ({
    readPost: vi.fn(),
    writePost: vi.fn(),
    deletePost: vi.fn(),
}));

vi.mock('@/lib/admin/blog-files', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/admin/blog-files')>()),
    ...files,
}));

import { GET, PUT, DELETE } from './[slug]';

type Context = Parameters<typeof GET>[0];

const FRONTMATTER = { title: 'T', date: '2026-01-01', categories: [], description: 'd', image: '' };

function context(params: Record<string, string>, init?: { body?: string; search?: string }) {
    const url = new URL(`http://localhost/api/admin/posts/x${init?.search ?? ''}`);
    const request = new Request(url, { method: init?.body ? 'PUT' : 'GET', body: init?.body });
    return { params, url, request } as unknown as Context;
}

const VALID = { year: '2026', slug: 'tromso' };

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('DEV', true);
});

afterEach(() => vi.unstubAllEnvs());

describe('GET /api/admin/posts/[year]/[slug]', () => {
    it('renvoie l’article', async () => {
        files.readPost.mockResolvedValue({ ...FRONTMATTER, ...VALID, body: 'x' });
        const response = await GET(context(VALID));
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ title: 'T', body: 'x' });
        expect(files.readPost).toHaveBeenCalledWith('2026', 'tromso');
    });

    it('renvoie 404 si l’article manque, 400 si les paramètres sont invalides', async () => {
        files.readPost.mockResolvedValue(null);
        expect((await GET(context(VALID))).status).toBe(404);
        const response = await GET(context({ year: '2026', slug: '../secret' }));
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: 'Invalid params' });
    });

    it('renvoie 404 hors dev pour toutes les méthodes', async () => {
        vi.stubEnv('DEV', false);
        for (const handler of [GET, PUT, DELETE]) {
            expect((await handler(context(VALID))).status).toBe(404);
        }
        expect(files.readPost).not.toHaveBeenCalled();
        expect(files.deletePost).not.toHaveBeenCalled();
    });
});

describe('PUT /api/admin/posts/[year]/[slug]', () => {
    it('réécrit l’article et renvoie la version enrichie', async () => {
        files.writePost.mockResolvedValue({
            frontmatter: { ...FRONTMATTER, seoDescription: 'd' },
            body: 'B',
            revision: 'r2',
        });
        const response = await PUT(
            context(VALID, { body: JSON.stringify({ frontmatter: FRONTMATTER, body: 'B', revision: 'r1' }) }),
        );
        expect(await response.json()).toEqual({
            ok: true,
            frontmatter: { ...FRONTMATTER, seoDescription: 'd' },
            body: 'B',
            revision: 'r2',
        });
        expect(files.writePost).toHaveBeenCalledWith('2026', 'tromso', FRONTMATTER, 'B', { expectedRevision: 'r1' });
    });

    it('renvoie 409 si l’article a changé depuis son ouverture', async () => {
        const { ContentConflictError } = await import('@/lib/admin/stores/content-writer');
        files.writePost.mockRejectedValue(new ContentConflictError('src/content/blog/2026/tromso.md'));
        const response = await PUT(
            context(VALID, { body: JSON.stringify({ frontmatter: FRONTMATTER, body: 'B', revision: 42 }) }),
        );
        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({ error: 'conflict' });
        expect(files.writePost).toHaveBeenCalledWith('2026', 'tromso', FRONTMATTER, 'B', {
            expectedRevision: undefined,
        });
    });

    it('relance une erreur inattendue', async () => {
        files.writePost.mockRejectedValue(new Error('disque plein'));
        await expect(
            PUT(context(VALID, { body: JSON.stringify({ frontmatter: FRONTMATTER, body: 'B' }) })),
        ).rejects.toThrow('disque plein');
    });

    it('renvoie 400 pour un corps incomplet ou des paramètres invalides', async () => {
        const missing = await PUT(context(VALID, { body: JSON.stringify({ frontmatter: FRONTMATTER }) }));
        expect(missing.status).toBe(400);
        expect(await missing.json()).toEqual({ error: 'Missing frontmatter or body' });
        expect((await PUT(context(VALID, { body: 'pas du json' }))).status).toBe(400);
        expect((await PUT(context({ year: 'abcd', slug: 'x' }, { body: '{}' }))).status).toBe(400);
        expect(files.writePost).not.toHaveBeenCalled();
    });
});

describe('DELETE /api/admin/posts/[year]/[slug]', () => {
    it('renvoie 502 si GitHub refuse la suppression', async () => {
        const { GitHubApiError } = await import('@/lib/admin/github/app-client');
        files.deletePost.mockRejectedValueOnce(new GitHubApiError(500, 'boom'));
        vi.spyOn(console, 'error').mockImplementation(() => {});
        expect((await DELETE(context(VALID))).status).toBe(502);
    });

    it('supprime l’article, avec les assets seulement si assets=1', async () => {
        expect(await (await DELETE(context(VALID))).json()).toEqual({ ok: true });
        await DELETE(context(VALID, { search: '?assets=1' }));
        expect(files.deletePost.mock.calls).toEqual([
            ['2026', 'tromso', false],
            ['2026', 'tromso', true],
        ]);
    });

    it('renvoie 400 pour des paramètres invalides', async () => {
        expect((await DELETE(context({ year: '2026', slug: '' }))).status).toBe(400);
        expect(files.deletePost).not.toHaveBeenCalled();
    });
});
