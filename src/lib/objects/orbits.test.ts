import { describe, expect, it, vi, afterEach } from 'vitest';
import { julianDate } from '@/lib/astro/time';
import {
    ASTEROID_SIMULATOR_PLANETS,
    COMET_SIMULATOR_PLANETS,
    GAUSS_GRAVITATIONAL_CONSTANT,
    SOLAR_SYSTEM_PLANETS,
    asteroidApparentMagnitude,
    asteroidOrbitPath,
    calculateAsteroidPosition,
    calculateCometPosition,
    cometApparentMagnitude,
    cometOrbitPath,
    cometPerihelionJulianDay,
    cometTrueAnomaly,
    heliocentricToEquatorial,
    orbitalPlaneToEcliptic,
    parsePackedDate,
    planetHeliocentricPosition,
    planetOrbitEllipse,
    solveKeplerElliptic,
    solveKeplerHyperbolic,
    toSvgPathData,
    trueAnomalyFromEccentric,
} from './orbits';

const FLAT = { omega: 0, node: 0, inclination: 0 };
/** Période d'une orbite circulaire de 1 UA avec la constante de Gauss (jours). */
const ONE_AU_PERIOD = (2 * Math.PI) / GAUSS_GRAVITATIONAL_CONSTANT;

describe('solveKeplerElliptic', () => {
    it('renvoie M pour une orbite circulaire (e = 0)', () => {
        expect(solveKeplerElliptic(1.234, 0)).toBe(1.234);
    });

    it('résout E − e·sin E = M pour e = 0,5 et M = 1 rad', () => {
        const E = solveKeplerElliptic(1, 0.5);
        expect(E).toBeCloseTo(1.4987011335, 9);
        expect(E - 0.5 * Math.sin(E)).toBeCloseTo(1, 12);
    });

    it('respecte le nombre d’itérations demandé', () => {
        // Une seule itération de Newton depuis E0 = M = 1.
        const expected = 1 - (1 - 0.5 * Math.sin(1) - 1) / (1 - 0.5 * Math.cos(1));
        expect(solveKeplerElliptic(1, 0.5, 1)).toBe(expected);
    });
});

describe('solveKeplerHyperbolic', () => {
    it('résout e·sinh H − H = M', () => {
        const H = solveKeplerHyperbolic(2, 1.5);
        expect(1.5 * Math.sinh(H) - H).toBeCloseTo(2, 10);
    });
});

describe('trueAnomalyFromEccentric', () => {
    it('est l’identité pour e = 0', () => {
        expect(trueAnomalyFromEccentric(0.7, 0)).toBeCloseTo(0.7, 12);
    });

    it('donne 2π/3 pour E = π/2 et e = 0,5', () => {
        expect(trueAnomalyFromEccentric(Math.PI / 2, 0.5)).toBeCloseTo((2 * Math.PI) / 3, 12);
    });
});

describe('cometTrueAnomaly', () => {
    it('vaut 0 au périhélie pour les trois types d’orbite', () => {
        expect(cometTrueAnomaly(1, 0.5, 0)).toBe(0);
        expect(cometTrueAnomaly(1, 1, 0)).toBeCloseTo(0, 12);
        expect(cometTrueAnomaly(1, 1.5, 0)).toBe(0);
    });

    it('fait un demi-tour en une demi-période sur une orbite circulaire de 1 UA', () => {
        expect(Math.abs(cometTrueAnomaly(1, 0, ONE_AU_PERIOD / 2))).toBeCloseTo(Math.PI, 6);
    });

    it('vérifie l’équation de Barker pour une parabole', () => {
        const q = 1;
        const t = 30;
        const nu = cometTrueAnomaly(q, 1, t);
        const s = Math.tan(nu / 2);
        const W = (GAUSS_GRAVITATIONAL_CONSTANT / (Math.sqrt(2) * q * Math.sqrt(q))) * t;
        expect(s + (s * s * s) / 3).toBeCloseTo(W, 10);
    });

    it('est antisymétrique dans le temps', () => {
        expect(cometTrueAnomaly(0.6, 0.97, -40)).toBeCloseTo(-cometTrueAnomaly(0.6, 0.97, 40), 10);
    });
});

describe('orbitalPlaneToEcliptic', () => {
    it('est l’identité quand ω, Ω et i sont nuls', () => {
        expect(orbitalPlaneToEcliptic(2, 3, FLAT)).toEqual({ x: 2, y: 3, z: 0 });
    });

    it('relève l’axe y sur z pour une inclinaison de 90°', () => {
        const p = orbitalPlaneToEcliptic(0, 1, { omega: 0, node: 0, inclination: 90 });
        expect(p.x).toBeCloseTo(0, 12);
        expect(p.y).toBeCloseTo(0, 12);
        expect(p.z).toBeCloseTo(1, 12);
    });

    it('fait tourner de Ω + ω dans le plan de l’écliptique', () => {
        const p = orbitalPlaneToEcliptic(1, 0, { omega: 30, node: 60, inclination: 0 });
        expect(p.x).toBeCloseTo(0, 12);
        expect(p.y).toBeCloseTo(1, 12);
    });
});

