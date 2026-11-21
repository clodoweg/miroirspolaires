/**
 * Mécanique orbitale analytique des petits corps (comètes, astéroïdes) et des planètes
 *
 * Responsabilité : calculs purs partagés par `CometsViewer` et `AsteroidsViewer` :
 * équation de Kepler (elliptique, hyperbolique, parabolique), passage du plan orbital
 * à l'écliptique puis à l'équateur J2000, magnitudes apparentes (MPC pour les comètes,
 * H-G de l'IAU pour les astéroïdes), tracés d'orbites et positions planétaires
 * approchées pour les simulateurs SVG.
 *
 * WARNING: l'ordre des opérations reproduit à l'identique le code historique des deux
 * visualiseurs : le modifier change les positions affichées au dernier chiffre près.
 */

import { DEG, julianDate } from '@/lib/astro/time';

/** Constante gravitationnelle de Gauss (UA^(3/2) · jour⁻¹). */
export const GAUSS_GRAVITATIONAL_CONSTANT = 0.01720209895;

/** Jour julien de l'époque J2000.0. */
export const J2000_JULIAN_DAY = 2451545.0;

/** Position du Soleil vue de la Terre, telle que renvoyée par `sunEcliptic`. */
export interface SunEclipticPosition {
    x: number;
    y: number;
    z: number;
    epsilon: number;
}

/** Point 2D héliocentrique écliptique (UA). */
export interface EclipticPoint {
    x: number;
    y: number;
}

/** Orientation du plan orbital, angles en degrés. */
export interface OrbitOrientation {
    /** Argument du périhélie ω. */
    omega: number;
    /** Longitude du nœud ascendant Ω. */
    node: number;
    /** Inclinaison i. */
    inclination: number;
}

/** Position calculée d'un petit corps à une date donnée. */
export interface SmallBodyPosition {
    /** Ascension droite J2000 (degrés, 0–360). */
    ra: number;
    /** Déclinaison J2000 (degrés). */
    dec: number;
    /** Distance au Soleil (UA). */
    r: number;
    /** Distance à la Terre (UA). */
    delta: number;
    apparentMag: number;
    /** Coordonnées héliocentriques écliptiques du corps (UA). */
    x_hel: number;
    y_hel: number;
    /** Coordonnées héliocentriques écliptiques de la Terre (UA). */
    x_earth: number;
    y_earth: number;
}

/** Éléments orbitaux d'une comète (format MPC `CometEls`). */
export interface CometElements extends OrbitOrientation {
    pYear: number;
    pMonth: number;
    /** Jour du passage au périhélie, avec fraction de jour. */
    pDay: number;
    /** Distance au périhélie (UA). */
    q: number;
    e: number;
    /** Magnitude absolue g. */
    mag: number;
    /** Paramètre de pente k. */
    slope: number;
}

/** Éléments orbitaux d'un astéroïde (format MPC). */
export interface AsteroidElements extends OrbitOrientation {
    /** Magnitude absolue H. */
    h: number;
    /** Paramètre de pente G. */
    g: number;
    /** Époque compactée MPC (5 caractères). */
    epoch: string;
    /** Anomalie moyenne à l'époque (degrés). */
    m: number;
    e: number;
    /** Moyen mouvement (degrés par jour). */
    n: number;
    /** Demi-grand axe (UA). */
    a: number;
}

/**
 * Résout l'équation de Kepler elliptique E − e·sin E = M par la méthode de Newton.
 *
 * @param meanAnomalyRad - Anomalie moyenne M (radians).
 * @param e - Excentricité (0 ≤ e < 1).
 * @param iterations - Nombre d'itérations de Newton (15 par défaut).
 * @returns L'anomalie excentrique E (radians).
 */
export function solveKeplerElliptic(meanAnomalyRad: number, e: number, iterations = 15): number {
    let E = meanAnomalyRad;
    for (let i = 0; i < iterations; i++) {
        E = E - (E - e * Math.sin(E) - meanAnomalyRad) / (1 - e * Math.cos(E));
    }
    return E;
}

