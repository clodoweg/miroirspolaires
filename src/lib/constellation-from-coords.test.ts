/**
 * @file src/lib/constellation-from-coords.test.ts
 * @description Suite de tests unitaires pour la résolution des constellations de l'UAI.
 * Responsabilité : Valider la conversion des coordonnées équatoriales J2000 et le
 * repérage des constellations dans la table des limites astronomiques officielles.
 */

import { describe, it, expect } from 'vitest';
import { constellationFromCoords } from './constellation-from-coords';

describe('Résolution des Constellations célestes (Limites UAI)', () => {
    /**
     * @test Valide le repérage de coordonnées géographiques réelles d'objets célestes connus.
     * Les positions J2000 sont issues de bases de données physiques vérifiées (SIMBAD/NASA).
     */
    it('constellationFromCoords - résout avec succès des objets emblématiques connus', () => {
        // 1. La Nébuleuse d'Orion (M42) — Coordonnées dans Orion (Ori)
        const orionRa = 83.822; // 05h 35m 17s
        const orionDec = -5.391; // -05° 23' 28"
        expect(constellationFromCoords(orionRa, orionDec)).toBe('Ori');

        // 2. La Galaxie d'Andromède (M31) — Coordonnées dans Andromède (And)
        const andromedaRa = 10.684; // 00h 42m 44s
        const andromedaDec = 41.269; // +41° 16' 09"
        expect(constellationFromCoords(andromedaRa, andromedaDec)).toBe('And');

        // 3. Étoile Polaire (Polaris) — Coordonnées proches du pôle nord céleste dans la Petite Ourse (UMi)
        const polarisRa = 37.954; // 02h 31m 49s
        const polarisDec = 89.264; // +89° 15' 50"
        expect(constellationFromCoords(polarisRa, polarisDec)).toBe('UMi');

        // 4. Galaxie du Tourbillon (M51) — Coordonnées dans les Chiens de Chasse (CVn)
        const whirlpoolRa = 202.469; // 13h 29m 52s
        const whirlpoolDec = 47.195; // +47° 11' 43"
        expect(constellationFromCoords(whirlpoolRa, whirlpoolDec)).toBe('CVn');

        // 5. Dubhe (Alpha Ursae Majoris, Grande Ourse) — Coordonnées dans la Grande Ourse (UMa)
        const dubheRa = 165.931; // 11h 03m 43s
        const dubheDec = 61.751; // +61° 45' 03"
        expect(constellationFromCoords(dubheRa, dubheDec)).toBe('UMa');
    });

    /**
     * @test Valide le comportement aux limites géométriques du ciel céleste
     * (wrapping de l'Ascension Droite à 360° et limites de Déclinaison à +/-90°).
     */
    it('constellationFromCoords - gère correctement le wrapping circulaire et les limites physiques', () => {
        // L'Ascension Droite doit boucler à 360 degrés (modulo 360)
        // 10° et 370° (10 + 360) ou -350° (10 - 360) doivent renvoyer la même constellation
        const targetDec = 41.269; // Même déclinaison que M31

        const baseConstellation = constellationFromCoords(10.684, targetDec);
        const wrappedPositive = constellationFromCoords(10.684 + 360, targetDec);
        const wrappedNegative = constellationFromCoords(10.684 - 360, targetDec);

        expect(wrappedPositive).toBe(baseConstellation);
        expect(wrappedNegative).toBe(baseConstellation);

        // Déclinaison maximale au Pôle Nord Céleste (+90°)
        expect(constellationFromCoords(0, 90)).toBe('UMi');

        // Déclinaison minimale au Pôle Sud Céleste (-90°)
        expect(constellationFromCoords(0, -90)).toBe('Oct');
    });

    /**
     * @test Valide la robustesse de l'algorithme face à des valeurs aberrantes ou indéfinies.
     * WARNING: Empêche les plantages en cas de coordonnées corrompues dans les métadonnées CSV d'Astrobin.
     */
    it('constellationFromCoords - retourne undefined pour des entrées invalides ou non-finies', () => {
        expect(constellationFromCoords(NaN, 45)).toBeUndefined();
        expect(constellationFromCoords(120, NaN)).toBeUndefined();
        expect(constellationFromCoords(Infinity, -10)).toBeUndefined();
        expect(constellationFromCoords(80, -Infinity)).toBeUndefined();
    });
});
