/**
 * Tests du client SIMBAD TAP : requête principale, alias, type d'objet et flux
 * (fetch mocké et routé selon la requête ADQL).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchSimbad } from './simbad';
import { resetUpstreamCircuits } from '@/lib/upstream/failover';

interface TapTable {
    metadata?: { name: string }[];
    data?: unknown[][];
}

const fetchMock = vi.fn();

function table(cols: string[], rows: unknown[][]): TapTable {
    return { metadata: cols.map((name) => ({ name })), data: rows };
}

function queryOf(url: string): string {
    return new URL(url).searchParams.get('query') ?? '';
}

function route(handlers: {
    basic: TapTable | Error;
    ident?: TapTable | Error;
    otype?: TapTable | Error;
    flux?: TapTable | Error;
}) {
    fetchMock.mockImplementation(async (url: string) => {
        const q = queryOf(url);
        const pick = q.includes('FROM basic')
            ? handlers.basic
            : q.includes('FROM ident')
              ? handlers.ident
              : q.includes('FROM otypedef')
                ? handlers.otype
                : handlers.flux;
        if (pick instanceof Error) return { ok: false, status: 500, json: async () => ({}) };
        return { ok: true, json: async () => pick ?? {} };
    });
}

const BASIC_COLS = [
    'oid',
    'main_id',
    'ra',
    'dec',
    'otype',
    'sp_type',
    'morph_type',
    'plx_value',
    'rvz_redshift',
    'rvz_radvel',
    'galdim_majaxis',
    'galdim_minaxis',
    'galdim_angle',
];

describe('fetchSimbad', () => {
    it('lit les flux dans la table `flux`, seule à exposer `filter` et `flux`', async () => {
        route({ basic: table(BASIC_COLS, [[1, 'M 31', 10, 41, 'AGN', '', '', null, null, null, null, null, null]]) });
        await fetchSimbad('M 31');
        const queries = fetchMock.mock.calls.map(([url]) => queryOf(url as string));
        expect(queries).toContain('SELECT filter, flux FROM flux WHERE oidref = 1');
    });

    it('interroge le miroir quand le CDS ne répond pas', async () => {
        fetchMock.mockImplementation(async (url: string) => {
            if (url.includes('cds.unistra.fr')) throw new TypeError('fetch failed');
            return { ok: true, json: async () => table(['main_id', 'oid'], [['M 31', 1]]) };
        });
        expect((await fetchSimbad('M 31'))?.mainId).toBe('M 31');
        expect(fetchMock.mock.calls[1][0]).toContain('simbad.harvard.edu');
    });

    beforeEach(() => {
        resetUpstreamCircuits();
        fetchMock.mockReset();
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('agrège la fiche, les alias, le libellé du type et les flux', async () => {
        route({
            basic: table(BASIC_COLS, [
                [1575544, 'M  31 ', 10.68, 41.27, 'AGx', '', 'SA(s)b', 0.5, -0.001, -300, 199.5, 70, 35],
            ]),
            ident: table(['id'], [['M  31'], ['NGC   224'], [' '], [null]]),
            otype: table(['description'], [['Active Galaxy Nucleus']]),
            flux: table(
                ['filter', 'flux'],
                [
                    ['V', 3.44],
                    ['B', 4.36],
                    ['R', null],
                ],
            ),
        });
        const result = await fetchSimbad("Barnard's Galaxy");
        expect(queryOf(fetchMock.mock.calls[0][0] as string)).toContain("i.id = 'Barnard''s Galaxy'");
        expect(result).toEqual({
            mainId: 'M  31',
            coords: { ra: 10.68, dec: 41.27 },
            otype: 'AGx',
            otypeText: 'Active Galaxy Nucleus',
            spType: undefined,
            morphType: 'SA(s)b',
            plxMas: 0.5,
            redshift: -0.001,
            radvelKms: -300,
            dimMajArcmin: 199.5,
            dimMinArcmin: 70,
            dimAngleDeg: 35,
            aliases: ['M  31', 'NGC   224'],
            fluxes: { V: 3.44, B: 4.36 },
        });
    });

    it('tolère l’échec des requêtes secondaires et les valeurs non numériques', async () => {
        route({
            basic: table(BASIC_COLS, [[42, null, null, 5, null, 'G2V', null, 'x', Number.NaN, null, null, null, null]]),
            ident: new Error('down'),
            otype: new Error('down'),
            flux: new Error('down'),
        });
        const result = await fetchSimbad('HD 1');
        expect(result).toMatchObject({
            mainId: '',
            coords: undefined,
            otype: undefined,
            otypeText: undefined,
            spType: 'G2V',
            plxMas: undefined,
            redshift: undefined,
            aliases: [],
            fluxes: {},
        });
    });

    it('renvoie null si l’objet est inconnu, si la réponse est vide ou si la requête échoue', async () => {
        route({ basic: table(BASIC_COLS, []) });
        expect(await fetchSimbad('Inconnu')).toBeNull();

        route({ basic: {} });
        expect(await fetchSimbad('Inconnu')).toBeNull();

        route({ basic: new Error('500') });
        expect(await fetchSimbad('Inconnu')).toBeNull();
    });
});
