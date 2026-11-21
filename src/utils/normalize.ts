/**
 * Fonctions de normalisation pour la recherche et le filtrage.
 * Centralise la logique DRY utilisée dans les barres de filtres.
 */

/**
 * Normalise les références de catalogue astronomique et supprime les accents.
 *
 * - Supprime tous les accents (é → e, à → a, etc.)
 * - Ajoute un espace entre les préfixes de catalogue et les numéros (NGC765 → NGC 765)
 *
 * @example
 * normalizeCatalog("NGC765") // "NGC 765"
 * normalizeCatalog("Nébuleuse") // "Nebuleuse"
 * normalizeCatalog("IC 123") // "IC 123" (inchangé)
 */
export function normalizeCatalog(str: string): string {
    return stripAccents(str).replace(/\b(NGC|IC|SH2|M)(\d)/gi, '$1 $2'); // Ajoute espace avant le numéro
}

/**
 * Normalise une chaîne pour la comparaison de recherche.
 * Applique normalizeCatalog puis supprime tous les espaces.
 *
 * @example
 * normalizeForSearch("NGC 765") // "NGC765" (après normalisation catalogue, sans espaces)
 */
export function normalizeForSearch(str: string): string {
    return normalizeCatalog(str.toLowerCase()).replace(/\s+/g, '');
}

/**
 * Supprime les accents et autres diacritiques (é → e, ç → c), sans changer la casse.
 *
 * @param str - Texte à nettoyer.
 * @returns Le texte sans diacritiques.
 */
export function stripAccents(str: string): string {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Passe en minuscules et supprime les accents : forme de comparaison des recherches.
 *
 * @param str - Texte à comparer.
 * @returns Le texte en minuscules, sans diacritiques (pas de trim).
 */
export function foldAccents(str: string): string {
    return stripAccents(str.toLowerCase());
}

/**
 * Transforme un titre en slug d'URL : minuscules sans accents, séparateurs `-`.
 *
 * @param title - Titre ou nom à convertir.
 * @returns Le slug (« Nébuleuse d'Orion » → « nebuleuse-d-orion »).
 */
export function slugify(title: string): string {
    return foldAccents(title)
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
}
