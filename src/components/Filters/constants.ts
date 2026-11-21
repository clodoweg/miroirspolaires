/**
 * @file src/components/Filters/constants.ts
 * @description Source Unique de Vérité (SSOT) pour les styles et constantes des filtres d'objets célestes.
 *
 * POURQUOI : Garantit une cohérence visuelle parfaite entre tous les viewers d'objets
 * (CatalogueViewer, AsteroidsViewer, CometsViewer, ExoplanetViewer, VariableStarsViewer, RecommendationsViewer)
 * tout en évitant la duplication de chaînes de classes Tailwind.
 */

/** Style standard pour les étiquettes (labels) dans les panneaux de filtres */
export const FILTER_LABEL_CLASS = 'block text-xs mb-1 font-medium meta-label text-mp-text-muted/90';

/** Style standard pour les champs de saisie (inputs) dans les panneaux de filtres */
export const FILTER_INPUT_CLASS =
    'w-full px-3 py-2 text-sm rounded-lg bg-mp-bg border border-mp-border-light text-mp-text-heading focus:border-mp-accent focus:ring-1 focus:ring-mp-accent focus:outline-hidden placeholder:text-mp-text-muted/60 transition-colors';
