/**
 * Quantification des paramètres de /api/recommendations
 *
 * Responsabilité : arrondir lieu et date avant l'appel (client) et avant le calcul (serveur), pour
 * que des requêtes équivalentes partagent la même clé de cache CDN. Une date à la milliseconde ou
 * des coordonnées à 6 décimales créaient une nouvelle entrée de cache à chaque visite.
 */

/** Précision des coordonnées : 0,01° ≈ 1 km, sans effet sur les hauteurs d'objets du ciel profond. */
const COORDINATE_DECIMALS = 2;
const MS_PER_HOUR = 3_600_000;

/**
 * Arrondit une latitude ou une longitude au centième de degré.
 *
 * @param degrees - Coordonnée en degrés.
 * @returns La coordonnée arrondie.
 */
export function quantizeCoordinate(degrees: number): number {
    const factor = 10 ** COORDINATE_DECIMALS;
    return Math.round(degrees * factor) / factor;
}

/**
 * Ramène une date au début de son heure UTC.
 *
 * @param date - Instant demandé.
 * @returns L'instant tronqué à l'heure.
 */
export function quantizeDateToHour(date: Date): Date {
    return new Date(Math.floor(date.getTime() / MS_PER_HOUR) * MS_PER_HOUR);
}

/**
 * Politique de cache partagée par la page et l'API de recommandations.
 *
 * @param isPoolComplete - False si des catalogues manquaient pendant le calcul.
 * @returns La valeur de l'en-tête Cache-Control.
 */
export function recommendationsCacheControl(isPoolComplete: boolean): string {
    // POURQUOI : pendant une panne du CDS, une liste partielle mise en cache 24 h survivrait au retour du service.
    return isPoolComplete
        ? 'public, max-age=1800, s-maxage=86400, stale-while-revalidate=604800'
        : 'public, max-age=60, s-maxage=300';
}
