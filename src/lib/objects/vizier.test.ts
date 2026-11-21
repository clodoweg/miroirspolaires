/**
 * Tests de l'enrichissement VizieR (Sh2, LBN, NGC/IC) : détection des
 * identifiants dans les alias, requêtes ADQL et normalisation des champs.
 */

import { readFileSync } from 'node:fs';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchCatalogEntries } from './vizier';
import { resetUpstreamCircuits } from '@/lib/upstream/failover';

interface TapTable {
    metadata?: { name: string }[];
    data?: unknown[][];
}

const fetchMock = vi.fn();

function table(row: Record<string, unknown> | null): TapTable {
    if (!row) return { metadata: [{ name: 'x' }], data: [] };
    const cols = Object.keys(row);
    return { metadata: cols.map((name) => ({ name })), data: [cols.map((c) => row[c])] };
}

function queryOf(url: string): string {
    return new URL(url).searchParams.get('query') ?? '';
}

/** Associe un fragment de requête ADQL à la table renvoyée ; `'fail'` simule une erreur HTTP. */
function route(byFragment: Record<string, TapTable | 'fail'>) {
    fetchMock.mockImplementation(async (url: string) => {
        const q = queryOf(url);
        const key = Object.keys(byFragment).find((k) => q.includes(k));
        const value = key ? byFragment[key] : table(null);
        if (value === 'fail') return { ok: false, status: 503, json: async () => ({}) };
        return { ok: true, json: async () => value };
    });
}