/**
 * Résout l'équation de Kepler hyperbolique e·sinh H − H = M par la méthode de Newton.
 *
 * @param meanAnomaly - Anomalie moyenne hyperbolique M.
 * @param e - Excentricité (e > 1).
 * @param iterations - Nombre d'itérations de Newton (15 par défaut).
 * @returns L'anomalie excentrique hyperbolique H.
 */
export function solveKeplerHyperbolic(meanAnomaly: number, e: number, iterations = 15): number {
    let H = meanAnomaly;
    for (let i = 0; i < iterations; i++) {
        H = H - (e * Math.sinh(H) - H - meanAnomaly) / (e * Math.cosh(H) - 1);
    }
    return H;
}

/**
 * Anomalie vraie d'une orbite elliptique à partir de l'anomalie excentrique.
 *
 * @param eccentricAnomaly - Anomalie excentrique E (radians).
 * @param e - Excentricité.
 * @returns L'anomalie vraie ν (radians).
 */
export function trueAnomalyFromEccentric(eccentricAnomaly: number, e: number): number {
    return (
        2 *
        Math.atan2(Math.sqrt(1 + e) * Math.sin(eccentricAnomaly / 2), Math.sqrt(1 - e) * Math.cos(eccentricAnomaly / 2))
    );
}

/**
 * Anomalie vraie d'une comète à un instant donné, quel que soit le type d'orbite.
 *
 * Elliptique si e < 0,999, hyperbolique si e > 1,001, sinon équation de Barker (parabole).
 *
 * @param q - Distance au périhélie (UA).
 * @param e - Excentricité.
 * @param daysSincePerihelion - Temps écoulé depuis le périhélie (jours, négatif avant).
 * @returns L'anomalie vraie ν (radians).
 */
export function cometTrueAnomaly(q: number, e: number, daysSincePerihelion: number): number {
    const k = GAUSS_GRAVITATIONAL_CONSTANT;
    if (e < 0.999) {
        const a = q / (1 - e);
        const n = k / (a * Math.sqrt(a)); // moyen mouvement
        const M = n * daysSincePerihelion;
        const E = solveKeplerElliptic(M, e);
        return trueAnomalyFromEccentric(E, e);
    }
    if (e > 1.001) {
        const a = q / (e - 1);
        const n = k / (a * Math.sqrt(a));
        const M = n * daysSincePerihelion;
        const H = solveKeplerHyperbolic(M, e);
        return 2 * Math.atan2(Math.sqrt(e + 1) * Math.sinh(H / 2), Math.sqrt(e - 1) * Math.cosh(H / 2));
    }
    // Orbite parabolique ou quasi-parabolique (équation de Barker)
    const W = (k / (Math.sqrt(2) * q * Math.sqrt(q))) * daysSincePerihelion;
    const A = Math.cbrt(1.5 * W + Math.sqrt(2.25 * W * W + 1));
    const tanHalfNu = A - 1 / A;
    return 2 * Math.atan(tanHalfNu);
}

/**
 * Fait tourner un point du plan orbital vers le repère héliocentrique écliptique J2000.
 *
 * @param x_op - Abscisse dans le plan orbital (UA, axe vers le périhélie).
 * @param y_op - Ordonnée dans le plan orbital (UA).
 * @param orientation - ω, Ω et i en degrés.
 * @returns Les coordonnées héliocentriques écliptiques `x`, `y`, `z` (UA).
 */
export function orbitalPlaneToEcliptic(
    x_op: number,
    y_op: number,
    orientation: OrbitOrientation,
): { x: number; y: number; z: number } {
    const omega = orientation.omega * DEG;
    const node = orientation.node * DEG;
    const inc = orientation.inclination * DEG;

    const x =
        x_op * (Math.cos(omega) * Math.cos(node) - Math.sin(omega) * Math.sin(node) * Math.cos(inc)) +
        y_op * (-Math.sin(omega) * Math.cos(node) - Math.cos(omega) * Math.sin(node) * Math.cos(inc));

    const y =
        x_op * (Math.cos(omega) * Math.sin(node) + Math.sin(omega) * Math.cos(node) * Math.cos(inc)) +
        y_op * (-Math.sin(omega) * Math.sin(node) + Math.cos(omega) * Math.cos(node) * Math.cos(inc));

    const z = x_op * (Math.sin(omega) * Math.sin(inc)) + y_op * (Math.cos(omega) * Math.sin(inc));

    return { x, y, z };
}

