/**
 * Tests des récupérateurs de catalogues (SIMBAD et VizieR via TAP, fetch mocké) :
 * normalisation de chaque source, précession, constellation, tri et cache mémoire.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CatalogueEntry } from './fetch';

type Row = Record<string, unknown>;

const fetchMock = vi.fn();
const { loadCatalogueSnapshot } = vi.hoisted(() => ({ loadCatalogueSnapshot: vi.fn() }));
vi.mock('./snapshot', () => ({ loadCatalogueSnapshot }));

function tapResponse(rows: Row[]) {
    const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    return {
        ok: true,
        json: async () => ({
            metadata: cols.map((name) => ({ name })),
            data: rows.map((r) => cols.map((c) => r[c])),
        }),
    };
}

function queryOf(url: string): string {
    return new URL(url).searchParams.get('query') ?? '';
}

function respondWith(rows: Row[]) {
    fetchMock.mockResolvedValue(tapResponse(rows));
}

async function load() {
    vi.resetModules();
    return import('./fetch');
}

async function entriesOf(slug: string, rows: Row[]): Promise<CatalogueEntry[]> {
    respondWith(rows);
    const { fetchCatalogueEntries } = await load();
    const listing = await fetchCatalogueEntries(slug);
    expect(listing?.catalogue.slug).toBe(slug);
    expect(listing?.total).toBe(listing?.entries.length);
    return listing?.entries ?? [];
}

function byId(entries: CatalogueEntry[], id: string): CatalogueEntry | undefined {
    return entries.find((e) => e.id === id);
}

describe('fetchCatalogueEntries', () => {
    beforeEach(() => {
        fetchMock.mockReset();
        loadCatalogueSnapshot.mockReset();
        loadCatalogueSnapshot.mockResolvedValue(null);
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it('renvoie null pour un catalogue inconnu sans appel réseau', async () => {
        const { fetchCatalogueEntries } = await load();
        expect(await fetchCatalogueEntries('inconnu')).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("lit l'instantané sans interroger le CDS quand il existe", async () => {
        const entries = [{ id: 'M 1', label: 'M 1', ra: 83.6, dec: 22 }];
        loadCatalogueSnapshot.mockResolvedValue(entries);
        const { fetchCatalogueEntries } = await load();
        const listing = await fetchCatalogueEntries('messier');
        expect(listing).toMatchObject({ entries, total: 1 });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('bascule sur le miroir SIMBAD de Harvard quand le CDS ne répond pas', async () => {
        fetchMock.mockImplementation(async (url: string) => {
            if (url.includes('cds.unistra.fr')) throw new TypeError('fetch failed');
            return tapResponse([{ query_id: 'M 1', main_id: 'M   1', ra: 83.6, dec: 22.0 }]);
        });
        const { fetchCatalogueEntries } = await load();
        const listing = await fetchCatalogueEntries('messier');
        expect(byId(listing?.entries ?? [], 'M 1')?.ra).toBe(83.6);
        expect(fetchMock.mock.calls[1][0]).toContain('simbad.harvard.edu');
    });

    it('propage une erreur HTTP du service TAP', async () => {
        fetchMock.mockResolvedValue({ ok: false, status: 502, json: async () => ({}) });
        const { fetchCatalogueEntries } = await load();
        await expect(fetchCatalogueEntries('ngc')).rejects.toThrow('TAP 502');
    });

    it('tolère une réponse TAP sans métadonnées ni données', async () => {
        fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
        const { fetchCatalogueEntries } = await load();
        expect((await fetchCatalogueEntries('sharpless'))?.entries).toEqual([]);
    });

    it('Messier : interroge SIMBAD avec les variantes paddées et conserve l’ordre du catalogue', async () => {
        const entries = await entriesOf('messier', [
            {
                query_id: 'M   2',
                main_id: 'M   2 ',
                ra: 323.36,
                dec: -0.82,
                otype_txt: 'GlC',
                galdim_majaxis: 16,
                V: null,
                B: 6.5,
            },
            { query_id: 'M 1', main_id: 'M   1', ra: 83.63, dec: 22.01, otype_txt: null, galdim_majaxis: 0, V: 8.4 },
            { query_id: 'M  1', main_id: 'doublon ignoré', ra: 0, dec: 0 },
            { query_id: 'M 3', main_id: 'M 3', ra: null, dec: 28.4 },
        ]);
        const query = queryOf(fetchMock.mock.calls[0][0] as string);
        expect(query).toContain("'M   1'");
        expect(query).toContain("'M    1'");
        expect(entries.map((e) => e.id)).toEqual(['M 1', 'M 2']);
        expect(entries[0]).toMatchObject({
            commonName: 'M   1',
            ra: 83.63,
            dec: 22.01,
            type: undefined,
            mag: 8.4,
            sizeArcmin: undefined,
            constellation: 'Tau',
        });
        expect(entries[1]).toMatchObject({ commonName: 'M   2', type: 'GlC', mag: 6.5, sizeArcmin: 16 });
    });

    it('Caldwell : ajoute la variante SIMBAD « SH  2-N » et laisse la magnitude vide sans flux', async () => {
        const entries = await entriesOf('caldwell', [
            { query_id: 'SH  2-155', main_id: null, ra: 344.2, dec: 62.6, V: null, B: null },
        ]);
        expect(queryOf(fetchMock.mock.calls[0][0] as string)).toContain("'SH  2-155'");
        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({ id: 'Sh2-155', commonName: undefined, mag: undefined });
    });

    it('NGC : normalise les lignes NGC 2000.0, écarte les invalides et trie par numéro', async () => {
        const entries = await entriesOf('ngc', [
            {
                Name: ' 7000',
                Type: 'C+N ',
                RAB2000: 314.7,
                DEB2000: 44.3,
                mag: 4,
                size: 120,
                Const: 'Cyg ',
                Desc: ' eL ',
            },
            { Name: '   40', Type: '', RAB2000: 3.25, DEB2000: 72.5, mag: null, size: null, Const: '', Desc: '' },
            { Name: '', RAB2000: 1, DEB2000: 1 },
            { Name: 'abc', RAB2000: 1, DEB2000: 1 },
            { Name: '  100', RAB2000: 'x', DEB2000: 1 },
        ]);
        expect(queryOf(fetchMock.mock.calls[0][0] as string)).toContain(`"Name" NOT LIKE 'I%'`);
        expect(entries.map((e) => e.id)).toEqual(['NGC 40', 'NGC 7000']);
        expect(byId(entries, 'NGC 7000')).toEqual({
            id: 'NGC 7000',
            label: 'NGC 7000',
            ra: 314.7,
            dec: 44.3,
            type: 'C+N',
            constellation: 'Cyg',
            mag: 4,
            sizeArcmin: 120,
            description: 'eL',
        });
        expect(byId(entries, 'NGC 40')).toMatchObject({ type: undefined, mag: undefined, constellation: 'Cep' });
    });

    it('IC : filtre les noms commençant par I', async () => {
        const entries = await entriesOf('ic', [{ Name: 'I 434', Type: 'DN', RAB2000: 85.2, DEB2000: -2.45 }]);
        expect(queryOf(fetchMock.mock.calls[0][0] as string)).toContain(`"Name" LIKE 'I%'`);
        expect(entries[0].id).toBe('IC 434');
    });

    it('Sharpless : décrit la forme, la taille, les étoiles et précesse depuis B1900', async () => {
        const entries = await entriesOf('sharpless', [
            { Sh2: 155, RA1900: 343.5, DE1900: 62.1, Diam: 50, Form: 2, Stars: 1 },
            { Sh2: 1, RA1900: 240, DE1900: -22, Diam: null, Form: 7, Stars: 0 },
            { Sh2: 2, RA1900: 241, DE1900: -23, Form: null },
            { Sh2: 'x', RA1900: 1, DE1900: 1 },
            { Sh2: 3, RA1900: null, DE1900: 'y' },
        ]);
        // Tri sur le dernier nombre de l'identifiant (et non sur le « 2 » de « Sh2 »).
        expect(entries.map((e) => e.id)).toEqual(['Sh2-1', 'Sh2-2', 'Sh2-155']);
        const sh155 = byId(entries, 'Sh2-155');
        expect(sh155).toMatchObject({
            type: 'H II elliptique',
            sizeArcmin: 50,
            description: '1 étoile(s) excitatrice(s) associée(s)',
        });
        expect(sh155?.ra).not.toBe(343.5);
        expect(Math.abs((sh155?.dec ?? 0) - 62.1)).toBeLessThan(2);
        expect(byId(entries, 'Sh2-1')).toMatchObject({ type: 'H II', description: undefined });
        expect(byId(entries, 'Sh2-2')?.type).toBe('H II');
    });

    it('LBN : garde le nom commun non vide et la taille', async () => {
        const entries = await entriesOf('lbn', [
            { Seq: 331, RA1950: 314, DE1950: 44, Diam1: 60, Name: ' NGC 7000 ' },
            { Seq: 12, RA1950: 10, DE1950: 10, Diam1: null, Name: '  ' },
            { Seq: 'x', RA1950: 1, DE1950: 1 },
            { Seq: 13, RA1950: 'a', DE1950: 1 },
        ]);
        expect(entries.map((e) => e.id)).toEqual(['LBN 12', 'LBN 331']);
        expect(byId(entries, 'LBN 331')).toMatchObject({
            type: 'Nébuleuse brillante',
            sizeArcmin: 60,
            commonName: 'NGC 7000',
        });
        expect(byId(entries, 'LBN 12')?.commonName).toBeUndefined();
    });

    it('Barnard : normalise les nébuleuses obscures', async () => {
        const entries = await entriesOf('barnard', [
            { Barn: ' 33 ', RA1875: 84, DE1875: -2.5, Diam: 6 },
            { Barn: '', RA1875: 1, DE1875: 1 },
            { Barn: '34', RA1875: null, DE1875: 'z' },
            { Barn: null, RA1875: 1, DE1875: 1, Diam: 'x' },
        ]);
        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({ id: 'Barnard 33', type: 'Nébuleuse obscure', sizeArcmin: 6 });
    });

    it('Arp : regroupe les membres et garde le plus brillant', async () => {
        const entries = await entriesOf('arp', [
            { Arp: 85, Name: 'NGC 5194', VT: 8.4, dim1: 11, dim2: 7, MType: 'Sc', RAJ2000: 202.47, DEJ2000: 47.2 },
            { Arp: 85, Name: 'NGC 5195', VT: 9.6, dim1: 6, MType: 'I0', RAJ2000: 202.5, DEJ2000: 47.27 },
            { Arp: 85, Name: 'NGC 5194', VT: 7.9, dim1: 12, MType: 'Sc ', RAJ2000: 202.48, DEJ2000: 47.19 },
            { Arp: 1, Name: '', VT: null, dim1: null, MType: '', RAJ2000: 1, DEJ2000: 1 },
            { Arp: 1, Name: 'NGC 2857', VT: 12, RAJ2000: 2, DEJ2000: 2 },
            { Arp: 2, Name: 'Solo', VT: null, RAJ2000: 3, DEJ2000: 3 },
            { Arp: 2, Name: 'Solo', VT: null, RAJ2000: 4, DEJ2000: 4 },
            { Arp: 'x', RAJ2000: 1, DEJ2000: 1 },
        ]);
        expect(entries.map((e) => e.id)).toEqual(['Arp 1', 'Arp 2', 'Arp 85']);
        expect(byId(entries, 'Arp 85')).toMatchObject({
            ra: 202.48,
            dec: 47.19,
            type: 'Galaxie Sc',
            mag: 7.9,
            sizeArcmin: 12,
            commonName: 'NGC 5194',
            description: '2 galaxies : NGC 5194, NGC 5195',
        });
        expect(byId(entries, 'Arp 1')).toMatchObject({
            ra: 2,
            mag: 12,
            commonName: 'NGC 2857',
            description: undefined,
        });
        expect(byId(entries, 'Arp 2')).toMatchObject({ ra: 3, type: 'Galaxie particulière', mag: undefined });
    });

    it('UGC : construit le type de Hubble et écarte les lignes invalides', async () => {
        const entries = await entriesOf('ugc', [
            { UGC: 454, RA1950: 10, DE1950: 41, MajAxis: 190, Pmag: 4.4, Hubble: ' Sb ' },
            { UGC: 1, RA1950: 0.5, DE1950: 5, MajAxis: null, Pmag: null, Hubble: '' },
            { UGC: 'x', RA1950: 1, DE1950: 1 },
            { UGC: 2, RA1950: 'a', DE1950: 1 },
        ]);
        expect(entries.map((e) => e.id)).toEqual(['UGC 1', 'UGC 454']);
        expect(byId(entries, 'UGC 454')).toMatchObject({ type: 'Galaxie Sb', mag: 4.4, sizeArcmin: 190 });
        expect(byId(entries, 'UGC 1')).toMatchObject({ type: 'Galaxie', mag: undefined, sizeArcmin: undefined });
    });

    it('vdB : traduit le type, double le rayon et décrit l’étoile illuminatrice', async () => {
        const entries = await entriesOf('vdb', [
            { VdB: 152, _RA: 337.6, _DE: 70.3, Vmag: 9.3, Type: 'R', BRadMax: 4, SpType: ' B3 ' },
            { VdB: 3, _RA: 10, _DE: 60, Vmag: null, Type: 'X', BRadMax: 0, SpType: null },
            { VdB: 4, _RA: 11, _DE: 61, Type: null },
            { VdB: 'x', _RA: 1, _DE: 1 },
            { VdB: 5, _RA: 'a', _DE: 1 },
        ]);
        expect(entries.map((e) => e.id)).toEqual(['vdB 3', 'vdB 4', 'vdB 152']);
        expect(byId(entries, 'vdB 152')).toMatchObject({
            type: 'Nébuleuse à réflexion',
            mag: 9.3,
            sizeArcmin: 8,
            description: 'étoile illuminatrice : B3',
        });
        expect(byId(entries, 'vdB 3')).toMatchObject({
            type: 'Nébuleuse X',
            sizeArcmin: undefined,
            description: undefined,
        });
        expect(byId(entries, 'vdB 4')?.type).toBe('Nébuleuse');
    });

    it('RCW : traduit la brillance et garde les identifiants croisés', async () => {
        const entries = await entriesOf('rcw', [
            { RCW: 49, RAB1950: 155.5, DEB1950: -57.5, MajAxis: 90, Br: 'B ', IDs: ' Gum 29 ' },
            { RCW: 2, RAB1950: 100, DEB1950: -20, MajAxis: null, Br: null, IDs: null },
            { RCW: 'x', RAB1950: 1, DEB1950: 1 },
            { RCW: 3, RAB1950: 'a', DEB1950: 1 },
        ]);
        expect(entries.map((e) => e.id)).toEqual(['RCW 2', 'RCW 49']);
        expect(byId(entries, 'RCW 49')).toMatchObject({
            type: 'H II brillante',
            sizeArcmin: 90,
            description: 'Gum 29',
        });
        expect(byId(entries, 'RCW 2')).toMatchObject({ type: 'H II', description: undefined });
    });

    it('HCG : indique le nombre de membres et le type', async () => {
        const entries = await entriesOf('hcg', [
            { HCG: 92, RA1950: 338.5, DE1950: 33.7, Type: ' A ', MCount: 4, AngSize: 3.2, Totmag: 13.1 },
            { HCG: 1, RA1950: 6.5, DE1950: 25.4, Type: null, MCount: null, AngSize: null, Totmag: null },
            { HCG: 'x', RA1950: 1, DE1950: 1 },
            { HCG: 2, RA1950: 'a', DE1950: 1 },
        ]);
        expect(entries.map((e) => e.id)).toEqual(['HCG 1', 'HCG 92']);
        expect(byId(entries, 'HCG 92')).toMatchObject({
            type: 'Groupe compact (4 galaxies)',
            mag: 13.1,
            sizeArcmin: 3.2,
            description: 'Type A',
        });
        expect(byId(entries, 'HCG 1')).toMatchObject({ type: 'Groupe compact de galaxies', description: undefined });
    });

    it('LDN : convertit la surface en diamètre et mentionne l’opacité et Barnard', async () => {
        const entries = await entriesOf('ldn', [
            { LDN: 1622, RA1950: 87.5, DE1950: 1.8, Area: Math.PI / 4, Opacity: 6, Barn: ' 33 ' },
            { LDN: 5, RA1950: 270, DE1950: -20, Area: 0, Opacity: null, Barn: '  ' },
            { LDN: 0, RA1950: 1, DE1950: 1 },
            { LDN: 'x', RA1950: 1, DE1950: 1 },
            { LDN: 6, RA1950: 'a', DE1950: 1 },
        ]);
        expect(entries.map((e) => e.id)).toEqual(['LDN 5', 'LDN 1622']);
        const ldn = byId(entries, 'LDN 1622');
        expect(ldn?.sizeArcmin).toBeCloseTo(60);
        expect(ldn).toMatchObject({ type: 'Nébuleuse obscure (opacité 6/6)', description: 'Barnard : 33' });
        expect(byId(entries, 'LDN 5')).toMatchObject({
            type: 'Nébuleuse obscure',
            sizeArcmin: undefined,
            description: undefined,
        });
    });

    it('Ced : distingue nom commun et désignation BD de l’étoile illuminatrice', async () => {
        const entries = await entriesOf('ced', [
            { Ced: 214, m_Ced: null, Name: 'NGC 7822', RA1900: 0, DE1900: 67, Star: 'HD 1', pmag: 8 },
            { Ced: 5, m_Ced: 'a', Name: '+64 13', RA1900: 10, DE1900: 64, Star: '?', pmag: null },
            { Ced: 6, m_Ced: '', Name: '', RA1900: 11, DE1900: 63, Star: '-12 1234' },
            { Ced: 7, Name: null, RA1900: 12, DE1900: 62, Star: null },
            { Ced: 'x', RA1900: 1, DE1900: 1 },
            { Ced: 8, RA1900: 'a', DE1900: 1 },
        ]);
        expect(entries.map((e) => e.id)).toEqual(['Ced 5a', 'Ced 6', 'Ced 7', 'Ced 214']);
        expect(byId(entries, 'Ced 214')).toMatchObject({
            type: 'Nébuleuse diffuse',
            mag: 8,
            commonName: 'NGC 7822',
            description: 'étoile illuminatrice : HD 1',
        });
        expect(byId(entries, 'Ced 5a')).toMatchObject({
            commonName: undefined,
            description: 'étoile illuminatrice : BD +64 13',
        });
        expect(byId(entries, 'Ced 6')?.description).toBe('étoile illuminatrice : BD -12 1234');
        expect(byId(entries, 'Ced 7')?.description).toBeUndefined();
    });

    it('OCL : normalise le nom de l’amas, la classe et l’âge', async () => {
        const entries = await entriesOf('ocl', [
            { Cluster: ' Collinder   285 ', RAJ2000: 180, DEJ2000: 56, Class: ' III2m ', Diam: 1400, Age: 8.3 },
            { Cluster: 'Berkeley 1', RAJ2000: 1, DEJ2000: 60, Class: '', Diam: null, Age: null },
            { Cluster: '', RAJ2000: 1, DEJ2000: 1 },
            { Cluster: 'King 1', RAJ2000: 'a', DEJ2000: 1 },
        ]);
        expect(entries.map((e) => e.id)).toEqual(['Berkeley 1', 'Collinder 285']);
        expect(byId(entries, 'Collinder 285')).toMatchObject({
            ra: 180,
            dec: 56,
            type: 'Amas ouvert (III2m)',
            sizeArcmin: 1400,
            description: 'log(âge) ≈ 8.30 ans',
        });
        expect(byId(entries, 'Berkeley 1')).toMatchObject({ type: 'Amas ouvert', description: undefined });
    });

    it('PN : construit la désignation PN G et garde nom et découvreur', async () => {
        const entries = await entriesOf('pn', [
            { PNG: ' 083.5+12.7 ', RAB1950: 299.5, DEB1950: 50.4, Name: ' NGC 6826 ', Disc: ' Herschel ' },
            { PNG: '001.0-01.0', RAB1950: 270, DEB1950: -28, Name: '', Disc: '' },
            { PNG: '', RAB1950: 1, DEB1950: 1 },
            { PNG: '002.0', RAB1950: 'a', DEB1950: 1 },
        ]);
        expect(entries.map((e) => e.id)).toEqual(['PN G001.0-01.0', 'PN G083.5+12.7']);
        expect(byId(entries, 'PN G083.5+12.7')).toMatchObject({
            type: 'Nébuleuse planétaire',
            commonName: 'NGC 6826',
            description: 'Herschel',
        });
        expect(byId(entries, 'PN G001.0-01.0')).toMatchObject({ commonName: undefined, description: undefined });
    });

    it('ACO : décrit le type Bautz-Morgan, le nombre de galaxies et le redshift', async () => {
        const entries = await entriesOf('aco', [
            { ACO: 1656, RAB1950: 194.4, DEB1950: 28.2, BMtype: ' II ', Count: 106, z: 0.0231 },
            { ACO: 426, RAB1950: 49.2, DEB1950: 41.3, BMtype: '', Count: null, z: null },
            { ACO: 'x', RAB1950: 1, DEB1950: 1 },
            { ACO: 2, RAB1950: 'a', DEB1950: 1 },
        ]);
        expect(entries.map((e) => e.id)).toEqual(['Abell 426', 'Abell 1656']);
        expect(byId(entries, 'Abell 1656')).toMatchObject({
            type: 'Amas de galaxies (II)',
            description: '106 galaxies · z = 0.023',
        });
        expect(byId(entries, 'Abell 426')).toMatchObject({ type: 'Amas de galaxies', description: undefined });
    });

    it('GC : utilise Name1, sinon IAU, et Name2 comme nom commun', async () => {
        const entries = await entriesOf('gc', [
            { IAU: '0021-723', Name1: 'NGC  104', Name2: '47  Tuc', RA1950: 5.4, DE1950: -72.4, Vt: 3.95 },
            { IAU: ' 1716-184 ', Name1: null, Name2: null, RA1950: 259.8, DE1950: -18.5, Vt: null },
            { IAU: null, Name1: '', RA1950: 1, DE1950: 1 },
            { IAU: 'x', Name1: 'Pal 1', RA1950: 'a', DE1950: 1 },
        ]);
        expect(entries.map((e) => e.id)).toEqual(['NGC 104', '1716-184']);
        expect(byId(entries, 'NGC 104')).toMatchObject({ type: 'Amas globulaire', mag: 3.95, commonName: '47 Tuc' });
        expect(byId(entries, '1716-184')).toMatchObject({ mag: undefined, commonName: undefined });
    });

    it('met en cache la liste 24 h puis la recharge', async () => {
        vi.useFakeTimers();
        respondWith([{ Name: ' 7000', RAB2000: 314.7, DEB2000: 44.3 }]);
        const { fetchCatalogueEntries } = await load();
        const first = await fetchCatalogueEntries('ngc');
        const second = await fetchCatalogueEntries('ngc');
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(second?.entries).toBe(first?.entries);

        vi.setSystemTime(Date.now() + 25 * 60 * 60 * 1000);
        await fetchCatalogueEntries('ngc');
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});
