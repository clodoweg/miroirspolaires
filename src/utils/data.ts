/**
 * Data manipulation utilities
 */

/**
 * Normalise une valeur pays (string ou array) en array.
 * Utilisé pour les voyages qui peuvent avoir un ou plusieurs pays.
 */
export function normalizeCountries(country: string | string[] | undefined): string[] {
    if (!country) return ['Inconnu'];
    return Array.isArray(country) ? country : [country];
}
