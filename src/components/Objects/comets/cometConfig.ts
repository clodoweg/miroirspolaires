/**
 * Types et configuration du visualiseur de comètes
 *
 * Responsabilité : forme des données de `/api/comets`, colonnes triables, champs de plage
 * de la barre de filtres avancés et puces de filtres actifs.
 */

import type { CometElements, SmallBodyPosition } from '@/lib/objects/orbits';
import type { SmallBodyObservation } from '@/lib/objects/small-bodies';
import type { RangeFilterChip, RangeFilterField } from '../small-bodies/RangeFilters';
import { SORT_BUTTON_LEFT_CLASS, SORT_BUTTON_RIGHT_CLASS, type SortColumn } from '../small-bodies/SmallBodyTable';

/** Comète telle que renvoyée par `/api/comets`. */
export interface Comet extends CometElements {
    /** Désignation compacte pour l'affichage (ex. « 0001P » ou « CJ95O010 »). */
    id: string;
    /** Identifiant unique et stable pour le rendu et l'état local. */
    uniqueId: string;
    name: string;
    epochStr: string;
    ref: string;
}

/** Comète enrichie de sa position et de ses données d'observation à la date choisie. */
export interface CalculatedComet extends Comet, SmallBodyObservation {
    orbit: SmallBodyPosition;
    score: number;
}

/** Colonnes triables du tableau des comètes. */
export type CometSortColumn = 'name' | 'score' | 'type' | 'mag' | 'r' | 'delta' | 'visibility' | 'compatibility';

/** Filtre de type d'orbite. */
export type CometTypeFilter = 'all' | 'periodic' | 'non_periodic';

/** Options du filtre de type d'orbite. */
export const COMET_TYPE_OPTIONS: { value: CometTypeFilter; label: string }[] = [
    { value: 'all', label: 'Tous' },
    { value: 'periodic', label: 'Périodique (e < 0.9)' },
    { value: 'non_periodic', label: 'Non-périodique (e ≥ 0.9)' },
];

/** Clés des bornes des filtres de plage. */
export type CometRangeKey =
    | 'minApparentMag'
    | 'maxApparentMag'
    | 'minInclination'
    | 'maxInclination'
    | 'minPerihelion'
    | 'maxPerihelion'
    | 'minDelta'
    | 'maxDelta'
    | 'minEccentricity'
    | 'maxEccentricity'
    | 'minScore'
    | 'maxScore';

/** Champs de plage, dans l'ordre d'affichage. */
export const COMET_RANGE_FIELDS: readonly RangeFilterField<CometRangeKey>[] = [
    { label: 'Magnitude Apparente V (min-max)', minKey: 'minApparentMag', maxKey: 'maxApparentMag', step: '0.5' },
    {
        label: 'Dist. Soleil r / Périhélie q (UA min-max)',
        minKey: 'minPerihelion',
        maxKey: 'maxPerihelion',
        step: '0.1',
    },
    { label: 'Dist. Terre Δ (UA min-max)', minKey: 'minDelta', maxKey: 'maxDelta', step: '0.1' },
    { label: 'Inclinaison (° min-max)', minKey: 'minInclination', maxKey: 'maxInclination' },
    { label: 'Excentricité e (min-max)', minKey: 'minEccentricity', maxKey: 'maxEccentricity', step: '0.05' },
    { label: 'Score (0-100 min-max)', minKey: 'minScore', maxKey: 'maxScore', min: '0', max: '100' },
];

/** Puces des bornes renseignées, dans l'ordre d'affichage des filtres actifs. */
export const COMET_RANGE_CHIPS: readonly RangeFilterChip<CometRangeKey>[] = [
    { key: 'minApparentMag', label: 'Mag Min', suffix: ' V' },
    { key: 'maxApparentMag', label: 'Mag Max', suffix: ' V' },
    { key: 'minInclination', label: 'Inclinaison Min', suffix: '°' },
    { key: 'maxInclination', label: 'Inclinaison Max', suffix: '°' },
    { key: 'minPerihelion', label: 'Périhélie Min', suffix: ' UA' },
    { key: 'maxPerihelion', label: 'Périhélie Max', suffix: ' UA' },
    { key: 'minDelta', label: 'Dist. Terre Min', suffix: ' UA' },
    { key: 'maxDelta', label: 'Dist. Terre Max', suffix: ' UA' },
    { key: 'minEccentricity', label: 'Excentricité Min', suffix: '' },
    { key: 'maxEccentricity', label: 'Excentricité Max', suffix: '' },
    { key: 'minScore', label: 'Score Min', suffix: '' },
    { key: 'maxScore', label: 'Score Max', suffix: '' },
];

/** Colonnes de l'en-tête du tableau. */
export const COMET_COLUMNS: readonly SortColumn<CometSortColumn>[] = [
    {
        key: 'name',
        label: 'Désignation / Nom',
        className:
            'flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-left font-semibold transition-colors hover:text-mp-text-primary',
    },
    {
        key: 'type',
        label: 'Type',
        title: "Type d'orbite de la comète (Périodique e < 0.9 ou Non-périodique / Parabolique e >= 0.9).",
        className: SORT_BUTTON_LEFT_CLASS,
    },
    { key: 'mag', label: 'Mag', className: SORT_BUTTON_RIGHT_CLASS },
    { key: 'r', label: 'Dist. Soleil (r)', className: SORT_BUTTON_RIGHT_CLASS },
    { key: 'delta', label: 'Dist. Terre (Δ)', className: SORT_BUTTON_RIGHT_CLASS },
    { key: 'visibility', label: 'Visibilité', className: SORT_BUTTON_LEFT_CLASS },
    {
        key: 'compatibility',
        label: 'Faisabilité',
        title: 'Combinaison de la visibilité céleste ce soir et de la capacité de votre instrument (diamètre / capteur).',
        className: SORT_BUTTON_LEFT_CLASS,
    },
    {
        key: 'score',
        label: 'Score',
        title: 'Le score (0-100) dépend de la faisabilité instrumentale, la hauteur/durée de visibilité nocturne, la magnitude apparente et la proximité au Soleil/Terre.',
        className: SORT_BUTTON_RIGHT_CLASS,
    },
];

/** Infobulle du score dans les lignes. */
export const COMET_SCORE_TITLE =
    'Score (0-100) : Faisabilité instrumentale x (Visibilité nocturne >30° + Éclat en magnitude apparente + Proximité au Soleil/Terre).';
