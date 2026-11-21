import { describe, it, expect, vi, beforeEach } from 'vitest';

const { buildRecommendations } = vi.hoisted(() => ({ buildRecommendations: vi.fn() }));
vi.mock('@/lib/recommendations/score', () => ({ buildRecommendations }));

import { GET } from './recommendations';
import { DEFAULT_LOCATION } from '@/lib/objects/observation';

function callRoute(query: string) {
    const url = new URL(`https://www.miroirspolaires.fr/api/recommendations${query}`);
    return GET({ url, request: new Request(url) } as Parameters<typeof GET>[0]);
}

describe('GET /api/recommendations', () => {
    beforeEach(() => {
        buildRecommendations.mockReset();
        buildRecommendations.mockResolvedValue({ items: [], poolSize: 0, referenceMonthStart: '2026-10-01' });
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('transmet un lieu et une date valides', async () => {
        const response = await callRoute('?lat=48.85&lon=2.35&name=Paris&date=2026-10-27T20:00:00Z');
        expect(response.status).toBe(200);
        const options = buildRecommendations.mock.calls[0][0];
        expect(options.location).toEqual({ lat: 48.85, lon: 2.35, name: 'Paris' });
        expect(options.date.toISOString()).toBe('2026-10-27T20:00:00.000Z');
        expect(options.minAltDeg).toBe(30);
        expect(options.limit).toBeUndefined();
    });

    it('utilise le lieu par défaut sans coordonnées', async () => {
        await callRoute('');
        expect(buildRecommendations.mock.calls[0][0].location).toEqual(DEFAULT_LOCATION);
    });

    it.each([['?lat=999&lon=2'], ['?lat=45&lon=-500'], ['?lat=abc&lon=2']])(
        'refuse des coordonnées hors de la Terre (%s)',
        async (query) => {
            const response = await callRoute(query);
            expect(response.status).toBe(400);
            expect(buildRecommendations).not.toHaveBeenCalled();
        },
    );

    it('met en cache 24 h un résultat complet, 5 min un résultat partiel', async () => {
        buildRecommendations.mockResolvedValue({ items: [], poolSize: 1, poolComplete: true });
        expect((await callRoute('')).headers.get('Cache-Control')).toContain('s-maxage=86400');

        buildRecommendations.mockResolvedValue({ items: [], poolSize: 1, poolComplete: false });
        expect((await callRoute('')).headers.get('Cache-Control')).toBe('public, max-age=60, s-maxage=300');
    });

    it('refuse une date invalide', async () => {
        const response = await callRoute('?date=demain');
        expect(response.status).toBe(400);
    });

    it('borne limit, minAlt et la longueur du nom', async () => {
        await callRoute(`?lat=10&lon=10&limit=999999&minAlt=500&name=${'n'.repeat(300)}`);
        const options = buildRecommendations.mock.calls[0][0];
        expect(options.limit).toBe(500);
        expect(options.minAltDeg).toBe(80);
        expect(options.location.name).toHaveLength(80);
    });

    it('renvoie un 500 générique', async () => {
        buildRecommendations.mockRejectedValue(new Error('TAP CDS timeout interne'));
        const response = await callRoute('');
        expect(response.status).toBe(500);
        expect(JSON.stringify(await response.json())).not.toContain('TAP');
    });
});