describe('heliocentricToEquatorial', () => {
    const earthOnXAxis = { x: -1, y: 0, z: 0, epsilon: 23.44 * (Math.PI / 180) };

    it('place à AD 0 et Déc 0 un corps aligné Soleil-Terre au-delà de la Terre', () => {
        const eq = heliocentricToEquatorial({ x: 2, y: 0, z: 0 }, earthOnXAxis);
        expect(eq.ra).toBeCloseTo(0, 12);
        expect(eq.dec).toBeCloseTo(0, 12);
        expect(eq.delta).toBeCloseTo(1, 12);
    });

    it('ramène l’ascension droite dans [0, 360[', () => {
        const eq = heliocentricToEquatorial({ x: 1, y: -1, z: 0 }, { x: 0, y: 0, z: 0, epsilon: 0 });
        expect(eq.ra).toBeCloseTo(315, 10);
        expect(eq.delta).toBeCloseTo(Math.SQRT2, 12);
    });

    it('incline le plan de l’écliptique de ε', () => {
        const epsilon = 23.44 * (Math.PI / 180);
        const eq = heliocentricToEquatorial({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 0, epsilon });
        expect(eq.ra).toBeCloseTo(90, 10);
        expect(eq.dec).toBeCloseTo(23.44, 10);
    });
});

describe('magnitudes', () => {
    it('cométaire : m = g à 1 UA du Soleil et de la Terre, +5 par décade de Δ', () => {
        expect(cometApparentMagnitude(5, 4, 1, 1)).toBe(5);
        expect(cometApparentMagnitude(5, 4, 10, 1)).toBeCloseTo(10, 12);
        expect(cometApparentMagnitude(5, 4, 1, 10)).toBeCloseTo(15, 12);
    });

    it('H-G : à l’opposition (phase nulle), m = H + 5·log10(r·Δ)', () => {
        expect(asteroidApparentMagnitude(10, 0.15, 2, 1, 1)).toBeCloseTo(10 + 5 * Math.log10(2), 12);
    });

    it('H-G : la phase assombrit l’astéroïde', () => {
        const opposition = asteroidApparentMagnitude(10, 0.15, 2, 1, 1);
        expect(asteroidApparentMagnitude(10, 0.15, 2, 1, Math.sqrt(5))).toBeGreaterThan(opposition);
    });
});

describe('parsePackedDate', () => {
    afterEach(() => vi.useRealTimers());

    it('décode les dates compactées MPC', () => {
        expect(parsePackedDate('K2555').toISOString()).toBe('2025-05-05T00:00:00.000Z');
        expect(parsePackedDate('J9611').toISOString()).toBe('1996-01-01T00:00:00.000Z');
        expect(parsePackedDate('K24AB').toISOString()).toBe('2024-10-11T00:00:00.000Z');
        expect(parsePackedDate('I99CV').toISOString()).toBe('1899-12-31T00:00:00.000Z');
    });

    it('renvoie la date courante pour un format invalide', () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-10-28T12:00:00Z'));
        expect(parsePackedDate('').toISOString()).toBe('2026-10-28T12:00:00.000Z');
        expect(parsePackedDate('K25').toISOString()).toBe('2026-10-28T12:00:00.000Z');
    });
});

describe('calculateCometPosition', () => {
    const circular = { pYear: 2025, pMonth: 1, pDay: 1.5, q: 1, e: 0, ...FLAT, mag: 5, slope: 4 };
    const earthOnYAxis = { x: 0, y: -1, z: 0, epsilon: 0 };

    it('calcule le jour julien du périhélie avec sa fraction de jour', () => {
        expect(cometPerihelionJulianDay(circular)).toBe(julianDate(new Date('2025-01-01T00:00:00Z')));
    });

    it('place au périhélie une comète circulaire à 1 UA sur l’axe x', () => {
        const pos = calculateCometPosition(circular, cometPerihelionJulianDay(circular), earthOnYAxis);
        expect(pos.r).toBeCloseTo(1, 12);
        expect(pos.x_hel).toBeCloseTo(1, 12);
        expect(pos.y_hel).toBeCloseTo(0, 12);
        expect(pos.x_earth).toBe(-0);
        expect(pos.y_earth).toBe(1);
        expect(pos.delta).toBeCloseTo(Math.SQRT2, 12);
        expect(pos.ra).toBeCloseTo(315, 10);
        expect(pos.apparentMag).toBeCloseTo(5 + 5 * Math.log10(Math.SQRT2), 12);
    });

    it('fait le tour en une période de Gauss', () => {
        const jdP = cometPerihelionJulianDay(circular);
        const half = calculateCometPosition(circular, jdP + ONE_AU_PERIOD / 2, earthOnYAxis);
        expect(half.x_hel).toBeCloseTo(-1, 6);
        const full = calculateCometPosition(circular, jdP + ONE_AU_PERIOD, earthOnYAxis);
        expect(full.x_hel).toBeCloseTo(1, 6);
    });
});

