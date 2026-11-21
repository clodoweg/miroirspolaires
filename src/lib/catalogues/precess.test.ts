/**
 * @file src/lib/catalogues/precess.test.ts
 * @description Suite de tests unitaires pour l'algorithme de précession des coordonnées équatoriales.
 * Responsabilité : Valider que les décalages de l'axe de rotation terrestre (Lieske 1976) sont appliqués
 * précisément de façon à ramener les objets de catalogues historiques (B1875, B1900, B1950) sur la grille J2000 de Stellarium.
 */

import { describe, it, expect } from 'vitest';
import { precessToJ2000, CATALOGUE_EPOCH } from './precess';

describe('Algorithme de Précession Céleste (IAU 1976 Lieske)', () => {
    describe('precessToJ2000 - Identité et Dérive Temporelle', () => {
        /**
         * @test Valide que les objets déjà enregistrés en J2000 ne subissent aucune déviation géométrique.
         * Raison technique : La précession vers le même repère temporel doit retourner la coordonnée initiale exacte.
         */
        it("retourne les mêmes coordonnées si l'époque source est déjà J2000", () => {
            const raInput = 83.822; // Orion
            const decInput = -5.391;
            const result = precessToJ2000(raInput, decInput, 2000);

            expect(result.ra).toBeCloseTo(raInput, 6);
            expect(result.dec).toBeCloseTo(decInput, 6);
        });

        /**
         * @test Valide le calcul d'une précession pour une époque ancienne (B1875 - Barnard).
         * Raison technique : L'effet cumulé sur plus d'un siècle représente un décalage d'environ 1.6° sur le ciel.
         */
        it('applique un décalage mesurable sur des coordonnées de Barnard 1875', () => {
            const raInput = 100.0;
            const decInput = 20.0;
            const result = precessToJ2000(raInput, decInput, 1875);

            // Vérification physique : La dérive de précession cumulative sur 125 ans doit être consistante
            expect(result.ra).not.toBe(raInput);
            expect(result.dec).not.toBe(decInput);

            // La dérive angulaire reste contenue dans des limites physiques réalistes (< 3.0 degrés)
            const deltaRa = Math.abs(result.ra - raInput);
            const deltaDec = Math.abs(result.dec - decInput);
            expect(deltaRa).toBeLessThan(3.0);
            expect(deltaDec).toBeLessThan(1.0);
        });

        /**
         * @test Valide que de petits écarts de temps (< 1/1000 de siècle) sont traités par un court-circuit
         * pour optimiser le temps de calcul CPU.
         */
        it('utilise un court-circuit interne pour des écarts temporels microscopiques', () => {
            const raInput = 45.0;
            const decInput = 45.0;
            // Une différence de 0.00001 an est ignorée
            const result = precessToJ2000(raInput, decInput, 2000.00001);

            expect(result.ra).toBe(raInput);
            expect(result.dec).toBe(decInput);
        });
    });

    describe('Registre CATALOGUE_EPOCH - Association des époques de catalogues', () => {
        /**
         * @test Valide que les catalogues critiques disposent de leur année de référence.
         */
        it('comporte les époques historiques correctes pour les principaux catalogues', () => {
            expect(CATALOGUE_EPOCH.messier).toBe(2000);
            expect(CATALOGUE_EPOCH.caldwell).toBe(2000);
            expect(CATALOGUE_EPOCH.sharpless).toBe(1900);
            expect(CATALOGUE_EPOCH.barnard).toBe(1875);
            expect(CATALOGUE_EPOCH.lbn).toBe(1950);
            expect(CATALOGUE_EPOCH.ugc).toBe(1950);
        });
    });
});
