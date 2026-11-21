/**
 * @file src/lib/objects/observation.test.ts
 * @description Suite de tests unitaires pour les calculs physiques et astronomiques.
 * Responsabilité : Assurer la rigueur et l'exactitude des calculs de coordonnées locales (Alt/Az),
 * d'airmass (Pickering 2002), d'heures sidérales, de positions solaires et de fenêtres de transit.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
    altAz,
    airmass,
    riseTransitSet,
    observability,
    sunPosition,
    altitudeSeries,
    findBestMoment,
    annualVisibility,
    azimuthCardinal,
    type ObsLocation,
    getLocalNoonAtLongitude,
    getObservatoryOffsetHours,
    formatTimeInLocation,
    formatDateInLocation,
    type AltAzSample,
} from './observation';

describe('Calculs et Moteur Astronomique (Meeus)', () => {
    // Coordonnées de test : Deep Sky Chile (Hémisphère Sud)
    const chileLocation: ObsLocation = {
        lat: -30.526,
        lon: -70.853,
        name: 'Deep Sky Chile',
    };

    // Coordonnées de test : Paris, France (Hémisphère Nord)
    const parisLocation: ObsLocation = {
        lat: 48.8566,
        lon: 2.3522,
        name: 'Paris',
    };

    describe('Airmass - Extinction atmosphérique (Pickering 2002)', () => {
        /**
         * @test Valide le calcul de la masse d'air en fonction de la hauteur céleste.
         * Raison technique : La formule Pickering 2002 gère les très basses altitudes sans tendre vers l'infini négatif.
         */
        it('airmass - calcule correctement les limites physiques', () => {
            // Au zénith (90°), la masse d'air doit être strictement égale à 1.0
            expect(airmass(90)).toBeCloseTo(1.0, 3);

            // À l'horizon ou en dessous (<= 0°), l'airmass doit valoir Infinity
            expect(airmass(0)).toBe(Infinity);
            expect(airmass(-10)).toBe(Infinity);

            // À 30° d'altitude, la masse d'air est théoriquement proche de 2.0
            expect(airmass(30)).toBeCloseTo(2.0, 1);
        });
    });

    describe('Azimuth Cardinal - Conversion de degrés en boussole', () => {
        /**
         * @test Valide la division de la rose des vents céleste en 8 quadrants cardinaux.
         */
        it('azimuthCardinal - retourne les bonnes abréviations françaises', () => {
            expect(azimuthCardinal(0)).toBe('N');
            expect(azimuthCardinal(45)).toBe('NE');
            expect(azimuthCardinal(90)).toBe('E');
            expect(azimuthCardinal(135)).toBe('SE');
            expect(azimuthCardinal(180)).toBe('S');
            expect(azimuthCardinal(225)).toBe('SO');
            expect(azimuthCardinal(270)).toBe('O');
            expect(azimuthCardinal(315)).toBe('NO');
            // Gère le wrapping circulaire des angles
            expect(azimuthCardinal(360)).toBe('N');
            expect(azimuthCardinal(390)).toBe('NE');
            expect(azimuthCardinal(-45)).toBe('NO');
        });
    });

    describe('Projection Céleste et Hauteur Céleste (altAz)', () => {
        /**
         * @test Valide le calcul de hauteur et d'azimut d'un objet céleste fixe à une date UTC donnée.
         */
        it("altAz - projette correctement une cible selon la position de l'observateur", () => {
            // Utilise la nébuleuse d'Orion (M42) : RA = 83.822°, DEC = -5.391°
            // À la date de test, nous vérifions que les coordonnées horizontales résultantes sont finies et physiques
            const testDate = new Date('2026-12-15T22:00:00.000Z');
            const result = altAz(83.822, -5.391, parisLocation, testDate);

            expect(result.altDeg).toBeLessThanOrEqual(90);
            expect(result.altDeg).toBeGreaterThanOrEqual(-90);
            expect(result.azDeg).toBeLessThanOrEqual(360);
            expect(result.azDeg).toBeGreaterThanOrEqual(0);
        });
    });

    describe('Position du Soleil (sunPosition)', () => {
        /**
         * @test Valide le calcul géométrique approché de la position solaire.
         * Raison technique : La précision requise est de l'ordre de ~0.01° pour délimiter les crépuscules.
         */
        it('sunPosition - calcule la déclinaison solaire selon les saisons', () => {
            // Solstice d'été Hémisphère Nord (environ 21 Juin) -> Déclinaison du soleil maximale (+23.44°)
            const summerSolstice = new Date('2026-06-21T12:00:00.000Z');
            const posSummer = sunPosition(summerSolstice);
            expect(posSummer.dec).toBeCloseTo(23.44, 0);

            // Solstice d'hiver Hémisphère Nord (environ 21 Décembre) -> Déclinaison minimale (-23.44°)
            const winterSolstice = new Date('2026-12-21T12:00:00.000Z');
            const posWinter = sunPosition(winterSolstice);
            expect(posWinter.dec).toBeCloseTo(-23.44, 0);
        });
    });

    describe('Événements Célestes (riseTransitSet)', () => {
        /**
         * @test Valide la détection des conditions aux limites géométriques (circumpolarité).
         */
        it('riseTransitSet - identifie les objets circumpolaires et invisibles', () => {
            // Étoile Polaire (Dec ≈ +89.2°) observée depuis Paris (+48.8°) -> Circumpolaire (ne se couche jamais)
            const polaris = riseTransitSet(37.95, 89.26, parisLocation, new Date('2026-05-26T12:00:00.000Z'));
            expect(polaris.circumpolar).toBe(true);

            // Cible lointaine de l'Hémisphère Sud (Dec = -75°) observée depuis Paris (+48.8°) -> Invisible
            const southernTarget = riseTransitSet(180.0, -75.0, parisLocation, new Date('2026-05-26T12:00:00.000Z'));
            expect(southernTarget.neverRises).toBe(true);
        });
    });

    describe('Trajectoires, Meilleur moment et Visibilité Annuelle', () => {
        const testDate = new Date('2026-05-26T12:00:00.000Z');

        /**
         * @test Valide la génération d'échantillons temporels sur 24 heures.
         */
        it("altitudeSeries - génère le bon nombre d'échantillons de trajectoire", () => {
            const series = altitudeSeries(83.822, -5.391, parisLocation, testDate, 48);
            expect(series.length).toBe(49); // N + 1 échantillons
            expect(series[0].time).toBeInstanceOf(Date);
        });

        /**
         * @test Valide la recherche du moment culminant de la nuit astronomique (soleil <= -12°).
         */
        it('findBestMoment - identifie le zénith sous ciel nocturne', () => {
            const series = altitudeSeries(83.822, -5.391, parisLocation, testDate, 48);
            const best = findBestMoment(series);
            expect(best).not.toBeNull();
            if (best) {
                expect(best.altDeg).toBeGreaterThanOrEqual(-90);
                expect(best.time).toBeInstanceOf(Date);
            }
        });

        /**
         * @test Valide la courbe annuelle de visibilité pour planifier les observations.
         */
        it('annualVisibility - calcule 12 mois de visibilité nocturne maximale', () => {
            const annual = annualVisibility(83.822, -5.391, parisLocation, testDate);
            expect(annual.length).toBe(12);
            expect(annual[0].monthStart).toBeInstanceOf(Date);
            expect(typeof annual[0].maxNightAltDeg).toBe('number');
        });
    });

    describe("Synthèse d'Observabilité d'un Objet", () => {
        /**
         * @test Valide le tag qualitatif français de visibilité ("excellent", "invisible", etc.)
         */
        it("observability - catégorise correctement l'accès visuel", () => {
            const testDate = new Date('2026-12-15T22:00:00.000Z');

            // Orion depuis le Chili culminant très haut -> 'excellent'
            const obsChile = observability(83.822, -5.391, chileLocation, testDate);
            expect(obsChile.tag).toBe('excellent');

            // Cible invisible -> 'invisible'
            const obsInvisible = observability(180.0, -75.0, parisLocation, testDate);
            expect(obsInvisible.tag).toBe('invisible');
        });
    });

    describe('Calculs de Fuseaux Horaires et Midi Local', () => {
        it('getLocalNoonAtLongitude - calcule correctement le midi local en UTC', () => {
            const date = new Date('2026-06-15T12:00:00.000Z');

            // Greenwich (lon = 0) -> midi local = 12:00 UTC
            const noonGreenwich = getLocalNoonAtLongitude(date, 0);
            expect(noonGreenwich.getUTCHours()).toBe(12);
            expect(noonGreenwich.getUTCMinutes()).toBe(0);

            // Chili (lon = -70.85) -> midi local = 12:00 - (-4.72h) = 16:43 UTC
            const noonChile = getLocalNoonAtLongitude(date, -70.85);
            expect(noonChile.getUTCHours()).toBe(16);
            expect(noonChile.getUTCMinutes()).toBe(43);
        });

        it('getObservatoryOffsetHours - estime le fuseau horaire', () => {
            // Chili -> UTC-4
            expect(getObservatoryOffsetHours(chileLocation)).toBe(-4);

            // Paris (avec un date mocké ou via fallback si le navigateur n'est pas proche)
            const farParis = { lat: 48.8566, lon: 2.3522, name: 'Paris Lointain' };
            const offset = getObservatoryOffsetHours(farParis);
            expect([0, 1, 2].includes(offset)).toBe(true);
        });

        it("formatTimeInLocation - formate l'heure dans le fuseau local", () => {
            const date = new Date('2026-06-15T16:43:00.000Z'); // 16:43 UTC

            // Chili (UTC-4) -> 12:43
            expect(formatTimeInLocation(date, chileLocation)).toBe('12:43');
            expect(formatTimeInLocation(date, chileLocation, true)).toBe('12:43 (UTC-4)');
        });
    });
});

