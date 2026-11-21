/**
 * Types et configuration du visualiseur d'astéroïdes
 *
 * Responsabilité : forme des données de `/api/asteroids`, colonnes triables, champs de plage
 * de la barre de filtres avancés et puces de filtres actifs.
 */

import type { AsteroidElements, SmallBodyPosition } from '@/lib/objects/orbits';
import type { AsteroidTypeFilter, SmallBodyObservation } from '@/lib/objects/small-bodies';
import type { RangeFilterChip, RangeFilterField } from '../small-bodies/RangeFilters';
import { SORT_BUTTON_LEFT_CLASS, SORT_BUTTON_RIGHT_CLASS, type SortColumn } from '../small-bodies/SmallBodyTable';

/** Astéroïde tel que renvoyé par `/api/asteroids`. */
export interface Asteroid extends AsteroidElements {
    /** Désignation compacte (ex. « 01566 » ou « K07T00F »). */
    id: string;
    /** Identifiant unique stable. */
    uniqueId: string;
    /** Désignation lisible (ex. « (1566) Icarus » ou « 2007 TF »). */
    name: string;
    ref: string;
}

/** Astéroïde enrichi de sa position et de ses données d'observation à la date choisie. */
export interface CalculatedAsteroid extends Asteroid, SmallBodyObservation {
    orbit: SmallBodyPosition;
    score: number;
}

/** Colonnes triables du tableau des astéroïdes. */
export type AsteroidSortColumn = 'name' | 'score' | 'type' | 'mag' | 'a' | 'e' | 'visibility' | 'compatibility';

/** Filtre rapide (sans interface, réinitialisé avec les autres filtres). */
export type AsteroidQuickFilter = 'all' | 'nea' | 'distant';

/** Options du filtre de type. */
export const ASTEROID_TYPE_OPTIONS: { value: AsteroidTypeFilter; label: string }[] = [
    { value: 'all', label: 'Tous' },
    { value: 'pha', label: 'Potentiellement Dangereux (PHA)' },
    { value: 'nea', label: 'Géocroiseur (NEA)' },
    { value: 'distant', label: 'Distant (Jupiter/Centaure)' },
    { value: 'inhabituel', label: 'Inhabituel' },
];

/** Libellés courts du filtre de type dans les puces de filtres actifs. */
export const ASTEROID_TYPE_CHIP_LABELS: { value: AsteroidTypeFilter; label: string }[] = [
    { value: 'pha', label: 'PHA (Dangereux)' },
    { value: 'nea', label: 'NEA (Géocroiseur)' },
    { value: 'distant', label: 'Distant' },
    { value: 'inhabituel', label: 'Inhabituel' },
];

/** Clés des bornes des filtres de plage. */
export type AsteroidRangeKey =
    | 'minApparentMag'
    | 'maxApparentMag'
    | 'minInclination'
    | 'maxInclination'
    | 'minEccentricity'
    | 'maxEccentricity'
    | 'minSemiMajor'
    | 'maxSemiMajor'
    | 'minScore'
    | 'maxScore';

/** Champs de plage, dans l'ordre d'affichage. */
export const ASTEROID_RANGE_FIELDS: readonly RangeFilterField<AsteroidRangeKey>[] = [
    { label: 'Magnitude (V min-max)', minKey: 'minApparentMag', maxKey: 'maxApparentMag', step: '0.5' },
    { label: 'Inclinaison (° min-max)', minKey: 'minInclination', maxKey: 'maxInclination' },
    { label: 'Excentricité e (min-max)', minKey: 'minEccentricity', maxKey: 'maxEccentricity', step: '0.05' },
    { label: 'Grand axe a (UA min-max)', minKey: 'minSemiMajor', maxKey: 'maxSemiMajor', step: '0.1' },
    { label: 'Score (0-100 min-max)', minKey: 'minScore', maxKey: 'maxScore', min: '0', max: '100' },
];

/** Puces des bornes renseignées, dans l'ordre d'affichage des filtres actifs. */
export const ASTEROID_RANGE_CHIPS: readonly RangeFilterChip<AsteroidRangeKey>[] = [
    { key: 'minApparentMag', label: 'Mag Min', suffix: ' V' },
    { key: 'maxApparentMag', label: 'Mag Max', suffix: ' V' },
    { key: 'minInclination', label: 'Inclinaison Min', suffix: '°' },
    { key: 'maxInclination', label: 'Inclinaison Max', suffix: '°' },
    { key: 'minEccentricity', label: 'Excentricité Min', suffix: '' },
    { key: 'maxEccentricity', label: 'Excentricité Max', suffix: '' },
    { key: 'minSemiMajor', label: 'Grand axe Min', suffix: ' UA' },
    { key: 'maxSemiMajor', label: 'Grand axe Max', suffix: ' UA' },
    { key: 'minScore', label: 'Score Min', suffix: '' },
    { key: 'maxScore', label: 'Score Max', suffix: '' },
];

/** Colonnes de l'en-tête du tableau. */
export const ASTEROID_COLUMNS: readonly SortColumn<AsteroidSortColumn>[] = [
    {
        key: 'name',
        label: 'Désignation / Nom',
        className:
            'flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-left font-semibold text-mp-text-muted transition-colors hover:text-mp-text-primary',
    },
    {
        key: 'type',
        label: 'Type',
        title: 'Classification de la trajectoire et de la proximité (PHA = Potentiellement Dangereux, NEA = Géocroiseur, Distant = Troïen/Centaure).',
        className: SORT_BUTTON_LEFT_CLASS,
    },
    { key: 'mag', label: 'Mag', className: SORT_BUTTON_RIGHT_CLASS },
    { key: 'a', label: 'Grand axe (a)', className: SORT_BUTTON_RIGHT_CLASS },
    { key: 'e', label: 'Excentricité (e)', className: SORT_BUTTON_RIGHT_CLASS },
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
        title: "Le score (0-100) dépend de la faisabilité instrumentale, la durée de visibilité haute (>30°), l'éclat (magnitude apparente) et l'intérêt orbital (NEA/PHA).",
        className: SORT_BUTTON_RIGHT_CLASS,
    },
];

/** Infobulle du score dans les lignes. */
export const ASTEROID_SCORE_TITLE =
    "Le score (0-100) dépend de la faisabilité instrumentale, la durée de visibilité haute (>30°), l'éclat et l'intérêt orbital.";
