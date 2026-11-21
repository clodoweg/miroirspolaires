/**
 * Tests des scores d'observabilité (exoplanètes, astéroïdes, comètes, étoiles
 * variables) et de la pondération par la faisabilité.
 */

import { describe, it, expect } from 'vitest';
import {
    calculateAsteroidScore,
    calculateCometScore,
    calculateExoplanetScore,
    calculateVariableStarScore,
} from './scoring';

describe('calculateExoplanetScore', () => {
    it('renvoie 0 sans transit observable ce soir', () => {
        expect(calculateExoplanetScore(20, 8, false, 'oui', 'gérable')).toBe(0);
        expect(calculateExoplanetScore(20, 8, true, 'non', 'gérable')).toBe(0);
        expect(calculateExoplanetScore(20, 8, true, 'horizon', 'gérable')).toBe(0);
        expect(calculateExoplanetScore(20, 8, true, 'jour', 'gérable')).toBe(0);
    });

    it('renvoie 0 quand la faisabilité est absente, inobservable ou hors de portée', () => {
        expect(calculateExoplanetScore(20, 8, true, 'oui')).toBe(0);
        expect(calculateExoplanetScore(20, 8, true, 'oui', 'Hors de portée')).toBe(0);
        expect(calculateExoplanetScore(20, 8, true, 'oui', 'Matériel insuffisant')).toBe(0);
        expect(calculateExoplanetScore(20, 8, true, 'oui', 'inconnu')).toBe(0);
    });

    it('cumule SNR, magnitude et fenêtre de transit, pondérés par la faisabilité', () => {
        expect(calculateExoplanetScore(12, 8, true, 'oui', 'Gérable')).toBe(100);
        expect(calculateExoplanetScore(6, 10, true, 'partiel', 'gerable')).toBe(65);
        expect(calculateExoplanetScore(4, 12, true, 'oui', 'gérable')).toBe(55);
        expect(calculateExoplanetScore(1, 15, true, 'oui', 'gérable')).toBe(40);
        expect(calculateExoplanetScore(12, 8, true, 'oui', 'Délicat')).toBe(50);
        expect(calculateExoplanetScore(6, 10, true, 'partiel', 'delicat')).toBe(33);
    });
});

describe('calculateAsteroidScore', () => {
    it('renvoie 0 quand la faisabilité est nulle', () => {
        expect(calculateAsteroidScore(6, 9, true, 'inobservable')).toBe(0);
    });

    it('applique les paliers de visibilité, de magnitude et de type', () => {
        expect(calculateAsteroidScore(6, 9, true, 'gérable')).toBe(100);
        expect(calculateAsteroidScore(3, 11, false, 'gérable')).toBe(65);
        expect(calculateAsteroidScore(1, 13, false, 'gérable')).toBe(40);
        expect(calculateAsteroidScore(0.5, 15, false, 'gérable')).toBe(20);
        expect(calculateAsteroidScore(0, 18, false, 'gérable')).toBe(10);
        expect(calculateAsteroidScore(6, 9, true, 'délicat')).toBe(50);
    });
});

describe('calculateCometScore', () => {
    it('renvoie 0 quand la faisabilité est nulle', () => {
        expect(calculateCometScore(6, 5, 1, 1)).toBe(0);
    });

    it('applique les paliers de visibilité, de magnitude et de distance', () => {
        expect(calculateCometScore(6, 7, 1, 1, 'gérable')).toBe(100);
        expect(calculateCometScore(3, 9, 2, 3, 'gérable')).toBe(70);
        expect(calculateCometScore(1, 11, 3, 3, 'gérable')).toBe(35);
        expect(calculateCometScore(0.5, 13, 3, 3, 'gérable')).toBe(15);
        expect(calculateCometScore(0, 16, 3, 3, 'gérable')).toBe(5);
        expect(calculateCometScore(6, 7, 1, 1, 'délicat')).toBe(50);
    });
});

describe('calculateVariableStarScore', () => {
    it('renvoie 0 quand la faisabilité est nulle', () => {
        expect(calculateVariableStarScore(5, 5, 9, 'hors portée')).toBe(0);
    });

    it("applique les paliers de visibilité, d'amplitude et de magnitude", () => {
        expect(calculateVariableStarScore(5, 5, 9, 'gérable')).toBe(100);
        expect(calculateVariableStarScore(3, 8, 6, 'gérable')).toBe(65);
        expect(calculateVariableStarScore(1, 11, 11.6, 'gérable')).toBe(30);
        expect(calculateVariableStarScore(0, 13, 13.1, 'gérable')).toBe(10);
        expect(calculateVariableStarScore(5, 5, 9, 'délicat')).toBe(50);
    });
});
