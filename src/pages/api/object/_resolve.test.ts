import { describe, it, expect, vi, beforeEach } from 'vitest';

const { resolveObject } = vi.hoisted(() => ({ resolveObject: vi.fn() }));
vi.mock('@/lib/objects/resolve', () => ({ resolveObject }));

import { GET } from './resolve';

function callRoute(query: string) {
    const url = new URL(`https://www.miroirspolaires.fr/api/object/resolve${query}`);
    return GET({ url, request: new Request(url) } as Parameters<typeof GET>[0]);
}

describe('GET /api/object/resolve', () => {
    beforeEach(() => {
        resolveObject.mockReset();
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it.each([[''], ['?q=%20'], [`?q=${'m'.repeat(81)}`]])('refuse « %s »', async (query) => {
        const response = await callRoute(query);
        expect(response.status).toBe(400);
        expect(resolveObject).not.toHaveBeenCalled();
    });

    it('renvoie l’objet résolu', async () => {
        resolveObject.mockResolvedValue({ name: 'M31' });
        const response = await callRoute('?q=M31');
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ name: 'M31' });
    });

    it('renvoie 404 quand rien n’est trouvé', async () => {
        resolveObject.mockResolvedValue(null);
        const response = await callRoute('?q=Inconnu');
        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: 'Aucun objet trouvé pour "Inconnu".' });
    });

    it('ne divulgue pas le détail d’une erreur interne', async () => {
        resolveObject.mockRejectedValue(new Error('SIMBAD 503 at http://internal'));
        const response = await callRoute('?q=M31');
        expect(response.status).toBe(500);
        expect(JSON.stringify(await response.json())).not.toContain('internal');
    });
});
