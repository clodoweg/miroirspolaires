import { describe, it, expect } from 'vitest';
import { DEG, JULIAN_DAY_UNIX_EPOCH, julianDate, dateFromJulian } from './time';
import { sunEcliptic } from './sun';
import { getLimitMagnitude, getLimitMagnitudePhoto } from './instrument';

describe('temps julien', () => {
    it('donne le jour julien de J2000 et de l’époque Unix', () => {
        expect(julianDate(new Date('2000-01-01T12:00:00Z'))).toBe(2451545);
        expect(julianDate(new Date(0))).toBe(JULIAN_DAY_UNIX_EPOCH);
    });

    it('fait l’aller-retour Date → jour julien → Date', () => {
        const date = new Date('2026-10-27T21:30:00Z');
        expect(dateFromJulian(julianDate(date)).toISOString()).toBe(date.toISOString());
    });

    it('expose la conversion degrés → radians', () => {
        expect(180 * DEG).toBeCloseTo(Math.PI);
    });
});

describe('sunEcliptic', () => {
    it('place la Terre à environ 0,983 UA au périhélie de début janvier', () => {
        const sun = sunEcliptic(julianDate(new Date('2026-01-03T12:00:00Z')));
        expect(Math.hypot(sun.x, sun.y)).toBeCloseTo(0.9833, 3);
        expect(sun.z).toBe(0);
        expect(sun.epsilon / DEG).toBeCloseTo(23.44, 2);
    });

    it('donne une longitude solaire proche de 0° à l’équinoxe de mars', () => {
        const sun = sunEcliptic(julianDate(new Date('2026-03-20T14:46:00Z')));
        expect(Math.atan2(sun.y, sun.x) / DEG).toBeCloseTo(0, 0);
    });
});

describe('magnitudes limites des visualiseurs', () => {
    it('donne 9 pour 10 mm et +5 mag par décade d’ouverture', () => {
        expect(getLimitMagnitude(10)).toBeCloseTo(9);
        expect(getLimitMagnitude(100)).toBeCloseTo(14);
    });

    it('ajoute la correction photographique selon l’échantillonnage', () => {
        // 3,76 µm à 400 mm : environ 1,94″/px
        const photo = getLimitMagnitudePhoto(80, 3.76, 400);
        expect(photo - getLimitMagnitude(80)).toBeCloseTo(5 - 2.5 * Math.log10((206.265 * 3.76) / 400), 6);
    });

    it('borne la focale et l’échelle de plaque pour éviter les divisions extrêmes', () => {
        expect(Number.isFinite(getLimitMagnitudePhoto(80, 3.76, 0))).toBe(true);
        expect(getLimitMagnitudePhoto(80, 0, 400)).toBeCloseTo(getLimitMagnitude(80) + 5 - 2.5 * Math.log10(0.05));
    });
});
