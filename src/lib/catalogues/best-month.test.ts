/**
 * @file src/lib/catalogues/best-month.test.ts
 * @description Suite de tests unitaires pour le calcul du meilleur mois d'observation.
 * Responsabilité : Valider que le moteur d'opposition céleste détermine correctement le mois où un objet
 * culmine au méridien à minuit (permettant la plus longue exposition nocturne), tout en filtrant les
 * objets situés sous l'horizon d'observation utile (< 20° de hauteur).
 */

import { describe, it, expect } from 'vitest';
import { bestObservationMonth } from './best-month';

describe('Planificateur de Visibilité Céleste (bestObservationMonth)', () => {
    describe("bestObservationMonth - Calcul d'Opposition et Limites Célestes", () => {
        /**
         * @test Valide le calcul pour un objet culminant haut dans le ciel nocturne.
         * Exemple : Nébuleuse d'Orion (M42) observée depuis l'Europe (Latitude +48°).
         */
        it("détermine le mois idéal d'observation en opposition pour Orion depuis Paris", () => {
            const orionRa = 83.822; // 05h 35m
            const orionDec = -5.391; // Équateur céleste proche
            const result = bestObservationMonth(orionRa, orionDec, 48.8566);

            // Orion est visible en hiver, culminant principalement autour de Décembre
            expect(result.monthIndex).toBe(12);
            expect(result.label).toBe('Déc');
            expect(result.maxAltitudeDeg).toBeCloseTo(35.752, 1);
        });

        /**
         * @test Valide le comportement lorsqu'un objet ne s'élève jamais au-dessus du seuil de 20° d'altitude.
         * Exemple : Nuages de Magellan (Dec ≈ -70°) observés depuis l'Europe (+48°).
         */
        it("renvoie un indicateur vide si la cible ne culmine jamais au-dessus du seuil critique de 20° d'altitude", () => {
            const southernTargetRa = 10.0;
            const southernTargetDec = -70.0;
            const result = bestObservationMonth(southernTargetRa, southernTargetDec, 48.8566);

            // L'objet culmine sous l'horizon ou trop bas (maxAlt < 20°), pas de mois valide
            expect(result.monthIndex).toBeUndefined();
            expect(result.label).toBe('—');
            expect(result.maxAltitudeDeg).toBeLessThan(20);
        });

        /**
         * @test Valide la symétrie pour un observateur dans l'Hémisphère Sud.
         * Exemple : La constellation du Scorpion (Dec ≈ -26°) observée depuis le Chili (Latitude -30.5°).
         */
        it("calcule correctement l'opposition pour un observateur chilien de l'Hémisphère Sud", () => {
            const scorpionRa = 250.0; // 16h 40m
            const scorpionDec = -26.0;
            const result = bestObservationMonth(scorpionRa, scorpionDec, -30.526);

            // Le Scorpion culmine en été austral (autour de Juin / Juillet)
            expect(result.monthIndex).toBe(6);
            expect(result.label).toBe('Jun');
            expect(result.maxAltitudeDeg).toBeCloseTo(85.474, 1);
        });
    });
});
