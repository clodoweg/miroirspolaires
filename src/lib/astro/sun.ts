/**
 * Position approchée du Soleil (algorithme simplifié de Meeus)
 *
 * Responsabilité : coordonnées écliptiques rectangulaires héliocentriques de la Terre,
 * utilisées par les simulateurs d'orbites des comètes et des astéroïdes.
 */

import { DEG } from './time';

/**
 * Position du Soleil vue de la Terre, en coordonnées écliptiques rectangulaires (UA).
 *
 * @param julianDay - Jour julien.
 * @returns `x`, `y`, `z` (UA) et l'obliquité de l'écliptique `epsilon` (radians).
 */
export function sunEcliptic(julianDay: number): { x: number; y: number; z: number; epsilon: number } {
    const n = julianDay - 2451545.0;
    const meanLongitude = (((280.46 + 0.9856474 * n) % 360) + 360) % 360;
    const meanAnomaly = ((((357.528 + 0.9856003 * n) % 360) + 360) % 360) * DEG;
    const lambda = (meanLongitude + 1.915 * Math.sin(meanAnomaly) + 0.02 * Math.sin(2 * meanAnomaly)) * DEG;
    const epsilon = (23.439 - 0.0000004 * n) * DEG;
    const distance = 1.00014 - 0.01671 * Math.cos(meanAnomaly) - 0.00014 * Math.cos(2 * meanAnomaly);

    return { x: distance * Math.cos(lambda), y: distance * Math.sin(lambda), z: 0, epsilon };
}
