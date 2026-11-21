/**
 * @file src/lib/objects/resolve.test.ts
 * @description Suite de tests pour le résolveur d'objets célestes.
 * Responsabilité : Assurer que les requêtes basées sur des noms usuels français
 * (ex: "galaxie d'andromède") sont correctement mappées vers leurs identifiants
 * de catalogue correspondants avant d'appeler le CDS Sesame.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveObject } from './resolve';
import { resolveWithSesame } from './sesame';
import { fetchSimbad } from './simbad';
import { fetchWikipedia } from './wikipedia';
import { fetchNed } from './ned';
import { fetchCatalogEntries } from './vizier';
import { buildSkyImages, pickFovDeg } from './hips2fits';
import { findOwnPhotos } from './own-photos';
import type { SimbadData } from './types';

// POURQUOI : On mocke toutes les dépendances d'API réseau pour tester uniquement
// la logique locale de résolution et de normalisation de chaîne de resolveObject.
vi.mock('./sesame', () => ({
    resolveWithSesame: vi.fn(),
}));

vi.mock('./simbad', () => ({
    fetchSimbad: vi.fn().mockResolvedValue(null),
}));

vi.mock('./wikipedia', () => ({
    fetchWikipedia: vi.fn().mockResolvedValue(null),
}));

vi.mock('./ned', () => ({
    fetchNed: vi.fn().mockResolvedValue(null),
}));

vi.mock('./vizier', () => ({
    fetchCatalogEntries: vi.fn().mockResolvedValue([]),
}));

vi.mock('./hips2fits', () => ({
    buildSkyImages: vi.fn().mockReturnValue([]),
    pickFovDeg: vi.fn().mockReturnValue(1),
}));

vi.mock('./own-photos', () => ({
    findOwnPhotos: vi.fn().mockReturnValue([]),
}));

describe("Résolveur d'objets avec noms usuels français", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    /**
     * @test Valide le bon mappage du nom usuel français vers la clé de catalogue de FRENCH_NAMES.
     */
    it("traduit les noms usuels français vers les clés de catalogue avant l'appel Sesame", async () => {
        vi.mocked(resolveWithSesame).mockResolvedValue({
            canonicalName: 'M 31',
            ra: 10.684,
            dec: 41.269,
            aliases: ['M 31', 'NGC 224'],
        });

        // Saisie utilisateur avec accentuation et casse mixte
        const result = await resolveObject("Galaxie d'Andromède");

        expect(resolveWithSesame).toHaveBeenCalledWith('M 31');
        expect(result).not.toBeNull();
        expect(result?.canonicalName).toBe('M 31');
        expect(result?.query).toBe("Galaxie d'Andromède");
    });

    /**
     * @test Valide la tolérance aux accents et à la casse lors de la saisie utilisateur.
     */
    it('supporte les requêtes sans accents et avec casse différente', async () => {
        vi.mocked(resolveWithSesame).mockResolvedValue({
            canonicalName: 'M 42',
            ra: 83.822,
            dec: -5.391,
            aliases: ['M 42', 'NGC 1976'],
        });

        // "nebuleuse d'orion" au lieu de "Nébuleuse d'Orion"
        await resolveObject("nebuleuse d'orion");

        expect(resolveWithSesame).toHaveBeenCalledWith('M 42');
    });

    /**
     * @test Assure que les codes de catalogue standards (ex: NGC 7000) passent à travers inchangés.
     */
    it('laisse passer les identifiants de catalogue standards directement', async () => {
        vi.mocked(resolveWithSesame).mockResolvedValue({
            canonicalName: 'NGC 7000',
            ra: 314.9,
            dec: 44.3,
            aliases: ['NGC 7000'],
        });

        await resolveObject('NGC 7000');

        expect(resolveWithSesame).toHaveBeenCalledWith('NGC 7000');
    });
});

