/**
 * Tests du client NED ObjectLookup (fetch mocké).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchNed } from './ned';

const fetchMock = vi.fn();

function jsonResponse(body: unknown, ok = true): Response {
    return { ok, json: async () => body } as unknown as Response;
}

describe('fetchNed', () => {
    beforeEach(() => {
        fetchMock.mockReset();
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('envoie le nom en POST et normalise la réponse complète', async () => {
        fetchMock.mockResolvedValue(
            jsonResponse({
                ResultCode: 3,
                Preferred: {
                    Name: 'MESSIER 031',
                    Position: { RA: 10.68, Dec: 41.27 },
                    Redshift: { Value: -0.001, Uncertainty: 0.00001, RefCode: '1991RC3.9.C...0000d' },
                    ObjType: { Value: 'G' },
                },
            }),
        );
        const result = await fetchNed('M31');
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://ned.ipac.caltech.edu/srs/ObjectLookup');
        expect(init.method).toBe('POST');
        expect(String(init.body)).toContain(encodeURIComponent(JSON.stringify({ name: { v: 'M31' } })));
        expect(result).toEqual({
            preferredName: 'MESSIER 031',
            coords: { ra: 10.68, dec: 41.27 },
            redshift: -0.001,
            redshiftUncertainty: 0.00001,
            redshiftRef: '1991RC3.9.C...0000d',
            objType: 'G',
        });
    });

    it('omet les champs absents ou mal typés', async () => {
        fetchMock.mockResolvedValue(
            jsonResponse({
                ResultCode: 3,
                Preferred: { Name: 'NGC 1', Position: { RA: '1', Dec: 2 }, Redshift: { Value: 0.01 } },
            }),
        );
        expect(await fetchNed('NGC 1')).toEqual({ preferredName: 'NGC 1', redshift: 0.01 });
    });

    it('renvoie null sur erreur HTTP, objet inconnu ou nom manquant', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({}, false));
        expect(await fetchNed('X')).toBeNull();
        fetchMock.mockResolvedValueOnce(jsonResponse({ ResultCode: 0 }));
        expect(await fetchNed('X')).toBeNull();
        fetchMock.mockResolvedValueOnce(jsonResponse({ ResultCode: 3, Preferred: {} }));
        expect(await fetchNed('X')).toBeNull();
    });
});
