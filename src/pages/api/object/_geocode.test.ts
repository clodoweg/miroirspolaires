import { describe, it, expect, vi, beforeEach } from 'vitest';

const { geocodePlace } = vi.hoisted(() => ({ geocodePlace: vi.fn() }));

vi.mock('../../../lib/objects/nominatim', async (importOriginal) => {
    const original = await importOriginal<typeof import('../../../lib/objects/nominatim')>();
    return { ...original, geocodePlace };
});

import { GET } from './geocode';
import { GeocodeRateLimitError, GeocodeUpstreamError } from '../../../lib/objects/nominatim';

function callRoute(query: string) {
    const url = new URL(`https://www.miroirspolaires.fr/api/object/geocode${query}`);
    return GET({ url, request: new Request(url) } as Parameters<typeof GET>[0]);
}

describe('GET /api/object/geocode', () => {
    beforeEach(() => {
        geocodePlace.mockReset();
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it.each([[''], ['?q='], ['?q=a'], [`?q=${'x'.repeat(201)}`]])('refuse la requête « %s »', async (query) => {
        const response = await callRoute(query);
        expect(response.status).toBe(400);
        expect(geocodePlace).not.toHaveBeenCalled();
    });

    it('renvoie les résultats avec un cache CDN', async () => {
        geocodePlace.mockResolvedValue([{ lat: 1, lon: 2, displayName: 'Lieu' }]);
        const response = await callRoute('?q=Paris');
        expect(response.status).toBe(200);
        expect(response.headers.get('Cache-Control')).toContain('s-maxage=86400');
        expect(await response.json()).toEqual({ results: [{ lat: 1, lon: 2, displayName: 'Lieu' }] });
    });

    it('répond 429 quand la cadence Nominatim serait dépassée', async () => {
        geocodePlace.mockRejectedValue(new GeocodeRateLimitError('rafale'));
        const response = await callRoute('?q=Paris');
        expect(response.status).toBe(429);
        expect(response.headers.get('Retry-After')).toBe('2');
    });

    it('répond 502 sans détail quand Nominatim échoue', async () => {
        geocodePlace.mockRejectedValue(new GeocodeUpstreamError('Nominatim a répondu 503 interne'));
        const response = await callRoute('?q=Paris');
        expect(response.status).toBe(502);
        expect(JSON.stringify(await response.json())).not.toContain('interne');
    });

    it('répond 500 générique sur une erreur inattendue', async () => {
        geocodePlace.mockRejectedValue(new Error('stack secrète'));
        const response = await callRoute('?q=Paris');
        expect(response.status).toBe(500);
        expect(JSON.stringify(await response.json())).not.toContain('secrète');
    });
});
