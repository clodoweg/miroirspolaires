/**
 * Tests du résolveur de noms CDS Sesame (fetch mocké, sortie texte brut).
 */

import { readFileSync } from 'node:fs';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveWithSesame } from './sesame';
import { resetUpstreamCircuits } from '@/lib/upstream/failover';

const fetchMock = vi.fn();

function textResponse(body: string, ok = true): Response {
    return { ok, text: async () => body } as unknown as Response;
}

describe('resolveWithSesame', () => {
    beforeEach(() => {
        resetUpstreamCircuits();
        fetchMock.mockReset();
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('encode le nom dans l’URL et extrait coordonnées, nom canonique et alias dédoublonnés', async () => {
        fetchMock.mockResolvedValue(
            textResponse(
                [
                    '# M 31   #Q123',
                    '#=Sc=Simbad:    1',
                    '%J 10.684708 +41.268750 = 00:42:44.33 +41:16:07.5',
                    '%I.0 M  31',
                    '%I NGC  224',
                    '%I M 31',
                    '%I   ',
                    '#=N=NED: 1',
                    '%J 10.68 +41.27',
                    '%I.0 MESSIER 031',
                ].join('\r\n'),
            ),
        );
        const result = await resolveWithSesame('M 31');
        expect(fetchMock.mock.calls[0][0]).toBe('https://cds.unistra.fr/cgi-bin/nph-sesame/-op/A?M%2031');
        expect(result).toEqual({
            canonicalName: 'M  31',
            ra: 10.684708,
            dec: 41.26875,
            aliases: ['M 31', 'NGC 224', 'MESSIER 031'],
        });
    });

    it('prend le premier alias comme nom canonique sans ligne %I.0', async () => {
        fetchMock.mockResolvedValue(textResponse('%J 83.8 -5.39\n%I NGC 1976\n%I M 42'));
        const result = await resolveWithSesame('orion');
        expect(result?.canonicalName).toBe('NGC 1976');
    });

    it('se rabat sur le nom saisi sans aucun identifiant', async () => {
        fetchMock.mockResolvedValue(textResponse('%J 1.5 -2.5'));
        expect(await resolveWithSesame('cible')).toEqual({ canonicalName: 'cible', ra: 1.5, dec: -2.5, aliases: [] });
    });

    it('renvoie null sans coordonnées, sans essayer une autre route', async () => {
        fetchMock.mockResolvedValueOnce(textResponse('%I.0 M 31\n%J pas-de-nombre'));
        expect(await resolveWithSesame('M 31')).toBeNull();
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('bascule sur Harvard et lit sa réponse réelle quand le CDS ne répond pas', async () => {
        const harvardResponse = readFileSync('src/test/fixtures/sesame-harvard-m31.txt', 'utf-8');
        fetchMock.mockImplementation(async (url: string) => {
            if (url.includes('cds.unistra.fr')) throw new TypeError('fetch failed');
            return textResponse(harvardResponse);
        });
        const result = await resolveWithSesame('M31');
        expect(fetchMock.mock.calls[1][0]).toBe('https://vizier.cfa.harvard.edu/viz-bin/nph-sesame/-oI/SNV?M31');
        expect(result?.canonicalName).toBe('M  31');
        expect(result?.ra).toBeCloseTo(10.684708, 5);
        expect(result?.dec).toBeCloseTo(41.26875, 5);
        expect(result?.aliases).toContain('NGC 224');
    });

    it('signale la panne quand toutes les routes échouent', async () => {
        fetchMock.mockResolvedValue(textResponse('', false));
        await expect(resolveWithSesame('M 31')).rejects.toThrow('Sesame indisponible');
    });
});
