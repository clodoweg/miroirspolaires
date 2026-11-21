// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const files = vi.hoisted(() => ({
    listPosts: vi.fn(),
    writePost: vi.fn(),
    readText: vi.fn(),
    renamePostAssets: vi.fn(),
}));

vi.mock('@/lib/admin/blog-files', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/admin/blog-files')>()),
    listPosts: files.listPosts,
    writePost: files.writePost,
    renamePostAssets: files.renamePostAssets,
}));
// POURQUOI : l'existence de l'article se lit par le ContentReader (disque ou branche GitHub).
vi.mock('@/lib/admin/stores/content-reader', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/admin/stores/content-reader')>()),
    getContentReader: () => ({ readText: files.readText, listDir: vi.fn() }),
}));

import { GET, POST } from './index';

type Context = Parameters<typeof POST>[0];

const FRONTMATTER = { title: 'T', date: '2026-01-01', categories: [], description: 'd', image: '' };

function post(body: unknown) {
    const request = new Request('http://localhost/api/admin/posts', {
        method: 'POST',
        body: typeof body === 'string' ? body : JSON.stringify(body),
    });
    return POST({ request } as unknown as Context);
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('DEV', true);
    files.readText.mockResolvedValue(null);
    files.writePost.mockResolvedValue({
        frontmatter: { ...FRONTMATTER, seoDescription: 'd' },
        body: 'enrichi',
        revision: 'r1',
    });
});

afterEach(() => vi.unstubAllEnvs());

describe('GET /api/admin/posts', () => {
    it('renvoie la liste des articles', async () => {
        files.listPosts.mockResolvedValue([{ year: '2026', slug: 'a' }]);
        const response = await GET({} as unknown as Context);
        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toBe('application/json');
        expect(await response.json()).toEqual([{ year: '2026', slug: 'a' }]);
    });

    it('renvoie 404 hors dev sans lire le disque', async () => {
        vi.stubEnv('DEV', false);
        expect((await GET({} as unknown as Context)).status).toBe(404);
        expect((await post({})).status).toBe(404);
        expect(files.listPosts).not.toHaveBeenCalled();
    });
});

describe('POST /api/admin/posts', () => {
    it('crée l’article et renvoie le contenu enrichi', async () => {
        const response = await post({ year: '2026', slug: 'nouveau', frontmatter: FRONTMATTER, body: 'Corps' });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            ok: true,
            year: '2026',
            slug: 'nouveau',
            frontmatter: { ...FRONTMATTER, seoDescription: 'd' },
            body: 'enrichi',
            revision: 'r1',
        });
        expect(files.writePost).toHaveBeenCalledWith('2026', 'nouveau', FRONTMATTER, 'Corps', { isNew: true });
        expect(files.renamePostAssets).not.toHaveBeenCalled();
        expect(files.readText).toHaveBeenCalledWith('src/content/blog/2026/nouveau.md');
    });

    it('renomme les assets quand l’ancien emplacement est valide', async () => {
        await post({
            year: '2026',
            slug: 'final',
            oldYear: '2025',
            oldSlug: 'brouillon',
            frontmatter: FRONTMATTER,
            body: '',
        });
        expect(files.renamePostAssets).toHaveBeenCalledWith('2025', 'brouillon', '2026', 'final');

        files.renamePostAssets.mockClear();
        await post({
            year: '2026',
            slug: 'final',
            oldYear: '2025',
            oldSlug: '../x',
            frontmatter: FRONTMATTER,
            body: '',
        });
        expect(files.renamePostAssets).not.toHaveBeenCalled();
    });

    it('renvoie 409 si l’article existe déjà', async () => {
        files.readText.mockResolvedValue('---\n---\n');
        const response = await post({
            year: '2026',
            slug: 'existe',
            oldYear: '2025',
            oldSlug: 'brouillon',
            frontmatter: FRONTMATTER,
            body: '',
        });
        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({ error: 'Post already exists' });
        expect(files.writePost).not.toHaveBeenCalled();
        expect(files.renamePostAssets).not.toHaveBeenCalled();
    });

    it('ne déplace pas les images sur l’admin distant', async () => {
        vi.stubEnv('DEV', false);
        const locals = { adminAccess: { mode: 'remote' as const, session: { userId: 1, login: 'a', expiresAt: 0 } } };
        const request = new Request('http://localhost/api/admin/posts', {
            method: 'POST',
            body: JSON.stringify({
                year: '2026',
                slug: 'final',
                oldYear: '2025',
                oldSlug: 'brouillon',
                frontmatter: FRONTMATTER,
                body: '',
            }),
        });
        expect((await POST({ request, locals } as unknown as Context)).status).toBe(200);
        expect(files.renamePostAssets).not.toHaveBeenCalled();
    });

    it('renvoie 502 si GitHub refuse le commit', async () => {
        const { GitHubApiError } = await import('@/lib/admin/github/app-client');
        files.writePost.mockRejectedValue(new GitHubApiError(500, 'boom'));
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const response = await post({ year: '2026', slug: 'nouveau', frontmatter: FRONTMATTER, body: 'Corps' });
        expect(response.status).toBe(502);
    });

    it.each([
        ['JSON invalide', '{', 'Missing year, slug, frontmatter, or body'],
        [
            'corps manquant',
            { year: '2026', slug: 'a', frontmatter: FRONTMATTER },
            'Missing year, slug, frontmatter, or body',
        ],
        ['année invalide', { year: '26', slug: 'a', frontmatter: FRONTMATTER, body: '' }, 'Invalid year'],
        ['slug invalide', { year: '2026', slug: 'A B', frontmatter: FRONTMATTER, body: '' }, 'Invalid slug'],
    ])('renvoie 400 : %s', async (_label, body, error) => {
        const response = await post(body);
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error });
        expect(files.writePost).not.toHaveBeenCalled();
    });
});
