/**
 * Tests du client Wikipedia (résumés REST) : ordre FR puis EN, dédoublonnage
 * des candidats et rejet des pages d'homonymie.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchWikipedia } from './wikipedia';

const fetchMock = vi.fn();

function jsonResponse(body: unknown, ok = true): Response {
    return { ok, json: async () => body } as unknown as Response;
}

describe('fetchWikipedia', () => {
    beforeEach(() => {
        fetchMock.mockReset();
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('renvoie le premier résumé français trouvé avec son image d’origine', async () => {
        fetchMock.mockResolvedValue(
            jsonResponse({
                title: 'Galaxie d’Andromède',
                extract: 'La galaxie d’Andromède…',
                content_urls: { desktop: { page: 'https://fr.wikipedia.org/wiki/Galaxie_d%27Androm%C3%A8de' } },
                originalimage: { source: 'https://upload/orig.jpg' },
                thumbnail: { source: 'https://upload/thumb.jpg' },
            }),
        );
        const result = await fetchWikipedia(['M 31']);
        expect(fetchMock.mock.calls[0][0]).toBe('https://fr.wikipedia.org/api/rest_v1/page/summary/M%2031');
        expect(result).toEqual({
            title: 'Galaxie d’Andromède',
            lang: 'fr',
            extract: 'La galaxie d’Andromède…',
            url: 'https://fr.wikipedia.org/wiki/Galaxie_d%27Androm%C3%A8de',
            imageUrl: 'https://upload/orig.jpg',
        });
    });

    it('essaie tous les candidats en français avant l’anglais et complète les champs manquants', async () => {
        fetchMock
            .mockResolvedValueOnce(jsonResponse({}, false))
            .mockRejectedValueOnce(new Error('réseau'))
            .mockResolvedValueOnce(jsonResponse({ extract: 'x', type: 'disambiguation' }))
            .mockResolvedValueOnce(jsonResponse({ extract: 'Messier 42 is…', thumbnail: { source: 'thumb.jpg' } }));
        const result = await fetchWikipedia(['NGC 1976', 'ngc 1976', '', 'Messier 42']);
        const urls = fetchMock.mock.calls.map((c) => c[0] as string);
        expect(urls).toEqual([
            'https://fr.wikipedia.org/api/rest_v1/page/summary/NGC%201976',
            'https://fr.wikipedia.org/api/rest_v1/page/summary/Messier%2042',
            'https://en.wikipedia.org/api/rest_v1/page/summary/NGC%201976',
            'https://en.wikipedia.org/api/rest_v1/page/summary/Messier%2042',
        ]);
        expect(result).toEqual({
            title: 'Messier 42',
            lang: 'en',
            extract: 'Messier 42 is…',
            url: 'https://en.wikipedia.org/wiki/Messier%2042',
            imageUrl: 'thumb.jpg',
        });
    });

    it('renvoie null quand aucun candidat n’aboutit', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ title: 'Vide' }));
        expect(await fetchWikipedia(['Inconnu'])).toBeNull();
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});
