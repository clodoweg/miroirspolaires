/**
 * Temps astronomique et constantes d'angle partagés
 *
 * Responsabilité : conversions Date ↔ jour julien et constante degrés → radians, utilisées par
 * `src/lib/objects/observation.ts` et les visualiseurs d'objets (comètes, astéroïdes, étoiles
 * variables, exoplanètes), qui en recopiaient chacun leur version.
 */

/** Facteur de conversion degrés → radians. */
export const DEG = Math.PI / 180;

/** Jour julien de l'époque Unix (1970-01-01T00:00:00Z). */
export const JULIAN_DAY_UNIX_EPOCH = 2440587.5;

const MS_PER_DAY = 86_400_000;

/**
 * Jour julien d'une date.
 *
 * @param date - Instant UTC.
 * @returns Le jour julien (fractionnaire).
 */
export function julianDate(date: Date): number {
    return date.getTime() / MS_PER_DAY + JULIAN_DAY_UNIX_EPOCH;
}

/**
 * Date correspondant à un jour julien.
 *
 * @param julianDay - Jour julien (fractionnaire).
 * @returns L'instant UTC.
 */
export function dateFromJulian(julianDay: number): Date {
    return new Date((julianDay - JULIAN_DAY_UNIX_EPOCH) * MS_PER_DAY);
}