/**
 * Convertit une position héliocentrique écliptique en coordonnées équatoriales géocentriques.
 *
 * @param heliocentric - Position héliocentrique écliptique du corps (UA).
 * @param sun - Position du Soleil vue de la Terre et obliquité de l'écliptique.
 * @returns Ascension droite (degrés, 0–360), déclinaison (degrés) et distance à la Terre (UA).
 */
export function heliocentricToEquatorial(
    heliocentric: { x: number; y: number; z: number },
    sun: SunEclipticPosition,
): { ra: number; dec: number; delta: number } {
    // Coordonnées géocentriques écliptiques
    const x_geo = heliocentric.x + sun.x;
    const y_geo = heliocentric.y + sun.y;
    const z_geo = heliocentric.z + sun.z;

    // Rotation vers le plan équatorial J2000 par l'obliquité de l'écliptique (epsilon)
    const cosEps = Math.cos(sun.epsilon);
    const sinEps = Math.sin(sun.epsilon);

    const X_eq = x_geo;
    const Y_eq = y_geo * cosEps - z_geo * sinEps;
    const Z_eq = y_geo * sinEps + z_geo * cosEps;

    const delta = Math.sqrt(X_eq * X_eq + Y_eq * Y_eq + Z_eq * Z_eq);

    let ra = Math.atan2(Y_eq, X_eq) / DEG;
    if (ra < 0) ra += 360;
    const dec = Math.asin(Z_eq / delta) / DEG;

    return { ra, dec, delta };
}

/**
 * Magnitude apparente d'une comète (formule du Minor Planet Center).
 *
 * @param absoluteMag - Magnitude absolue g.
 * @param slope - Paramètre de pente k.
 * @param delta - Distance à la Terre (UA).
 * @param r - Distance au Soleil (UA).
 * @returns m = g + 5·log10(Δ) + 2,5·k·log10(r).
 */
export function cometApparentMagnitude(absoluteMag: number, slope: number, delta: number, r: number): number {
    return absoluteMag + 5 * Math.log10(delta) + 2.5 * slope * Math.log10(r);
}

/**
 * Magnitude apparente d'un astéroïde (système H-G de l'IAU).
 *
 * @param h - Magnitude absolue H.
 * @param g - Paramètre de pente G.
 * @param r - Distance au Soleil (UA).
 * @param delta - Distance à la Terre (UA).
 * @param earthSunDistance - Distance Terre-Soleil R (UA).
 * @returns La magnitude apparente V.
 */
export function asteroidApparentMagnitude(
    h: number,
    g: number,
    r: number,
    delta: number,
    earthSunDistance: number,
): number {
    const R = earthSunDistance;
    // Angle de phase alpha (angle Terre-Astéroïde-Soleil)
    const cosAlpha = Math.max(-1, Math.min(1, (r * r + delta * delta - R * R) / (2 * r * delta)));
    const alpha = Math.acos(cosAlpha);

    // Fonctions de phase standard
    const phi1 = Math.exp(-3.33 * Math.pow(Math.tan(alpha / 2), 0.63));
    const phi2 = Math.exp(-1.87 * Math.pow(Math.tan(alpha / 2), 1.22));

    return h + 5 * Math.log10(r * delta) - 2.5 * Math.log10((1 - g) * phi1 + g * phi2);
}

/**
 * Jour julien du passage au périhélie d'une comète.
 *
 * @param comet - Année, mois et jour (fractionnaire) du passage.
 * @returns Le jour julien correspondant.
 */
export function cometPerihelionJulianDay(comet: Pick<CometElements, 'pYear' | 'pMonth' | 'pDay'>): number {
    const tpDate = new Date(Date.UTC(comet.pYear, comet.pMonth - 1, Math.floor(comet.pDay)));
    const dayFraction = comet.pDay - Math.floor(comet.pDay);
    return julianDate(tpDate) + dayFraction - 0.5;
}