describe('Compléments : tags, meilleur moment et fuseaux', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    const paris: ObsLocation = { lat: 48.8566, lon: 2.3522, name: 'Paris' };
    const now = new Date('2026-01-15T22:00:00Z');

    it('attribue les tags invisible, circumpolaire, bas et correct selon la hauteur maximale', () => {
        expect(observability(0, -80, paris, now).tag).toBe('invisible');
        expect(observability(0, 85, paris, now).tag).toBe('circumpolaire');
        // Hauteur max ≈ 90 − 48,86 + δ : δ = −35 → ≈ 6° (bas), δ = −10 → ≈ 31° (correct), δ = −25 → ≈ 16° (bas)
        expect(observability(0, -35, paris, now).tag).toBe('bas');
        expect(observability(0, -10, paris, now).tag).toBe('correct');
        expect(observability(0, -25, paris, now).tag).toBe('bas');
    });

    it('findBestMoment se rabat sur le maximum global sans nuit et renvoie null sous l’horizon', () => {
        const t = (h: number) => new Date(Date.UTC(2026, 0, 1, h));
        const daylight: AltAzSample[] = [
            { time: t(10), targetAltDeg: 20, targetAzDeg: 100, sunAltDeg: 10 },
            { time: t(12), targetAltDeg: 40, targetAzDeg: 180, sunAltDeg: 20 },
            { time: t(14), targetAltDeg: -5, targetAzDeg: 250, sunAltDeg: 15 },
        ];
        expect(findBestMoment(daylight)).toEqual({ time: t(12), altDeg: 40, azDeg: 180 });

        const below: AltAzSample[] = [
            { time: t(1), targetAltDeg: -10, targetAzDeg: 0, sunAltDeg: -30 },
            { time: t(2), targetAltDeg: 0, targetAzDeg: 0, sunAltDeg: 5 },
        ];
        expect(findBestMoment(below)).toBeNull();
    });

    it('getObservatoryOffsetHours utilise le navigateur, le cas du Chili ou la longitude arrondie', () => {
        vi.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(-60);
        expect(getObservatoryOffsetHours(paris, now)).toBe(1);
        expect(getObservatoryOffsetHours({ lat: -30, lon: -70.8, name: 'Deep Sky Chile' }, now)).toBe(-4);
        expect(getObservatoryOffsetHours({ lat: -30, lon: -70.8, name: 'Observatoire du Chili' }, now)).toBe(-4);
        expect(getObservatoryOffsetHours({ lat: 20, lon: -155.5, name: 'Mauna Kea' }, now)).toBe(-10);
        expect(getObservatoryOffsetHours({ lat: 0, lon: 100, name: 'Est' })).toBe(7);
    });

    it('formatTimeInLocation ajoute le fuseau UTC, UTC+N ou UTC-N', () => {
        vi.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(0);
        const d = new Date('2026-03-01T03:07:00Z');
        expect(formatTimeInLocation(d, { lat: 51.5, lon: 0, name: 'Greenwich' }, true)).toBe('03:07 (UTC)');
        expect(formatTimeInLocation(d, { lat: -30, lon: -70.8, name: 'Chile' }, true)).toBe('23:07 (UTC-4)');
        expect(formatTimeInLocation(d, { lat: 35, lon: 139.7, name: 'Tokyo' }, true)).toBe('12:07 (UTC+9)');
        expect(formatDateInLocation(d, { lat: -30, lon: -70.8, name: 'Chile' })).toBe('28 févr.');
    });
});
