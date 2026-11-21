import { describe, it, expect } from 'vitest';
import {
    degreesToRadians,
    radiansToDegrees,
    formatCoordinates,
    formatHorizontal,
    j2000ToHorizontal,
    horizontalToJ2000,
} from './stellarium-utils';

describe('Stellarium Utilities', () => {
    describe('Coordinate Conversions', () => {
        it('converts degrees to radians correctly', () => {
            expect(degreesToRadians(180)).toBeCloseTo(Math.PI);
            expect(degreesToRadians(90)).toBeCloseTo(Math.PI / 2);
        });

        it('converts radians to degrees correctly', () => {
            expect(radiansToDegrees(Math.PI)).toBeCloseTo(180);
            expect(radiansToDegrees(Math.PI / 2)).toBeCloseTo(90);
        });
    });

    describe('formatCoordinates', () => {
        it('formats RA/Dec radians to readable strings', () => {
            // 180 degrees = PI radians = 12h
            // 45 degrees = PI/4 radians
            const { raStr, decStr } = formatCoordinates(Math.PI, Math.PI / 4);
            expect(raStr).toBe('12h00');
            expect(decStr).toBe('45.00°');
        });

        it('pads RA minutes to 2 digits', () => {
            // 0.5h = 30min → "0h30"
            const { raStr } = formatCoordinates(Math.PI / 12, 0); // 15° = 1h
            expect(raStr).toBe('1h00');
        });

        it('formats negative declination', () => {
            const { decStr } = formatCoordinates(0, -Math.PI / 4);
            expect(decStr).toBe('-45.00°');
        });
    });

    describe('formatHorizontal', () => {
        it('formats azimuth, altitude and FOV to degree strings', () => {
            const { azStr, altStr, fovStr } = formatHorizontal(
                degreesToRadians(90), // az = 90°
                degreesToRadians(45), // alt = 45°
                degreesToRadians(1), // fov = 1°
            );
            expect(parseFloat(azStr)).toBeCloseTo(90, 1);
            expect(parseFloat(altStr)).toBeCloseTo(45, 1);
            expect(parseFloat(fovStr)).toBeCloseTo(1, 1);
        });

        it('remaps azimuth above 180° to negative (e.g. 270° → -90°)', () => {
            const { azStr } = formatHorizontal(degreesToRadians(270), 0, 0);
            expect(parseFloat(azStr)).toBeCloseTo(-90, 1);
        });

        it('handles 0 radians input', () => {
            const { azStr, altStr, fovStr } = formatHorizontal(0, 0, 0);
            expect(parseFloat(azStr)).toBeCloseTo(0, 5);
            expect(parseFloat(altStr)).toBeCloseTo(0, 5);
            expect(parseFloat(fovStr)).toBeCloseTo(0, 5);
        });
    });

    describe('j2000ToHorizontal — manual fallback', () => {
        // Use a known observation: observer at equator (lat=0), LST = RA → object is on meridian
        // At lat=0, object on meridian at RA=LST has az=0° (North) and alt=90°-|Dec|
        it('returns null when no obs state is provided', () => {
            expect(j2000ToHorizontal(0, 0, {})).toBeNull();
        });

        it('places an object on the meridian when LST equals RA', () => {
            const raRad = degreesToRadians(45);
            const decRad = degreesToRadians(30);
            // LST = RA (object on meridian) → HA = 0 → maximum altitude
            const obs = {
                latitude: 0,
                localSiderealTime: 45, // degrees, same as RA
            };
            const result = j2000ToHorizontal(raRad, decRad, obs);
            expect(result).not.toBeNull();
            // At equator, meridian transit altitude = 90° - |Dec| = 60°
            expect(radiansToDegrees(result!.alt)).toBeCloseTo(60, 0);
        });
    });

    describe('horizontalToJ2000 — manual fallback', () => {
        it('returns null when no obs state is provided', () => {
            expect(horizontalToJ2000(0, 0, {})).toBeNull();
        });

        it('round-trips Alt/Az → J2000 → Alt/Az within 1°', () => {
            const obs = { latitude: 48, localSiderealTime: 120 }; // Paris-ish, LST 8h
            const azRad = degreesToRadians(180); // South
            const altRad = degreesToRadians(50);

            const j2000 = horizontalToJ2000(azRad, altRad, obs);
            expect(j2000).not.toBeNull();

            const back = j2000ToHorizontal(j2000!.ra, j2000!.dec, obs);
            expect(back).not.toBeNull();

            expect(radiansToDegrees(back!.alt)).toBeCloseTo(radiansToDegrees(altRad), 0);
        });
    });
    describe('transformations matricielles (ri2h)', () => {
        const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];

        it('utilise la matrice ri2h en priorité sur le calcul trigonométrique', () => {
            const result = j2000ToHorizontal(0, 0, { ri2h: IDENTITY, latitude: 45, localSiderealTime: 0 });
            expect(result?.alt).toBeCloseTo(0);
            expect(result?.az).toBeCloseTo(Math.PI);
            expect(radiansToDegrees(j2000ToHorizontal(0, Math.PI / 2, { ri2h: IDENTITY })!.alt)).toBeCloseTo(90);
        });

        it('fait l’aller-retour J2000 → horizontal → J2000 avec une rotation et un Float32Array', () => {
            const a = degreesToRadians(30);
            const b = degreesToRadians(-40);
            // Rotation autour de z puis de y : matrice orthogonale quelconque.
            const rz = [Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a), 0, 0, 0, 1];
            const ry = [Math.cos(b), 0, Math.sin(b), 0, 1, 0, -Math.sin(b), 0, Math.cos(b)];
            const m: number[] = [];
            for (let i = 0; i < 3; i++)
                for (let j = 0; j < 3; j++)
                    m.push([0, 1, 2].reduce((acc, k) => acc + rz[i * 3 + k] * ry[k * 3 + j], 0));
            const obs = { ri2h: Float64Array.from(m) as unknown as Float32Array };
            const ra = degreesToRadians(250);
            const dec = degreesToRadians(-12);
            const hor = j2000ToHorizontal(ra, dec, obs);
            const back = horizontalToJ2000(hor!.az, hor!.alt, obs);
            expect(back!.ra).toBeCloseTo(ra, 6);
            expect(back!.dec).toBeCloseTo(dec, 6);
        });

        it('ignore une matrice trop courte et retombe sur le calcul manuel', () => {
            expect(j2000ToHorizontal(0, 0, { ri2h: [1, 0, 0] })).toBeNull();
            expect(horizontalToJ2000(0, 0, { ri2h: [1, 0, 0] })).toBeNull();
        });
    });

    describe('calcul manuel depuis l’UTC (MJD) et la longitude', () => {
        const obs = { latitude: 45, longitude: 2.35, utc: 60000.5 };

        it('exige la longitude en plus de l’UTC', () => {
            expect(j2000ToHorizontal(0, 0, { latitude: 45, utc: 60000 })).toBeNull();
            expect(horizontalToJ2000(0, 0, { latitude: 45, utc: 60000 })).toBeNull();
        });

        it('place le pôle céleste à une altitude égale à la latitude', () => {
            const pole = j2000ToHorizontal(1.2, Math.PI / 2, obs);
            expect(radiansToDegrees(pole!.alt)).toBeCloseTo(45, 5);
            // Nord : 0 ou 2π selon l’arrondi flottant.
            expect(Math.cos(pole!.az)).toBeCloseTo(1, 5);
        });

        it('fait l’aller-retour horizontal → J2000 → horizontal', () => {
            const az = degreesToRadians(120);
            const alt = degreesToRadians(35);
            const eq = horizontalToJ2000(az, alt, obs);
            const back = j2000ToHorizontal(eq!.ra, eq!.dec, obs);
            expect(back!.alt).toBeCloseTo(alt, 6);
            expect(back!.az).toBeCloseTo(az, 6);
        });

        it('gère le zénith et le pôle sans division par zéro', () => {
            const zenith = j2000ToHorizontal(degreesToRadians(30), degreesToRadians(45), {
                latitude: 45,
                localSiderealTime: 30,
            });
            expect(radiansToDegrees(zenith!.alt)).toBeCloseTo(90, 5);
            expect(zenith!.az).toBe(0);

            const pole = horizontalToJ2000(0, degreesToRadians(90), { latitude: 90, localSiderealTime: 75 });
            expect(radiansToDegrees(pole!.dec)).toBeCloseTo(90, 5);
            expect(radiansToDegrees(pole!.ra)).toBeCloseTo(75, 5);
        });
    });
});