describe('resolveObject — orchestration des sources', () => {
    const simbadM51: SimbadData = {
        mainId: 'M  51',
        coords: { ra: 202.47, dec: 47.19 },
        otype: 'Sy2',
        dimMajArcmin: 11,
        aliases: ['M  51', 'NGC  5194', 'IC 4278', 'SH  2-1', 'NAME Whirlpool Galaxy', '  '],
        fluxes: {},
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(fetchSimbad).mockResolvedValue(null);
        vi.mocked(fetchWikipedia).mockResolvedValue(null);
        vi.mocked(fetchNed).mockResolvedValue(null);
        vi.mocked(fetchCatalogEntries).mockResolvedValue([]);
        vi.mocked(findOwnPhotos).mockReturnValue([]);
    });

    it('renvoie null pour une requête vide sans appeler Sesame', async () => {
        expect(await resolveObject('   ')).toBeNull();
        expect(resolveWithSesame).not.toHaveBeenCalled();
    });

    it('renvoie null quand Sesame échoue ou ne trouve rien', async () => {
        vi.mocked(resolveWithSesame).mockRejectedValueOnce(new Error('CDS indisponible'));
        expect(await resolveObject('Cible introuvable A')).toBeNull();
        vi.mocked(resolveWithSesame).mockResolvedValueOnce(null);
        expect(await resolveObject('Cible introuvable B')).toBeNull();
        expect(fetchSimbad).not.toHaveBeenCalled();
    });

    it('agrège SIMBAD, NED, Wikipedia, VizieR et les photos pour un objet extragalactique', async () => {
        vi.mocked(resolveWithSesame).mockResolvedValue({
            canonicalName: 'M 51',
            ra: 202.4,
            dec: 47.1,
            aliases: ['NGC 5194', 'M 51'],
        });
        vi.mocked(fetchSimbad).mockResolvedValue(simbadM51);
        vi.mocked(fetchNed).mockResolvedValue({ preferredName: 'MESSIER 051a', redshift: 0.0015 });
        vi.mocked(fetchWikipedia).mockResolvedValue({ title: 'M51', lang: 'fr', extract: 'Galaxie', url: 'u' });
        vi.mocked(fetchCatalogEntries).mockResolvedValue([{ catalog: 'NGC', catalogId: 'NGC 5194', fields: [] }]);
        vi.mocked(findOwnPhotos).mockReturnValue([
            { slug: 'm51', title: 'M51', href: '/astrophotographies/m51', imagePath: 'm51.jpg', year: 2024 },
        ]);
        vi.mocked(pickFovDeg).mockReturnValue(0.55);

        const result = await resolveObject('  M51   tourbillon ');

        expect(fetchSimbad).toHaveBeenCalledWith('M 51');
        expect(fetchNed).toHaveBeenCalledWith('M 51');
        expect(pickFovDeg).toHaveBeenCalledWith(11);
        expect(buildSkyImages).toHaveBeenCalledWith(202.47, 47.19, 0.55);
        expect(result?.aliases).toEqual(['M 51', 'NGC 5194', 'IC 4278', 'SH 2-1', 'NAME Whirlpool Galaxy']);
        expect(vi.mocked(fetchWikipedia).mock.calls[0][0]).toEqual([
            'M 51',
            'Messier 51',
            'NGC 5194',
            'IC 4278',
            'SH 2-1',
            'Sh2-1',
            'NAME Whirlpool Galaxy',
            'Whirlpool Galaxy',
        ]);
        expect(result).toMatchObject({
            query: 'M51   tourbillon',
            canonicalName: 'M 51',
            coords: { ra: 202.47, dec: 47.19 },
            ned: { preferredName: 'MESSIER 051a' },
            wikipedia: { title: 'M51' },
            catalogEntries: [{ catalogId: 'NGC 5194' }],
            ownPhotos: [{ slug: 'm51' }],
            defaultFovDeg: 0.55,
            warnings: undefined,
        });
    });

    it('n’interroge pas NED pour un objet galactique et collecte les erreurs en avertissements', async () => {
        vi.mocked(resolveWithSesame).mockResolvedValue({ canonicalName: 'M 42', ra: 83.8, dec: -5.4, aliases: [] });
        vi.mocked(fetchSimbad).mockResolvedValue({
            ...simbadM51,
            mainId: '',
            coords: undefined,
            otype: 'HII',
            aliases: [],
        });
        vi.mocked(fetchWikipedia).mockRejectedValue(new Error('timeout'));
        vi.mocked(fetchCatalogEntries).mockRejectedValue(new Error('503'));

        const result = await resolveObject('Orion avertissements');

        expect(fetchNed).not.toHaveBeenCalled();
        expect(result).toMatchObject({
            canonicalName: 'M 42',
            coords: { ra: 83.8, dec: -5.4 },
            ned: undefined,
            catalogEntries: undefined,
            wikipedia: undefined,
            ownPhotos: undefined,
        });
        expect(result?.warnings).toEqual(['Wikipedia: timeout', 'VizieR: 503']);
    });

    it('signale les échecs de SIMBAD et de NED sans interrompre la résolution', async () => {
        vi.mocked(resolveWithSesame).mockResolvedValue({ canonicalName: 'Q', ra: 1, dec: 2, aliases: ['Q'] });
        vi.mocked(fetchSimbad).mockRejectedValueOnce(new Error('SIMBAD 500'));
        const first = await resolveObject('Quasar sans simbad');
        expect(first?.warnings).toEqual(['SIMBAD: SIMBAD 500']);
        expect(first?.simbad).toBeUndefined();

        vi.mocked(fetchSimbad).mockResolvedValue({ ...simbadM51, otype: 'QSO', aliases: [] });
        vi.mocked(fetchNed).mockRejectedValue(new Error('NED 502'));
        const second = await resolveObject('Quasar sans ned');
        expect(second?.warnings).toEqual(['NED: NED 502']);
    });

    it('met en cache le résultat et mutualise les appels simultanés', async () => {
        vi.mocked(resolveWithSesame).mockResolvedValue({ canonicalName: 'NGC 891', ra: 35.6, dec: 42.3, aliases: [] });
        const [a, b] = await Promise.all([resolveObject('NGC 891 cache'), resolveObject('ngc   891 CACHE')]);
        expect(a).toBe(b);
        const c = await resolveObject('NGC 891 cache');
        expect(c).toBe(a);
        expect(resolveWithSesame).toHaveBeenCalledTimes(1);
    });

    it('propage une erreur inattendue et libère la requête en cours', async () => {
        vi.mocked(resolveWithSesame).mockResolvedValue({ canonicalName: 'X', ra: 0, dec: 0, aliases: [] });
        vi.mocked(findOwnPhotos).mockImplementationOnce(() => {
            throw new Error('CSV illisible');
        });
        await expect(resolveObject('Erreur interne')).rejects.toThrow('CSV illisible');
        const retry = await resolveObject('Erreur interne');
        expect(retry?.canonicalName).toBe('X');
    });

    it('expire les entrées de cache après 24 h et évince la plus ancienne au-delà de 200', async () => {
        vi.useFakeTimers();
        try {
            vi.mocked(resolveWithSesame).mockResolvedValue({ canonicalName: 'T', ra: 0, dec: 0, aliases: [] });
            await resolveObject('expiration ttl');
            vi.setSystemTime(Date.now() + 25 * 60 * 60 * 1000);
            await resolveObject('expiration ttl');
            expect(resolveWithSesame).toHaveBeenCalledTimes(2);

            for (let i = 0; i < 205; i++) await resolveObject(`remplissage ${i}`);
            vi.mocked(resolveWithSesame).mockClear();
            await resolveObject('remplissage 0');
            expect(resolveWithSesame).toHaveBeenCalledTimes(1);
        } finally {
            vi.useRealTimers();
        }
    });
});
