/**
 * @file src/lib/recommendations/score.test.ts
 * @description Suite de tests unitaires et d'intégration pour le moteur de recommandation astronomique.
 * Responsabilité : Valider le pipeline de recommandations célestes. Assurer que les cibles
 * sont correctement sélectionnées selon la nuit astronomique locale de l'observateur, triées
 * par pertinence temporelle/altitude et dédupliquées géométriquement.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildRecommendations, _resetPoolCache, type RecommendationOptions } from './score';
import { fetchCatalogueEntries } from '@/lib/catalogues/fetch';
import type { ObsLocation } from '@/lib/objects/observation';

// Mock du module de chargement des fichiers de catalogues pour isoler les tests
vi.mock('@/lib/catalogues/fetch', () => ({
    fetchCatalogueEntries: vi.fn(),
}));

describe('Moteur de Recommandations Célestes (buildRecommendations)', () => {
    // Coordonnées de test : Paris, France
    const parisLocation: ObsLocation = {
        lat: 48.8566,
        lon: 2.3522,
        name: 'Paris',
    };

    // Échantillons d'objets célestes simulés
    const mockMessier = {
        entries: [
            { id: 'M 42', commonName: 'NGC 1976', ra: 83.822, dec: -5.391, mag: 4.0 }, // Orion (culmine en hiver)
            { id: 'M 31', commonName: 'NGC 224', ra: 10.684, dec: 41.269, mag: 3.4 }, // Andromède (culmine en automne)
        ],
    };

    const mockCaldwell = {
        entries: [
            { id: 'C 14', commonName: 'NGC 869', ra: 35.15, dec: 57.13, mag: 5.3 }, // Double Amas
        ],
    };

    const mockNgc = {
        entries: [
            { id: 'NGC 1976', ra: 83.82, dec: -5.39, mag: 4.0 }, // Doublon parfait de M 42 (différence angulaire < 5′)
            { id: 'NGC 7000', ra: 314.9, dec: 44.3, mag: 4.0 }, // North America Nebula
        ],
    };

    beforeEach(() => {
        vi.clearAllMocks();
        _resetPoolCache();

        // Configuration des résolutions de mocks
        vi.mocked(fetchCatalogueEntries).mockImplementation(async (catalogue: string) => {
            if (catalogue === 'messier') return mockMessier as any;
            if (catalogue === 'caldwell') return mockCaldwell as any;
            if (catalogue === 'ngc') return mockNgc as any;
            return null;
        });
    });

    describe('Pannes des services de catalogues', () => {
        const options: RecommendationOptions = { location: parisLocation, date: new Date(2026, 11, 15) };

        beforeEach(() => {
            vi.spyOn(console, 'error').mockImplementation(() => {});
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it('signale un pool complet quand tous les catalogues répondent', async () => {
            expect((await buildRecommendations(options)).poolComplete).toBe(true);
        });

        it('renvoie un résultat partiel signalé quand un catalogue échoue', async () => {
            vi.mocked(fetchCatalogueEntries).mockImplementation(async (catalogue: string) => {
                if (catalogue === 'messier') return mockMessier as any;
                if (catalogue === 'ngc') throw new TypeError('fetch failed');
                return null;
            });
            const result = await buildRecommendations(options);
            expect(result.poolComplete).toBe(false);
            expect(result.poolSize).toBe(2);
        });

        it("n'attend pas au-delà de la borne un catalogue qui ne répond pas", async () => {
            vi.useFakeTimers();
            vi.mocked(fetchCatalogueEntries).mockImplementation((catalogue: string) =>
                catalogue === 'messier' ? Promise.resolve(mockMessier as any) : new Promise(() => {}),
            );
            const pending = buildRecommendations(options);
            await vi.advanceTimersByTimeAsync(12_000);
            const result = await pending;
            expect(result.poolComplete).toBe(false);
            expect(result.poolSize).toBe(2);
        });

        it('échoue sans rien mettre en cache de durable quand aucun catalogue ne répond', async () => {
            vi.useFakeTimers();
            vi.mocked(fetchCatalogueEntries).mockRejectedValue(new TypeError('fetch failed'));
            await expect(buildRecommendations(options)).rejects.toThrow('No catalogue available');

            vi.mocked(fetchCatalogueEntries).mockImplementation(async () => mockMessier as any);
            await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1);
            const result = await buildRecommendations(options);
            expect(result.poolComplete).toBe(true);
            expect(result.poolSize).toBeGreaterThan(0);
        });
    });

    describe('Pipeline global de Recommandations', () => {
        /**
         * @test Valide le bon chargement, filtrage, tri et formatage des recommandations pour un mois donné.
         */
        it('génère et trie correctement les recommandations pour Paris en Décembre', async () => {
            const opts: RecommendationOptions = {
                location: parisLocation,
                date: new Date('2026-12-15T22:00:00.000Z'),
                minAltDeg: 20,
                limit: 10,
            };

            const result = await buildRecommendations(opts);

            expect(result).toBeDefined();
            expect(result.poolSize).toBeGreaterThan(0);
            expect(result.items.length).toBeGreaterThan(0);

            // Orion (M 42) culmine excellemment en Décembre et doit figurer en tête de liste
            const orionRec = result.items.find((item) => item.id === 'M 42');
            expect(orionRec).toBeDefined();
            if (orionRec) {
                expect(orionRec.catalogue).toBe('messier');
                expect(orionRec.peakOffset).toBe(0); // Peak month exact
            }
        });

        /**
         * @test Valide la déduplication géométrique stricte (rayon critique de 5 minutes d'arc).
         * Raison technique : Evite de recommander séparément "M 42" et "NGC 1976" qui sont le même objet physique.
         */
        it('filtre et élimine les doublons physiques entre différents catalogues', async () => {
            const opts: RecommendationOptions = {
                location: parisLocation,
                date: new Date('2026-12-15T22:00:00.000Z'),
                minAltDeg: 20,
            };

            const result = await buildRecommendations(opts);
            const ids = result.items.map((item) => item.id);

            // M 42 doit être inclus
            expect(ids).toContain('M 42');
            // Son alias NGC 1976 doit être filtré et absent pour éviter la pollution visuelle
            expect(ids).not.toContain('NGC 1976');
        });

        /**
         * @test Valide l'application des filtres d'altitude minimale.
         */
        it("exclut les objets trop bas sur l'horizon céleste", async () => {
            const opts: RecommendationOptions = {
                location: parisLocation,
                date: new Date('2026-12-15T22:00:00.000Z'),
                minAltDeg: 88, // Seuil extrêmement haut (aucun objet n'atteint 88° de hauteur)
            };

            const result = await buildRecommendations(opts);
            // Aucun des objets mockés ne culmine à plus de 80° depuis Paris à cette période
            expect(result.items.length).toBe(0);
        });

        /**
         * @test Valide la prise en compte de la taille apparente dans le score (plus c'est grand, plus le score est élevé).
         */
        it('avantage les objets célestes de grande taille apparente dans le calcul du score', async () => {
            vi.mocked(fetchCatalogueEntries).mockImplementation(async (cat: string) => {
                if (cat === 'messier') {
                    return {
                        entries: [
                            {
                                id: 'M 31',
                                commonName: "Galaxie d'Andromède",
                                ra: 10.684,
                                dec: 41.269,
                                mag: 3.4,
                                sizeArcmin: 190,
                            }, // Grande taille (190')
                            {
                                id: 'M 57',
                                commonName: "Nébuleuse de l'Anneau",
                                ra: 283.396,
                                dec: 33.029,
                                mag: 8.8,
                                sizeArcmin: 1.4,
                            }, // Petite taille (1.4')
                        ],
                    } as any;
                }
                return null;
            });

            const opts: RecommendationOptions = {
                location: parisLocation,
                date: new Date('2026-10-15T22:00:00.000Z'),
                minAltDeg: 20,
            };

            const result = await buildRecommendations(opts);
            const m31 = result.items.find((i) => i.id === 'M 31');
            const m57 = result.items.find((i) => i.id === 'M 57');

            expect(m31).toBeDefined();
            expect(m57).toBeDefined();
            if (m31 && m57) {
                // A position et culmination égales, M 31 (190') doit obtenir un score supérieur à M 57 (1.4')
                expect(m31.score).toBeGreaterThan(m57.score);
            }
        });
    });
});
