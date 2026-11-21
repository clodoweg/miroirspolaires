import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { fetchCatalogueEntries } = vi.hoisted(() => ({ fetchCatalogueEntries: vi.fn() }));
vi.mock('@/lib/catalogues/fetch', () => ({ fetchCatalogueEntries }));

import { GET } from './[slug]';
import { typeLabel } from '@/lib/catalogues/classify';

const ENTRIES = [
    { id: 'M 10', label: 'M 10', name: 'M 10', ra: 254.3, dec: -4.1, type: 'GlC', mag: 6.6, constellation: 'Oph' },
    { id: 'M 9', label: 'M 9', name: 'M 9', ra: 259.8, dec: -18.5, type: 'GlC', mag: 7.7, constellation: 'Oph' },
    { id: 'M 31', label: 'M 31', name: 'M 31', ra: 10.7, dec: 41.3, type: 'G', mag: 3.4, constellation: 'And' },
];

function callRoute(slug: string | undefined, query = '') {
    const url = new URL(`https://www.miroirspolaires.fr/api/catalogue/${slug ?? ''}${query}`);
    return GET({ params: { slug }, url, request: new Request(url) } as unknown as Parameters<typeof GET>[0]);
}

describe('GET /api/catalogue/[slug]', () => {
    beforeEach(() => {
        fetchCatalogueEntries.mockReset();
        fetchCatalogueEntries.mockResolvedValue({ catalogue: { slug: 'messier' }, entries: ENTRIES });
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('refuse un slug absent ou démesuré', async () => {
        expect((await callRoute(undefined)).status).toBe(400);
        expect((await callRoute('x'.repeat(41))).status).toBe(400);
        expect(fetchCatalogueEntries).not.toHaveBeenCalled();
    });

    it('renvoie 404 pour un catalogue inconnu', async () => {
        fetchCatalogueEntries.mockResolvedValue(null);
        expect((await callRoute('inconnu')).status).toBe(404);
    });

    it('garde l’ordre du registre par défaut et trie en ordre naturel sur demande', async () => {
        const ids = (body: { entries: { id: string }[] }) => body.entries.map((entry) => entry.id);
        expect(ids(await (await callRoute('messier')).json())).toEqual(['M 10', 'M 9', 'M 31']);
        const response = await callRoute('messier', '?limit=20&sort=id:desc');
        const body = await response.json();
        expect(response.status).toBe(200);
        expect(ids(body)).toEqual(['M 31', 'M 10', 'M 9']);
        expect(body).toMatchObject({ page: 1, limit: 20, total: 3 });
    });

    it('borne page, limit et ignore une latitude hors de la Terre', async () => {
        const response = await callRoute('messier', '?page=-5&limit=999999&lat=1000');
        const body = await response.json();
        expect(body.page).toBe(1);
        expect(body.limit).toBe(2000);
        expect(body.entries[0].bestMonthIndex).toBeUndefined();
    });

    it('calcule le meilleur mois pour une latitude valide', async () => {
        const body = await (await callRoute('messier', '?lat=45')).json();
        expect(typeof body.entries[0].bestMonthIndex).toBe('number');
    });

    it('filtre par texte sans tenir compte de la longueur au-delà de 80 caractères', async () => {
        const body = await (await callRoute('messier', `?q=M%2031${'z'.repeat(200)}`)).json();
        expect(body.total).toBe(0);
        const filtered = await (await callRoute('messier', '?q=M%2031')).json();
        expect(filtered.entries.map((entry: { id: string }) => entry.id)).toContain('M 31');
    });

    it('renvoie un 500 générique', async () => {
        fetchCatalogueEntries.mockRejectedValue(new Error('TAP https://internal.cds timeout'));
        const response = await callRoute('messier');
        expect(response.status).toBe(500);
        expect(JSON.stringify(await response.json())).not.toContain('internal.cds');
    });

    describe('tri, noms français et constellations', () => {
        const MIXED = [
            {
                id: 'M 10',
                label: 'M 10',
                ra: 254.3,
                dec: -4.1,
                type: 'GlC',
                mag: 6.6,
                sizeArcmin: 20,
                constellation: 'Oph',
            },
            { id: 'M 42', label: 'M 42', ra: 83.8, dec: -5.4, type: 'Neb', sizeArcmin: 85 },
            { id: 'M 31', label: 'M 31', ra: 10.7, dec: 41.3, type: 'G', mag: 3.4, constellation: 'And' },
        ];
        const ids = (body: { entries: { id: string }[] }) => body.entries.map((entry) => entry.id);

        beforeEach(() => {
            fetchCatalogueEntries.mockResolvedValue({ catalogue: { slug: 'messier' }, entries: MIXED });
        });

        afterEach(() => vi.unstubAllEnvs());

        it('ajoute le nom français et déduit la constellation manquante des coordonnées', async () => {
            const body = await (await callRoute('messier')).json();
            const m42 = body.entries.find((entry: { id: string }) => entry.id === 'M 42');
            expect(m42).toMatchObject({ commonName: "Nébuleuse d'Orion", constellation: 'Ori' });
            expect(body.entries.find((entry: { id: string }) => entry.id === 'M 10').commonName).toBeUndefined();
        });

        it.each([
            ['mag', ['M 31', 'M 10', 'M 42']],
            ['mag:desc', ['M 42', 'M 10', 'M 31']],
            ['size', ['M 31', 'M 10', 'M 42']],
            ['ra', ['M 31', 'M 42', 'M 10']],
            ['dec', ['M 42', 'M 10', 'M 31']],
            ['constellation', ['M 31', 'M 10', 'M 42']],
            ['commonName', ['M 31', 'M 42', 'M 10']],
            ['inconnu', ['M 10', 'M 42', 'M 31']],
        ])('trie selon %s', async (sort, expected) => {
            const body = await (await callRoute('messier', `?sort=${sort}`)).json();
            expect(ids(body)).toEqual(expected);
        });

        it('trie par libellé de type en français', async () => {
            const body = await (await callRoute('messier', '?sort=type')).json();
            const labels = body.entries.map((entry: { type: string }) => typeLabel(entry.type));
            expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b, 'fr')));
        });

        it('trie par catégorie de manière stable et cohérente en sens inverse', async () => {
            const ascending = ids(await (await callRoute('messier', '?sort=category')).json());
            const descending = ids(await (await callRoute('messier', '?sort=category:desc')).json());
            expect([...ascending].sort()).toEqual(['M 10', 'M 31', 'M 42']);
            expect(descending[0]).toBe(ascending[ascending.length - 1]);
        });

        it('trie par meilleur mois quand une latitude est fournie', async () => {
            const body = await (await callRoute('messier', '?lat=45&sort=bestMonth')).json();
            const months = body.entries.map((entry: { bestMonthIndex: number }) => entry.bestMonthIndex);
            expect(months).toEqual([...months].sort((a, b) => a - b));
        });

        it('place les objets sans nom courant après les autres en ordre croissant', async () => {
            fetchCatalogueEntries.mockResolvedValue({
                catalogue: { slug: 'messier' },
                entries: [MIXED[0], { ...MIXED[0], id: 'M 9', label: 'M 9' }, MIXED[2]],
            });
            const body = await (await callRoute('messier', '?sort=commonName')).json();
            expect(ids(body)).toEqual(['M 31', 'M 10', 'M 9']);
        });

        it('recherche sans accents dans le nom français et le nom de constellation', async () => {
            const byName = await (await callRoute('messier', '?q=nebuleuse')).json();
            expect(ids(byName)).toEqual(['M 42']);
            const byConstellation = await (await callRoute('messier', '?q=androm')).json();
            expect(ids(byConstellation)).toEqual(['M 31']);
        });

        it('pagine les résultats', async () => {
            const many = Array.from({ length: 25 }, (_, index) => ({
                ...MIXED[0],
                id: `X ${index}`,
                label: `X ${index}`,
            }));
            fetchCatalogueEntries.mockResolvedValue({ catalogue: { slug: 'x' }, entries: many });
            const body = await (await callRoute('x', '?limit=20&page=2')).json();
            expect(body).toMatchObject({ page: 2, limit: 20, total: 25 });
            expect(ids(body)).toEqual(['X 20', 'X 21', 'X 22', 'X 23', 'X 24']);
        });

        it('désactive le cache en développement et l’active en production', async () => {
            vi.stubEnv('DEV', true);
            expect((await callRoute('messier')).headers.get('Cache-Control')).toMatch(/no-store/);
            vi.stubEnv('DEV', false);
            expect((await callRoute('messier')).headers.get('Cache-Control')).toMatch(/s-maxage=86400/);
        });
    });
});
