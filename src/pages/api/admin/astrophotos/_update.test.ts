// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const astro = vi.hoisted(() => ({ updatePhotoMetadata: vi.fn() }));
vi.mock('@/lib/admin/astrophotos', () => astro);

import { POST } from './update';

function post(body: unknown) {
    const request = new Request('http://localhost/api/admin/astrophotos/update', {
        method: 'POST',
        body: typeof body === 'string' ? body : JSON.stringify(body),
    });
    return POST({ request } as unknown as Parameters<typeof POST>[0]);
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('DEV', true);
});

afterEach(() => vi.unstubAllEnvs());

describe('POST /api/admin/astrophotos/update', () => {
    it('transmet les métadonnées à updatePhotoMetadata', async () => {
        const response = await post({
            id: '123',
            year: '2024',
            title: 'M42',
            alt: 'a',
            seo: 's',
            draft: true,
            extra: 'x',
        });
        expect(await response.json()).toEqual({ ok: true });
        expect(astro.updatePhotoMetadata).toHaveBeenCalledWith('123', '2024', 'M42', {
            alt: 'a',
            wiki: undefined,
            tech: undefined,
            seo: 's',
            draft: true,
        });
    });

    it('renvoie 502 si GitHub refuse le commit', async () => {
        const { GitHubApiError } = await import('@/lib/admin/github/app-client');
        astro.updatePhotoMetadata.mockRejectedValue(new GitHubApiError(422, 'refus'));
        const response = await post({ id: '123', year: '2024', title: 'M42' });
        expect(response.status).toBe(502);
    });

    it('renvoie 500 avec le message si l’écriture échoue', async () => {
        astro.updatePhotoMetadata.mockRejectedValue(new Error('disque plein'));
        const response = await post({ id: '123', year: '2024', title: 'M42' });
        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: 'disque plein' });
    });

    it.each([
        ['JSON invalide', 'pas du json', 'Payload JSON attendu'],
        ['id absent', { year: '2024', title: 'M42' }, 'ID Astrobin manquant ou invalide'],
        ['id non numérique', { id: '12a', year: '2024', title: 'M42' }, 'ID Astrobin manquant ou invalide'],
        ['année invalide', { id: '1', year: '24', title: 'M42' }, 'Année manquante ou invalide'],
        ['titre vide', { id: '1', year: '2024', title: '  ' }, 'Titre manquant'],
        ['titre non textuel', { id: '1', year: '2024', title: 123 }, 'Titre manquant'],
    ])('renvoie 400 : %s', async (_label, body, error) => {
        const response = await post(body);
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error });
        expect(astro.updatePhotoMetadata).not.toHaveBeenCalled();
    });

    it('renvoie 404 hors dev', async () => {
        vi.stubEnv('DEV', false);
        expect((await post({ id: '1', year: '2024', title: 'x' })).status).toBe(404);
    });
});
