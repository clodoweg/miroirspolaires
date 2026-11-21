// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const files = vi.hoisted(() => ({
    listVoyages: vi.fn(),
    writeVoyage: vi.fn(),
    readText: vi.fn(),
}));

vi.mock('@/lib/admin/voyages-files', () => ({ listVoyages: files.listVoyages, writeVoyage: files.writeVoyage }));
vi.mock('@/lib/admin/stores/content-reader', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/admin/stores/content-reader')>()),
    getContentReader: () => ({ readText: files.readText, listDir: vi.fn() }),
}));

import { GET, POST } from './index';

type Context = Parameters<typeof POST>[0];

const FRONTMATTER = { title: 'Troms', image: '', gallery: [] };

function post(body: unknown) {
    const request = new Request('http://localhost/api/admin/voyages', {
        method: 'POST',
        body: typeof body === 'string' ? body : JSON.stringify(body),
    });
    return POST({ request } as unknown as Context);
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('DEV', true);
    files.readText.mockResolvedValue(null);
    files.writeVoyage.mockResolvedValue({ revision: 'r1' });
});

afterEach(() => vi.unstubAllEnvs());

describe('GET /api/admin/voyages', () => {
    it('renvoie la liste des voyages', async () => {
        files.listVoyages.mockResolvedValue([{ year: '2025', slug: 'troms' }]);
        const response = await GET({} as unknown as Context);
        expect(await response.json()).toEqual([{ year: '2025', slug: 'troms' }]);
    });

    it('renvoie 404 hors dev', async () => {
        vi.stubEnv('DEV', false);
        expect((await GET({} as unknown as Context)).status).toBe(404);
        expect((await post({})).status).toBe(404);
        expect(files.listVoyages).not.toHaveBeenCalled();
    });
});

describe('POST /api/admin/voyages', () => {
    it('crée le voyage s’il n’existe pas', async () => {
        const response = await post({ year: '2025', slug: 'troms', frontmatter: FRONTMATTER, body: 'Récit' });
        expect(await response.json()).toEqual({ ok: true, year: '2025', slug: 'troms', revision: 'r1' });
        expect(files.writeVoyage).toHaveBeenCalledWith('2025', 'troms', FRONTMATTER, 'Récit', { isNew: true });
        expect(files.readText).toHaveBeenCalledWith('src/content/voyages/2025/troms.md');
    });

    it('renvoie 409 si le fichier existe déjà', async () => {
        files.readText.mockResolvedValue('x');
        const response = await post({ year: '2025', slug: 'troms', frontmatter: FRONTMATTER, body: '' });
        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({ error: 'Voyage already exists' });
        expect(files.writeVoyage).not.toHaveBeenCalled();
    });

    it('renvoie 502 si GitHub refuse le commit', async () => {
        const { GitHubApiError } = await import('@/lib/admin/github/app-client');
        files.writeVoyage.mockRejectedValue(new GitHubApiError(500, 'boom'));
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const response = await post({ year: '2025', slug: 'troms', frontmatter: FRONTMATTER, body: '' });
        expect(response.status).toBe(502);
    });

    it.each([
        ['JSON invalide', 'oups', 'Missing year, slug, frontmatter, or body'],
        ['frontmatter manquant', { year: '2025', slug: 'a', body: '' }, 'Missing year, slug, frontmatter, or body'],
        ['année invalide', { year: '2k25', slug: 'a', frontmatter: FRONTMATTER, body: '' }, 'Invalid year'],
        ['slug invalide', { year: '2025', slug: '-a', frontmatter: FRONTMATTER, body: '' }, 'Invalid slug'],
    ])('renvoie 400 : %s', async (_label, body, error) => {
        const response = await post(body);
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error });
    });
});