describe('calculateAsteroidPosition', () => {
    it('propage l’anomalie moyenne depuis l’époque', () => {
        const asteroid = { h: 10, g: 0.15, epoch: 'K2511', m: 0, n: 1, a: 1, e: 0, ...FLAT };
        const jdEpoch = julianDate(new Date('2025-01-01T00:00:00Z'));
        const pos = calculateAsteroidPosition(asteroid, jdEpoch + 90, { x: 0, y: 0, z: 0, epsilon: 0 });
        expect(pos.r).toBeCloseTo(1, 12);
        expect(pos.x_hel).toBeCloseTo(0, 10);
        expect(pos.y_hel).toBeCloseTo(1, 10);
        expect(pos.ra).toBeCloseTo(90, 8);
    });

    it('a sa distance au Soleil entre périhélie et aphélie', () => {
        const asteroid = {
            h: 10,
            g: 0.15,
            epoch: 'K2511',
            m: 123,
            n: 0.5,
            a: 2,
            e: 0.4,
            omega: 10,
            node: 20,
            inclination: 5,
        };
        const pos = calculateAsteroidPosition(asteroid, 2460800, { x: -1, y: 0, z: 0, epsilon: 0.409 });
        expect(pos.r).toBeGreaterThanOrEqual(1.2);
        expect(pos.r).toBeLessThanOrEqual(2.8);
    });
});

describe('tracés d’orbite', () => {
    it('cometOrbitPath : cercle de rayon q, 201 points', () => {
        const pts = cometOrbitPath({ q: 2, e: 0, ...FLAT });
        expect(pts).toHaveLength(201);
        for (const p of pts) expect(Math.hypot(p.x, p.y)).toBeCloseTo(2, 10);
    });

    it('cometOrbitPath : hyperbole bornée par son asymptote et par 1000 UA', () => {
        const pts = cometOrbitPath({ q: 1, e: 1.2, ...FLAT });
        expect(pts.length).toBeGreaterThan(0);
        expect(pts.length).toBeLessThanOrEqual(201);
        for (const p of pts) expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(1000);
    });

    it('asteroidOrbitPath : ellipse fermée de 121 points', () => {
        const pts = asteroidOrbitPath({ a: 2, e: 0.5, ...FLAT });
        expect(pts).toHaveLength(121);
        expect(pts[0].x).toBeCloseTo(1, 10); // périhélie a(1 − e)
        expect(pts[60].x).toBeCloseTo(-3, 6); // aphélie a(1 + e) à M = 180°
        expect(pts[120].x).toBeCloseTo(pts[0].x, 6);
    });
});

describe('planètes', () => {
    it('garde huit planètes pour les comètes et cinq (jusqu’à Jupiter) pour les astéroïdes', () => {
        expect(COMET_SIMULATOR_PLANETS).toHaveLength(8);
        expect(COMET_SIMULATOR_PLANETS.map((p) => p.abbr)).toContain('neptune');
        expect(ASTEROID_SIMULATOR_PLANETS.map((p) => p.abbr)).toEqual(['mercury', 'venus', 'earth', 'mars', 'jupiter']);
    });

    it('positionne une planète entre périhélie et aphélie et retrouve sa position après une période', () => {
        const mars = SOLAR_SYSTEM_PLANETS.find((p) => p.abbr === 'mars')!;
        const p0 = planetHeliocentricPosition(mars, 1000);
        const r = Math.hypot(p0.x, p0.y);
        expect(r).toBeGreaterThanOrEqual(mars.a * (1 - mars.e) - 1e-9);
        expect(r).toBeLessThanOrEqual(mars.a * (1 + mars.e) + 1e-9);
        const p1 = planetHeliocentricPosition(mars, 1000 + mars.periodDays);
        expect(p1.x).toBeCloseTo(p0.x, 8);
        expect(p1.y).toBeCloseTo(p0.y, 8);
    });

    it('commence l’ellipse au périhélie, dans la direction de ϖ', () => {
        const earth = SOLAR_SYSTEM_PLANETS.find((p) => p.abbr === 'earth')!;
        const pts = planetOrbitEllipse({ ...earth, varpi: 90 });
        expect(pts).toHaveLength(61);
        expect(pts[0].x).toBeCloseTo(0, 12);
        expect(pts[0].y).toBeCloseTo(1 - earth.e, 12);
    });
});

describe('toSvgPathData', () => {
    it('produit une polyligne arrondie au dixième', () => {
        expect(
            toSvgPathData([
                { cx: 1.04, cy: 2 },
                { cx: 3.16, cy: 4.25 },
            ]),
        ).toBe('M 1.0 2.0 L 3.2 4.3');
        expect(toSvgPathData([])).toBe('');
    });
});