/**
 * Résout les coordonnées équatoriales, les distances et la magnitude d'une comète.
 *
 * @param comet - Éléments orbitaux de la comète.
 * @param jd - Jour julien de la date de calcul.
 * @param sun - Position du Soleil à cette date (`sunEcliptic(jd)`).
 * @returns La position calculée de la comète et celle de la Terre.
 */
export function calculateCometPosition(comet: CometElements, jd: number, sun: SunEclipticPosition): SmallBodyPosition {
    const tDays = jd - cometPerihelionJulianDay(comet);
    const e = comet.e;
    const q = comet.q;

    const nu = cometTrueAnomaly(q, e, tDays);
    const r = (q * (1 + e)) / (1 + e * Math.cos(nu));

    const heliocentric = orbitalPlaneToEcliptic(r * Math.cos(nu), r * Math.sin(nu), comet);
    const { ra, dec, delta } = heliocentricToEquatorial(heliocentric, sun);

    return {
        ra,
        dec,
        r,
        delta,
        apparentMag: cometApparentMagnitude(comet.mag, comet.slope, delta, r),
        x_hel: heliocentric.x,
        y_hel: heliocentric.y,
        x_earth: -sun.x,
        y_earth: -sun.y,
    };
}

/**
 * Décode une date compactée MPC (ex. `K2555` → 2025-05-05).
 *
 * @param packed - Chaîne de 5 caractères : siècle (I/J/K), année, mois et jour en base 31.
 * @returns La date UTC correspondante, ou la date courante si le format est invalide.
 */
