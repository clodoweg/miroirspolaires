import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type NominatimModule = typeof import('./nominatim');

function nominatimResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const PARIS = [{ lat: '48.85', lon: '2.35', display_name: 'Paris, France', type: 'city', category: 'place' }];

describe('geocodePlace', () => {
    let nominatim: NominatimModule;
    const fetchMock = vi.fn();

    beforeEach(async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-27T12:00:00Z'));
        // POURQUOI : le module garde cache et cadence en mémoire ; chaque test repart d'un état neuf.
        vi.resetModules();
        nominatim = await import('./nominatim');
        fetchMock.mockReset();
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('envoie un User-Agent descriptif et un délai d’expiration', async () => {
        fetchMock.mockResolvedValue(nominatimResponse(PARIS));
        const results = await nominatim.geocodePlace('Paris');
        expect(results).toEqual([
            { lat: 48.85, lon: 2.35, displayName: 'Paris, France', type: 'city', category: 'place' },
        ]);
        const [, init] = fetchMock.mock.calls[0];
        expect(init.headers['User-Agent']).toMatch(/miroirspolaires\.fr/);
        expect(init.signal).toBeInstanceOf(AbortSignal);
    });

    it('sert la même requête depuis le cache, sans nouvel appel', async () => {
        fetchMock.mockResolvedValue(nominatimResponse(PARIS));
        await nominatim.geocodePlace('Paris');
        await nominatim.geocodePlace('  paris ');
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('espace deux appels distincts d’au moins une seconde', async () => {
        fetchMock.mockImplementation(async () => nominatimResponse(PARIS));
        await nominatim.geocodePlace('Paris');
        const second = nominatim.geocodePlace('Lyon');
        await vi.advanceTimersByTimeAsync(999);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1);
        await second;
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('refuse une rafale qui ferait attendre plus de quelques secondes', async () => {
        fetchMock.mockImplementation(async () => nominatimResponse(PARIS));
        const pending = ['a1', 'a2', 'a3', 'a4'].map((query) => nominatim.geocodePlace(query));
        await expect(nominatim.geocodePlace('a5')).rejects.toBeInstanceOf(nominatim.GeocodeRateLimitError);
        await vi.runAllTimersAsync();
        await Promise.all(pending);
    });

    it('signale une réponse amont qui n’est pas un tableau', async () => {
        fetchMock.mockResolvedValue(nominatimResponse({ error: 'bad' }));
        await expect(nominatim.geocodePlace('Paris')).rejects.toBeInstanceOf(nominatim.GeocodeUpstreamError);
    });

    it('signale un statut amont en erreur', async () => {
        fetchMock.mockResolvedValue(nominatimResponse([], 503));
        await expect(nominatim.geocodePlace('Paris')).rejects.toBeInstanceOf(nominatim.GeocodeUpstreamError);
    });

    it('écarte les entrées sans coordonnées valides', async () => {
        fetchMock.mockResolvedValue(nominatimResponse([...PARIS, { lat: 'x', lon: '2', display_name: 'Nulle part' }]));
        expect(await nominatim.geocodePlace('Paris')).toHaveLength(1);
    });
});
