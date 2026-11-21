/**
 * Types partagés pour les composants de filtrage.
 * Source unique de vérité pour éviter la duplication des interfaces.
 */

/**
 * Configuration d'un filtre individuel.
 */
export interface FilterConfig {
    /** Clé unique du filtre (ex: 'year', 'constellation') */
    key: string;
    /** Label affiché dans l'UI (ex: 'Année', 'Constellation') */
    label: string;
    /** Options disponibles pour ce filtre */
    options: (string | number)[];
    /** Type de filtre. 'select' = égalité stricte ; 'numericMax' = la valeur
     *  est interprétée comme un seuil supérieur (photo[key] <= Number(value)). */
    type?: 'select' | 'numericMax';
    /** Valeur appliquée par défaut quand l'URL n'en porte pas. */
    defaultValue?: string;
}

/**
 * Configuration pour les statistiques supplémentaires.
 */
export interface StatUpdateConfig {
    /** ID de l'élément DOM à mettre à jour */
    elementId: string;
    /** Attribut data- à utiliser (ex: 'constellation') */
    dataAttribute: string;
    /** Type de calcul: count unique, range (min-max), sum */
    type: 'count' | 'range' | 'sum';
}

/**
 * Chip représentant un filtre actif.
 */
export interface ActiveFilterChip {
    key: string;
    label: string;
    value: string | undefined;
}

/**
 * Suggestion d'autocomplétion.
 */
export interface FilterSuggestion {
    key: string;
    label: string;
    value: string;
}