export function parsePackedDate(packed: string): Date {
    if (!packed || packed.length !== 5) return new Date();
    const centuryChar = packed[0];
    const yearStr = packed.substring(1, 3);
    const monthChar = packed[3];
    const dayChar = packed[4];

    let century = 2000;
    if (centuryChar === 'I') century = 1800;
    else if (centuryChar === 'J') century = 1900;
    else if (centuryChar === 'K') century = 2000;

    const year = century + parseInt(yearStr, 10);

    const decodeBase31 = (char: string): number => {
        const code = char.charCodeAt(0);
        if (code >= 48 && code <= 57) {
            // '0'-'9'
            return code - 48;
        }
        if (code >= 65 && code <= 90) {
            // 'A'-'Z'
            return code - 65 + 10;
        }
        if (code >= 97 && code <= 122) {
            // 'a'-'z'
            return code - 97 + 36;
        }
        return 1;
    };

    const month = decodeBase31(monthChar);
    const day = decodeBase31(dayChar);

    return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Propage l'orbite d'un astéroïde depuis son époque et calcule sa magnitude H-G.
 *
 * @param asteroid - Éléments orbitaux de l'astéroïde.
 * @param jd - Jour julien de la date de calcul.
 * @param sun - Position du Soleil à cette date (`sunEcliptic(jd)`).
 * @returns La position calculée de l'astéroïde et celle de la Terre.
 */
export function calculateAsteroidPosition(
    asteroid: AsteroidElements,
    jd: number,
    sun: SunEclipticPosition,
): SmallBodyPosition {
    const jdEpoch = julianDate(parsePackedDate(asteroid.epoch));
    const tDays = jd - jdEpoch;

    // Propagation de l'anomalie moyenne (M)
    let M = asteroid.m + asteroid.n * tDays;
    M = ((M % 360) + 360) % 360;
    const M_rad = M * DEG;

    const e = asteroid.e;
    const E = solveKeplerElliptic(M_rad, e);
    const nu = trueAnomalyFromEccentric(E, e);
    const r = asteroid.a * (1 - e * Math.cos(E));

    const heliocentric = orbitalPlaneToEcliptic(r * Math.cos(nu), r * Math.sin(nu), asteroid);
    const { ra, dec, delta } = heliocentricToEquatorial(heliocentric, sun);

    const x_earth = -sun.x;
    const y_earth = -sun.y;
    const earthSunDistance = Math.sqrt(x_earth * x_earth + y_earth * y_earth);

    return {
        ra,
        dec,
        r,
        delta,
        apparentMag: asteroidApparentMagnitude(asteroid.h, asteroid.g, r, delta, earthSunDistance),
        x_hel: heliocentric.x,
        y_hel: heliocentric.y,
        x_earth,
        y_earth,
    };
}

/**
 * Points de l'orbite d'une comète projetée sur l'écliptique, pour le tracé SVG.
 *
 * Parcourt toute la plage d'anomalie vraie accessible (jusqu'à l'asymptote pour une
 * hyperbole) et ignore les points au-delà de 1000 UA.
 *
 * @param comet - q, e et orientation de l'orbite.
 * @param steps - Nombre d'intervalles d'échantillonnage (200 par défaut).
 * @returns Les points héliocentriques écliptiques (UA).
 */
export function cometOrbitPath(
    comet: Pick<CometElements, 'q' | 'e' | 'omega' | 'node' | 'inclination'>,
    steps = 200,
): EclipticPoint[] {
    const pts: EclipticPoint[] = [];
    const e = comet.e;
    const q = comet.q;

    // Limite angulaire : pour une hyperbole/parabole, l'asymptote est à acos(-1/e)
    const nuLimit = e >= 1.0 ? Math.acos(-1 / Math.max(1.0001, e)) - 0.01 : Math.PI;

    for (let i = 0; i <= steps; i++) {
        const nu = -nuLimit + (i / steps) * (2 * nuLimit);
        const r_orb = (q * (1 + e)) / (1 + e * Math.cos(nu));
        // Ignore les points astronomiquement éloignés (aphélies à > 1000 UA)
        if (!isFinite(r_orb) || r_orb > 1000) continue;
        const { x, y } = orbitalPlaneToEcliptic(r_orb * Math.cos(nu), r_orb * Math.sin(nu), comet);
        pts.push({ x, y });
    }
    return pts;
}

/**
 * Points de l'orbite (fermée) d'un astéroïde projetée sur l'écliptique.
 *
 * @param asteroid - a, e et orientation de l'orbite.
 * @param steps - Nombre d'intervalles sur 360° d'anomalie moyenne (120 par défaut).
 * @returns Les points héliocentriques écliptiques (UA).
 */
export function asteroidOrbitPath(
    asteroid: Pick<AsteroidElements, 'a' | 'e' | 'omega' | 'node' | 'inclination'>,
    steps = 120,
): EclipticPoint[] {
    const pts: EclipticPoint[] = [];
    const e = asteroid.e;
    const a = asteroid.a;

    for (let i = 0; i <= steps; i++) {
        const M_rad = (i / steps) * 360 * DEG;
        // POURQUOI : 10 itérations suffisent au tracé (le calcul de position en utilise 15).
        const E = solveKeplerElliptic(M_rad, e, 10);
        const nu = trueAnomalyFromEccentric(E, e);
        const r_orb = a * (1 - e * Math.cos(E));
        const { x, y } = orbitalPlaneToEcliptic(r_orb * Math.cos(nu), r_orb * Math.sin(nu), asteroid);
        pts.push({ x, y });
    }
    return pts;
}

/** Éléments orbitaux simplifiés d'une planète (J2000). */
export interface PlanetElements {
    name: string;
    abbr: string;
    /** Demi-grand axe (UA). */
    a: number;
    e: number;
    /** Longitude moyenne à J2000 (degrés). */
    L0: number;
    periodDays: number;
    /** Longitude du périhélie ϖ (degrés). */
    varpi: number;
    /** Couleur du point et de l'orbite dans le simulateur SVG. */
    color: string;
}

/** Paramètres orbitaux des planètes du système solaire (J2000), de Mercure à Neptune. */
export const SOLAR_SYSTEM_PLANETS: readonly PlanetElements[] = [
    {
        name: 'Mercure',
        abbr: 'mercury',
        a: 0.3871,
        e: 0.2056,
        L0: 252.2508,
        periodDays: 87.969,
        varpi: 77.456,
        color: '#9ca3af',
    },
    {
        name: 'Vénus',
        abbr: 'venus',
        a: 0.7233,
        e: 0.0068,
        L0: 181.9797,
        periodDays: 224.701,
        varpi: 131.533,
        color: '#fef08a',
    },
    {
        name: 'Terre',
        abbr: 'earth',
        a: 1.0,
        e: 0.0167,
        L0: 100.4643,
        periodDays: 365.256,
        varpi: 102.947,
        color: '#3b82f6',
    },
    {
        name: 'Mars',
        abbr: 'mars',
        a: 1.5237,
        e: 0.0934,
        L0: 355.4533,
        periodDays: 686.98,
        varpi: 336.041,
        color: '#f87171',
    },
    {
        name: 'Jupiter',
        abbr: 'jupiter',
        a: 5.2034,
        e: 0.0484,
        L0: 34.4044,
        periodDays: 4332.589,
        varpi: 14.754,
        color: '#fb923c',
    },
    {
        name: 'Saturne',
        abbr: 'saturn',
        a: 9.5371,
        e: 0.0542,
        L0: 49.9443,
        periodDays: 10759.22,
        varpi: 92.432,
        color: '#eab308',
    },
    {
        name: 'Uranus',
        abbr: 'uranus',
        a: 19.1913,
        e: 0.0472,
        L0: 313.2322,
        periodDays: 30685.4,
        varpi: 170.964,
        color: '#22d3ee',
    },
    {
        name: 'Neptune',
        abbr: 'neptune',
        a: 30.069,
        e: 0.0086,
        L0: 304.88,
        periodDays: 60189.0,
        varpi: 44.971,
        color: '#818cf8',
    },
];

/** Planètes du simulateur des comètes : les huit planètes (orbites jusqu'à ~30 UA). */
export const COMET_SIMULATOR_PLANETS: readonly PlanetElements[] = SOLAR_SYSTEM_PLANETS;

/** Planètes du simulateur des astéroïdes : de Mercure à Jupiter seulement. */
export const ASTEROID_SIMULATOR_PLANETS: readonly PlanetElements[] = SOLAR_SYSTEM_PLANETS.slice(0, 5);

/**
 * Position héliocentrique écliptique approchée d'une planète (équation du centre au 1er ordre).
 *
 * @param planet - Éléments orbitaux de la planète.
 * @param daysSinceJ2000 - Jours écoulés depuis J2000.0.
 * @returns Les coordonnées `x`, `y` (UA) dans le plan de l'écliptique.
 */
export function planetHeliocentricPosition(planet: PlanetElements, daysSinceJ2000: number): EclipticPoint {
    let M_L = planet.L0 + (360.0 / planet.periodDays) * daysSinceJ2000;
    M_L = ((M_L % 360) + 360) % 360;

    const meanAnomalyRad = (M_L - planet.varpi) * DEG;
    const lambdaRad = (M_L + (2 * planet.e * Math.sin(meanAnomalyRad) * 180) / Math.PI) * DEG;

    const r = (planet.a * (1 - planet.e * planet.e)) / (1 + planet.e * Math.cos(meanAnomalyRad));

    return { x: r * Math.cos(lambdaRad), y: r * Math.sin(lambdaRad) };
}

/**
 * Points de l'ellipse orbitale d'une planète, échantillonnée en anomalie excentrique.
 *
 * @param planet - Éléments orbitaux de la planète.
 * @param steps - Nombre d'intervalles (60 par défaut).
 * @returns Les points héliocentriques écliptiques (UA), le premier et le dernier confondus.
 */
export function planetOrbitEllipse(planet: PlanetElements, steps = 60): EclipticPoint[] {
    const pts: EclipticPoint[] = [];
    const a = planet.a;
    const e = planet.e;
    const varpi = planet.varpi * DEG;

    for (let i = 0; i <= steps; i++) {
        const E = (i / steps) * 2 * Math.PI;
        const x_op = a * (Math.cos(E) - e);
        const y_op = a * Math.sqrt(1 - e * e) * Math.sin(E);
        pts.push({
            x: x_op * Math.cos(varpi) - y_op * Math.sin(varpi),
            y: x_op * Math.sin(varpi) + y_op * Math.cos(varpi),
        });
    }
    return pts;
}

/**
 * Construit l'attribut `d` d'un chemin SVG polyligne (coordonnées arrondies au dixième).
 *
 * @param points - Points en pixels SVG.
 * @returns La chaîne `M x y L x y …`, vide si aucun point.
 */
export function toSvgPathData(points: readonly { cx: number; cy: number }[]): string {
    return points.map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.cx.toFixed(1)} ${pt.cy.toFixed(1)}`).join(' ');
}