describe('fetchCatalogEntries', () => {
    beforeEach(() => {
        resetUpstreamCircuits();
        fetchMock.mockReset();
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    describe('pendant une panne du CDS', () => {
        const fixtures: [string, string][] = [
            ['VII%2F118', 'ngc-exact'],
            ['VII%2F20', 'sh2-exact'],
            ['VII%2F9', 'lbn-exact'],
        ];

        beforeEach(() => {
            fetchMock.mockImplementation(async (url: string) => {
                if (url.includes('cds.unistra.fr')) throw new TypeError('fetch failed');
                const fixture = fixtures.find(([source]) => url.includes(`-source=${source}`))?.[1];
                const text = readFileSync(`src/test/fixtures/vizier-asu/${fixture}.tsv`, 'utf-8');
                return { ok: true, text: async () => text };
            });
        });

        it('NGC : garde le padding du nom et lit la réponse réelle', async () => {
            const [entry] = await fetchCatalogEntries(['NGC 224']);
            const asuUrl = fetchMock.mock.calls.map(([url]) => url as string).find((url) => url.includes('asu-tsv'));
            expect(asuUrl).toContain('Name=%20%20224');
            expect(entry.catalogId).toBe('NGC 224');
            expect(entry.fields).toEqual(
                expect.arrayContaining([
                    { label: 'Magnitude intégrée', value: '3.5' },
                    { label: 'Plus grande dimension', value: '178′' },
                    { label: 'Constellation', value: 'And' },
                ]),
            );
        });

        it('Sh2 et LBN : retrouvent les mêmes champs qu’en TAP', async () => {
            const entries = await fetchCatalogEntries(['Sh2-155', 'LBN 1000']);
            expect(entries.map((entry) => entry.catalogId)).toEqual(['Sh2-155', 'LBN 1000']);
            expect(entries[0].fields).toEqual(expect.arrayContaining([{ label: 'Diamètre', value: '60′' }]));
            expect(entries[1].fields).toEqual(expect.arrayContaining([{ label: 'Autre nom', value: 'C 71' }]));
        });
    });

    it('ne fait aucune requête sans identifiant reconnu', async () => {
        expect(await fetchCatalogEntries(['M 31', 'NAME Andromeda'])).toEqual([]);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('normalise une fiche Sharpless avec les libellés français', async () => {
        route({ '"Sh2" = 155': table({ Sh2: 155, Diam: 50, Form: 2, Struct: 3, Bright: 1, Stars: 'BD+61 2413' }) });
        const [entry] = await fetchCatalogEntries(['SH  2-155']);
        expect(entry).toEqual({
            catalog: 'Sharpless 2 (1959)',
            catalogId: 'Sh2-155',
            fields: [
                { label: 'Diamètre', value: '50′' },
                { label: 'Forme', value: 'elliptique' },
                { label: 'Structure', value: 'filamentaire' },
                { label: 'Brillance', value: 'faible' },
                { label: 'Étoiles associées', value: 'BD+61 2413' },
            ],
            sourceUrl: 'https://vizier.cds.unistra.fr/viz-bin/VizieR-3?-source=VII/20&Sh2=155',
        });
    });

    it('garde les codes Sharpless inconnus tels quels', async () => {
        route({ '"Sh2" = 1': table({ Sh2: 1, Diam: null, Form: 9, Struct: 8, Bright: 7, Stars: null }) });
        const [entry] = await fetchCatalogEntries(['Sh2-1']);
        expect(entry.fields).toEqual([
            { label: 'Forme', value: '9' },
            { label: 'Structure', value: '8' },
            { label: 'Brillance', value: '7' },
        ]);
    });

    it('normalise une fiche LBN avec ses deux dimensions ou une seule', async () => {
        route({
            '"Seq" = 331': table({
                Seq: 331,
                Diam1: 60,
                Diam2: 30,
                Area: 0.5,
                Bright: 1,
                Color: 1,
                Name: ' NGC 7000 ',
            }),
            '"Seq" = 12': table({ Seq: 12, Diam1: 20, Diam2: null, Area: null, Bright: null, Color: 9, Name: '  ' }),
        });
        const entries = await fetchCatalogEntries(['LBN 331', 'lbn12']);
        expect(entries[0].fields).toEqual([
            { label: 'Dimensions', value: '60′ × 30′' },
            { label: 'Surface', value: '0.5 deg²' },
            { label: 'Brillance (1=la plus forte)', value: '1' },
            { label: 'Type', value: 'majoritairement à émission' },
            { label: 'Autre nom', value: 'NGC 7000' },
        ]);
        expect(entries[1]).toMatchObject({
            catalogId: 'LBN 12',
            fields: [
                { label: 'Dimension', value: '20′' },
                { label: 'Type', value: '9' },
            ],
        });
    });

    it('interroge NGC 2000.0 avec le nom paddé pour NGC et IC', async () => {
        route({
            '"Name" = \' 7000\'': table({
                Name: ' 7000',
                Type: ' Nb ',
                mag: 4,
                size: 120,
                Const: 'Cyg ',
                Desc: ' !!! vB,eL ',
            }),
            '"Name" = \'I 434\'': table({ Name: 'I 434', Type: '', mag: null, size: null, Const: '', Desc: '' }),
        });
        const entries = await fetchCatalogEntries(['NGC 7000', 'IC  434']);
        expect(entries[0]).toEqual({
            catalog: 'NGC 2000.0 (Sky Publishing)',
            catalogId: 'NGC 7000',
            fields: [
                { label: 'Classification', value: 'Nb' },
                { label: 'Magnitude intégrée', value: '4' },
                { label: 'Plus grande dimension', value: '120′' },
                { label: 'Constellation', value: 'Cyg' },
                { label: 'Description', value: '!!! vB,eL' },
            ],
            sourceUrl: 'https://vizier.cds.unistra.fr/viz-bin/VizieR-3?-source=VII/118',
        });
        expect(entries[1]).toMatchObject({ catalogId: 'IC 434', fields: [] });
    });

    it('dédoublonne les identifiants et écarte les lignes absentes ou en erreur', async () => {
        route({
            '"Sh2" = 2': 'fail',
            '"Seq" = 5': 'fail',
            '"Name" = \'    1\'': 'fail',
        });
        const entries = await fetchCatalogEntries(['NGC 1', 'NGC1', 'Sh2-2', 'LBN 5', 'Sh2-3', 'LBN 6', 'NGC 2']);
        expect(entries).toEqual([]);
        // NGC 1 n'est interrogé qu'une fois malgré ses deux écritures.
        const ngc1Calls = fetchMock.mock.calls.filter((c) => queryOf(c[0] as string).includes("'    1'"));
        expect(ngc1Calls).toHaveLength(1);
    });
});
