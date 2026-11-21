// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const files = vi.hoisted(() => ({
    readVoyage: vi.fn(),
    writeVoyage: vi.fn(),
    deleteVoyage: vi.fn(),
}));

vi.mock('@/lib/admin/voyages-files', () => files);

import { GET, PUT, DELETE } from './[slug]';

type Context = Parameters<typeof GET>[0];

const FRONTMATTER = { title: 'Troms', image: '', gallery: [] };
const VALID = { year: '2025', slug: 'troms' };

function context(params: Record<string, string>, init?: { body?: string; search?: string }) {
    const url = new URL(`http://localhost/api/admin/voyages/x${init?.search ?? ''}`);
    const request = new Request(url, { method: init?.body ? 'PUT' : 'GET', body: init?.body });
    return { params, url, request } as unknown as Context;
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('DEV', true);
});

afterEach(() => vi.unstubAllEnvs());

describe('GET /api/admin/voyages/[year]/[slug]', () => {
    it('renvoie le voyage, 404 s’il manque, 400 si les paramètres sont invalides', async () => {
        files.readVoyage.mockResolvedValueOnce({ ...FRONTMATTER, body: 'x' }).mockResolvedValueOnce(null);
        expect(await (await GET(context(VALID))).json()).toEqual({ ...FRONTMATTER, body: 'x' });
        const missing = await GET(context(VALID));
        expect(missing.status).toBe(404);
        expect(await missing.json()).toEqual({ error: 'Not found' });
        expect((await GET(context({ year: '2025', slug: 'A' }))).status).toBe(400);
        expect(files.readVoyage).toHaveBeenCalledTimes(2);
    });

    it('renvoie 404 hors dev pour toutes les méthodes', async () => {
        vi.stubEnv('DEV', false);
        for (const handler of [GET, PUT, DELETE]) {
            expect((await handler(context(VALID))).status).toBe(404);
        }
        expect(files.deleteVoyage).not.toHaveBeenCalled();
    });
});

describe('PUT /api/admin/voyages/[year]/[slug]', () => {
    it('réécrit le voyage', async () => {
        files.writeVoyage.mockResolvedValue({ revision: 'r2' });
        const response = await PUT(
            context(VALID, { body: JSON.stringify({ frontmatter: FRONTMATTER, body: 'B', revision: 'r1' }) }),
        );
        expect(await response.json()).toEqual({ ok: true, revision: 'r2' });
        expect(files.writeVoyage).toHaveBeenCalledWith('2025', 'troms', FRONTMATTER, 'B', { expectedRevision: 'r1' });
    });

    it('renvoie 409 si le voyage a changé depuis son ouverture', async () => {
        const { ContentConflictError } = await import('@/lib/admin/stores/content-writer');
        files.writeVoyage.mockRejectedValue(new ContentConflictError('x'));
        const response = await PUT(context(VALID, { body: JSON.stringify({ frontmatter: FRONTMATTER, body: 'B' }) }));
        expect(response.status).toBe(409);
    });

    it('renvoie 400 pour un corps incomplet ou des paramètres invalides', async () => {
        const response = await PUT(context(VALID, { body: JSON.stringify({ body: 'B' }) }));
        expect(await response.json()).toEqual({ error: 'Missing frontmatter or body' });
        expect((await PUT(context(VALID, { body: '{' }))).status).toBe(400);
        expect((await PUT(context({ year: '25', slug: 'troms' }, { body: '{}' }))).status).toBe(400);
        expect(files.writeVoyage).not.toHaveBeenCalled();
    });
});

describe('DELETE /api/admin/voyages/[year]/[slug]', () => {
    it('renvoie 502 si GitHub refuse la suppression', async () => {
        const { GitHubApiError } = await import('@/lib/admin/github/app-client');
        files.deleteVoyage.mockRejectedValueOnce(new GitHubApiError(500, 'boom'));
        vi.spyOn(console, 'error').mockImplementation(() => {});
        expect((await DELETE(context(VALID))).status).toBe(502);
    });

    it('supprime le voyage, avec les assets seulement si assets=1', async () => {
        await DELETE(context(VALID));
        const response = await DELETE(context(VALID, { search: '?assets=1' }));
        expect(await response.json()).toEqual({ ok: true });
        expect(files.deleteVoyage.mock.calls).toEqual([
            ['2025', 'troms', false],
            ['2025', 'troms', true],
        ]);
        expect((await DELETE(context({ year: '2025', slug: '..' }))).status).toBe(400);
    });
});
