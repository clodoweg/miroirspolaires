/**
 * Tests de parité entre transports : à données égales, TAP et ASU doivent produire les mêmes entrées.
 *
 * Les réponses ASU sont réelles (`src/test/fixtures/vizier-asu/`). Le TAP étant injoignable pendant la panne
 * du CDS, sa réponse est reconstruite depuis ces mêmes lignes : le test prouve l'égalité de la normalisation,
 * pas celle des données servies par les deux services.
 */

import { readFileSync } from 'node:fs';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseAsuTsv } from '@/lib/upstream/asu';
import { CATALOGUES } from './registry';

const { loadCatalogueSnapshot, activeRoutes } = vi.hoisted(() => ({
    loadCatalogueSnapshot: vi.fn(),
    activeRoutes: { current: [] as unknown[] },
}));
vi.mock('./snapshot', () => ({ loadCatalogueSnapshot }));
vi.mock('@/config/upstream-routes', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/config/upstream-routes')>()),
    getActiveRoutes: (serviceId: string) => (serviceId === 'vizier' ? activeRoutes.current : []),
}));

const ASU_ROUTE = { id: 'asu', label: 'ASU', baseUrl: 'https://miroir/asu-tsv', protocol: 'asu-tsv' };
const TAP_ROUTE = { id: 'tap', label: 'TAP', baseUrl: 'https://cds/tap', protocol: 'tap-adql' };

const FIXTURE_BY_TABLE: Record<string, string> = {
    'VII/118/ngc2000': 'ngc',
    'VII/20/catalog': 'sharpless',
    'VII/9/catalog': 'lbn',
    'VII/220A/barnard': 'barnard',
    'VII/192/arplist': 'arp',
    'VII/26D/catalog': 'ugc',
    'VII/21/catalog': 'vdb',
    'VII/216/rcw': 'rcw',
    'VII/213/groups': 'hcg',
    'VII/7A/ldn': 'ldn',
    'VII/231/catalog': 'ced',
    'B/ocl/clusters': 'ocl',
    'V/84/main': 'pn',
    'VII/110A/table3': 'aco',
    'VII/151/table1a': 'gc',
};

const fixtureOf = (table: string) =>
    readFileSync(`src/test/fixtures/vizier-asu/${FIXTURE_BY_TABLE[table]}.tsv`, 'utf-8');

function respondAsAsu(url: string) {
    const params = new URL(url).searchParams;
    return { ok: true, text: async () => fixtureOf(params.get('-source') ?? '') };
}

/** Reconstruit la réponse TAP depuis les lignes ASU : mêmes valeurs, en JSON typé comme le TAP. */
function respondAsTap(url: string) {
    const query = new URL(url).searchParams.get('query') ?? '';
    const table = query.match(/FROM "([^"]+)"/)?.[1] ?? '';
    const columns = [...(query.split(' FROM ')[0].matchAll(/"([^"]+)"/g) ?? [])].map((match) => match[1]);
    const { rows } = parseAsuTsv(fixtureOf(table), columns);
    const nameIndex = columns.indexOf('Name');
    const keptRows = query.includes(`"Name" LIKE 'I%'`)
        ? rows.filter((row) => String(row[nameIndex]).startsWith('I'))
        : query.includes(`"Name" NOT LIKE 'I%'`)
          ? rows.filter((row) => !String(row[nameIndex]).startsWith('I'))
          : rows;
    return { ok: true, json: async () => ({ metadata: columns.map((name) => ({ name })), data: keptRows }) };
}

async function entriesThrough(route: unknown, slug: string) {
    activeRoutes.current = [route];
    vi.resetModules();
    const { fetchCatalogueEntriesLive } = await import('./fetch');
    return (await fetchCatalogueEntriesLive(slug))?.entries;
}

const VIZIER_SLUGS = CATALOGUES.filter((catalogue) => catalogue.source !== 'simbad-list').map((c) => c.slug);

describe('fetchCatalogueEntriesLive selon le transport', () => {
    beforeEach(() => {
        loadCatalogueSnapshot.mockReset();
        vi.stubGlobal(
            'fetch',
            vi.fn(async (url: string) => (url.includes('asu-tsv') ? respondAsAsu(url) : respondAsTap(url))),
        );
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('couvre les 16 catalogues VizieR', () => {
        expect(VIZIER_SLUGS).toHaveLength(16);
    });

    it.each(VIZIER_SLUGS)('%s : mêmes entrées en TAP et en ASU', async (slug) => {
        const asuEntries = await entriesThrough(ASU_ROUTE, slug);
        expect(asuEntries?.length).toBeGreaterThan(0);
        expect(await entriesThrough(TAP_ROUTE, slug)).toEqual(asuEntries);
    });

    it.each(VIZIER_SLUGS)('%s : coordonnées en degrés dans les bornes', async (slug) => {
        for (const entry of (await entriesThrough(ASU_ROUTE, slug)) ?? []) {
            expect(entry.ra).toBeGreaterThanOrEqual(0);
            expect(entry.ra).toBeLessThan(360);
            expect(Math.abs(entry.dec)).toBeLessThanOrEqual(90);
        }
    });

    it('sépare NGC et IC après lecture, sans les confondre', async () => {
        const ngc = await entriesThrough(ASU_ROUTE, 'ngc');
        const ic = await entriesThrough(ASU_ROUTE, 'ic');
        expect(ngc?.map((entry) => entry.id)).toEqual(['NGC 7801', 'NGC 7802']);
        expect(ic?.map((entry) => entry.id)).toEqual(['IC 5370', 'IC 5371', 'IC 5372', 'IC 5373']);
    });

    it('NGC : entrée complète issue d’une réponse réelle', async () => {
        const [entry] = (await entriesThrough(ASU_ROUTE, 'ic')) ?? [];
        expect(entry).toMatchObject({
            id: 'IC 5370',
            ra: 0.025,
            dec: 32.75,
            type: 'Gx',
            constellation: 'And',
            mag: 15,
            sizeArcmin: 0.7,
            description: 'pB, S, R, stell N',
        });
    });

    it('bascule de TAP vers ASU quand le TAP ne répond pas', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async (url: string) => {
                if (!url.includes('asu-tsv')) throw new TypeError('fetch failed');
                return respondAsAsu(url);
            }),
        );
        activeRoutes.current = [TAP_ROUTE, ASU_ROUTE];
        vi.resetModules();
        const { fetchCatalogueEntriesLive } = await import('./fetch');
        const listing = await fetchCatalogueEntriesLive('sharpless');
        expect(listing?.entries[0].id).toBe('Sh2-1');
    });

    it('passe au miroir suivant quand une colonne manque', async () => {
        const fetchMock = vi.fn(async (url: string) => {
            if (url.startsWith('https://miroir/')) return { ok: true, text: async () => '#Table\tvide\n' };
            return respondAsAsu(url);
        });
        vi.stubGlobal('fetch', fetchMock);
        activeRoutes.current = [ASU_ROUTE, { ...ASU_ROUTE, id: 'asu-2', baseUrl: 'https://second/asu-tsv' }];
        vi.resetModules();
        const { fetchCatalogueEntriesLive } = await import('./fetch');
        expect((await fetchCatalogueEntriesLive('barnard'))?.entries).toHaveLength(6);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});
