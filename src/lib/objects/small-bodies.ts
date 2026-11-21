/**
 * Logique d'observation, de filtrage et de tri commune aux comètes et aux astéroïdes
 *
 * Responsabilité : fonctions pures utilisées par `CometsViewer` et `AsteroidsViewer` :
 * faisabilité selon l'instrument, statut de visibilité nocturne, filtres (texte, plages
 * numériques, visibilité, faisabilité, constellation), tri des colonnes et
 * classification dynamique des astéroïdes (PHA, NEA, distant, inhabituel).
 */

import { constellationFromCoords } from '@/lib/constellation-from-coords';
import { observability, type Observability, type ObsLocation } from '@/lib/objects/observation';
import { foldAccents } from '@/utils/normalize';

/** Verdict de faisabilité affiché. */
export type FeasibilityLabel = 'Gérable' | 'Délicat' | 'Inobservable' | 'Setup insuffisant';

/** Code du verdict de faisabilité (valeur des filtres). */
export type FeasibilityStatus = 'gerable' | 'delicat' | 'inobservable' | 'hors_portee';

/** Verdict de faisabilité d'une cible pour l'instrument de l'utilisateur. */
export interface FeasibilityEvaluation {
    label: FeasibilityLabel;
    /** Classes Tailwind du badge. */
    color: string;
    status: FeasibilityStatus;
}

/**
 * Évalue la faisabilité d'une observation selon l'éclat de la cible, sa hauteur et l'instrument.
 *
 * @param apparentMag - Magnitude apparente de la cible.
 * @param maxAlt - Hauteur maximale pendant la nuit (degrés), `undefined` si jamais levée.
 * @param limitMag - Magnitude limite visuelle de l'instrument.
 * @param limitMagPhoto - Magnitude limite photographique de l'instrument.
 * @returns Le verdict (libellé, classes du badge, code de filtre).
 */
export function evaluateSetupFeasibility(
    apparentMag: number,
    maxAlt: number | undefined,
    limitMag: number,
    limitMagPhoto: number,
): FeasibilityEvaluation {
    if (maxAlt === undefined || maxAlt < 10) {
        return {
            label: 'Inobservable',
            color: 'text-red-400 border-red-500/20 bg-red-500/5',
            status: 'inobservable',
        };
    }
    if (apparentMag > limitMagPhoto) {
        return {
            label: 'Setup insuffisant',
            color: 'text-orange-400/80 border-orange-500/20 bg-orange-500/5',
            status: 'hors_portee',
        };
    }
    if (apparentMag > limitMag - 1.5 || maxAlt < 30) {
        return {
            label: 'Délicat',
            color: 'text-yellow-400/80 border-yellow-500/20 bg-yellow-500/5',
            status: 'delicat',
        };
    }
    return {
        label: 'Gérable',
        color: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5',
        status: 'gerable',
    };
}

/**
 * Infobulle explicative d'un verdict de faisabilité.
 *
 * @param status - Code du verdict.
 * @returns Le texte de l'attribut `title`.
 */
export function feasibilityTitle(status: FeasibilityStatus): string {
    return status === 'gerable'
        ? 'Gérable : Cible bien visible ce soir (hauteur > 30°) et parfaitement adaptée à votre matériel.'
        : status === 'delicat'
          ? "Délicat : Cible basse (< 30°) ou proche de la limite d'ouverture / magnitude de votre instrument."
          : status === 'inobservable'
            ? "Inobservable : Cible sous l'horizon ou n'atteignant pas une hauteur suffisante ce soir."
            : "Setup insuffisant : Magnitude trop faible ou diamètre d'instrument insuffisant pour cette cible.";
}

/** Statut de visibilité nocturne affiché dans les lignes du tableau. */
export interface VisibilityStatus {
    statusLabel: string;
    /** Classe Tailwind de couleur du texte. */
    statusColor: string;
}

/**
 * Statut de visibilité nocturne d'une cible.
 *
 * @param isCircumpolar - Vrai si la cible ne se couche jamais.
 * @param maxAltNight - Hauteur maximale pendant la nuit (degrés).
 * @param hoursVisible - Heures passées au-dessus de 30° pendant la nuit.
 * @returns Libellé (Circumpolaire, Observable, Basse, Invisible) et couleur.
 */
export function getVisibilityStatus(
    isCircumpolar: boolean,
    maxAltNight: number | undefined,
    hoursVisible: number,
): VisibilityStatus {
    if (isCircumpolar) return { statusLabel: 'Circumpolaire', statusColor: 'text-sky-400' };
    if (maxAltNight !== undefined && maxAltNight >= 10) {
        // POURQUOI: Une cible est considérée comme 'Basse' si sa hauteur maximale durant la nuit
        // est de 10° ou plus (mais sans atteindre les 30° d'utilité optimale requis pour incrémenter hoursVisible).
        if (maxAltNight >= 30 && hoursVisible > 0) {
            return { statusLabel: 'Observable', statusColor: 'text-emerald-400' };
        }
        return { statusLabel: 'Basse', statusColor: 'text-yellow-400/80' };
    }
    return { statusLabel: 'Invisible', statusColor: 'text-mp-text-muted' };
}

/** Données d'observation d'un petit corps pour l'observatoire et la date choisis. */
export interface SmallBodyObservation extends VisibilityStatus {
    /** Code IAU de la constellation, `Unknown` si introuvable. */
    constellation: string;
    obs: Observability;
    currentAlt: number;
    maxAltNight: number | undefined;
    hoursVisible: number;
    feasibility: FeasibilityEvaluation;
}

/**
 * Calcule visibilité, constellation et faisabilité d'un petit corps à partir de sa position.
 *
 * @param position - Ascension droite, déclinaison (degrés) et magnitude apparente.
 * @param location - Observatoire.
 * @param date - Date d'observation.
 * @param limits - Magnitudes limites visuelle et photographique de l'instrument.
 * @returns Les données d'observation affichées dans le tableau.
 */
export function observeSmallBody(
    position: { ra: number; dec: number; apparentMag: number },
    location: ObsLocation,
    date: Date,
    limits: { limitMag: number; limitMagPhoto: number },
): SmallBodyObservation {
    const obs = observability(position.ra, position.dec, location, date);
    const constellation = constellationFromCoords(position.ra, position.dec) || 'Unknown';

    const maxAltNight = obs.riseSet.maxAltAtNightDeg;
    const hoursVisible = obs.riseSet.hoursAboveHorizonAtNight || 0;
    const { statusLabel, statusColor } = getVisibilityStatus(obs.tag === 'circumpolaire', maxAltNight, hoursVisible);

    return {
        constellation,
        obs,
        currentAlt: obs.nowAltAz.altDeg,
        maxAltNight,
        hoursVisible,
        statusLabel,
        statusColor,
        feasibility: evaluateSetupFeasibility(position.apparentMag, maxAltNight, limits.limitMag, limits.limitMagPhoto),
    };
}

/** Filtre de visibilité nocturne. */
export type VisibilityFilter = 'all' | 'parfaite' | 'observable' | 'basse' | 'invisible';

/** Filtre de faisabilité instrumentale. */
export type CompatibilityFilter = 'all' | FeasibilityStatus;

/** Options du filtre de visibilité (libellés repris par les puces de filtres actifs). */
export const VISIBILITY_FILTER_OPTIONS: { value: VisibilityFilter; label: string }[] = [
    { value: 'all', label: 'Tous' },
    { value: 'parfaite', label: 'Parfaite (>60°)' },
    { value: 'observable', label: 'Observable (>30°)' },
    { value: 'basse', label: 'Très basse (<30°)' },
    { value: 'invisible', label: 'Invisible' },
];

/** Options du filtre de faisabilité. */
export const COMPATIBILITY_FILTER_OPTIONS: { value: CompatibilityFilter; label: string }[] = [
    { value: 'all', label: 'Tous' },
    { value: 'gerable', label: 'Gérable' },
    { value: 'delicat', label: 'Délicat' },
    { value: 'inobservable', label: 'Inobservable' },
    { value: 'hors_portee', label: 'Setup insuffisant' },
];

/**
 * Libellé d'une option, ou la valeur brute si elle est inconnue.
 *
 * @param options - Liste d'options `{ value, label }`.
 * @param value - Valeur sélectionnée.
 * @returns Le libellé correspondant.
 */
export function optionLabel(options: readonly { value: string; label: string }[], value: string): string {
    return options.find((option) => option.value === value)?.label || value;
}

/** Champs communs à tout petit corps calculé, utilisés par les filtres et le tri. */
export interface ObservedSmallBody {
    name: string;
    id: string;
    constellation: string;
    score: number;
    hoursVisible: number;
    maxAltNight: number | undefined;
    feasibility: FeasibilityEvaluation;
    orbit: { apparentMag: number };
}

/**
 * Vrai si la requête désigne exactement ce corps (nom ou désignation, sans espaces ni accents).
 *
 * @param query - Texte recherché (paramètre `q` de l'URL).
 * @param name - Nom lisible du corps.
 * @param id - Désignation compacte MPC.
 * @returns Vrai en cas de correspondance exacte.
 */
export function isExactQueryMatch(query: string, name: string, id: string): boolean {
    const cleanQuery = foldAccents(query).replace(/\s+/g, '').trim();
    return (
        foldAccents(name).replace(/\s+/g, '').trim() === cleanQuery ||
        id.toLowerCase().replace(/\s+/g, '').trim() === cleanQuery
    );
}

/**
 * Filtre textuel : nom, désignation ou nom de constellation contenant la requête.
 *
 * @param items - Corps à filtrer.
 * @param query - Texte saisi.
 * @param getConstellationLabel - Résout le nom français d'un code de constellation.
 * @returns Les corps correspondants (tous si la requête est vide).
 */
export function filterByText<T extends ObservedSmallBody>(
    items: T[],
    query: string,
    getConstellationLabel: (code: string) => string,
): T[] {
    const cleanString = (str: string) => foldAccents(str).trim();
    const qClean = cleanString(query);
    if (!qClean) return items;
    return items.filter(
        (item) =>
            cleanString(item.name).includes(qClean) ||
            cleanString(item.id).includes(qClean) ||
            cleanString(getConstellationLabel(item.constellation)).includes(qClean),
    );
}

/**
 * Applique une borne minimale et une borne maximale saisies en texte.
 *
 * Une borne vide ou non numérique est ignorée.
 *
 * @param items - Corps à filtrer.
 * @param min - Borne minimale saisie.
 * @param max - Borne maximale saisie.
 * @param getValue - Valeur numérique comparée.
 * @returns Les corps dans la plage.
 */
export function filterByRange<T>(items: T[], min: string, max: string, getValue: (item: T) => number): T[] {
    let result = items;
    if (min) {
        const limit = parseFloat(min);
        if (!isNaN(limit)) result = result.filter((item) => getValue(item) >= limit);
    }
    if (max) {
        const limit = parseFloat(max);
        if (!isNaN(limit)) result = result.filter((item) => getValue(item) <= limit);
    }
    return result;
}

/**
 * Filtres rapides : visible ce soir (au-dessus de 30°) et observable avec l'instrument.
 *
 * @param items - Corps à filtrer.
 * @param visibleTonight - Ne garder que les corps visibles cette nuit.
 * @param observableOnly - Exclure les verdicts « Inobservable » et « Setup insuffisant ».
 * @returns Les corps retenus.
 */
export function filterByQuickToggles<T extends ObservedSmallBody>(
    items: T[],
    visibleTonight: boolean,
    observableOnly: boolean,
): T[] {
    let result = items;
    if (visibleTonight) {
        result = result.filter((item) => item.hoursVisible > 0);
    }
    if (observableOnly) {
        result = result.filter(
            (item) => item.feasibility.label !== 'Inobservable' && item.feasibility.label !== 'Setup insuffisant',
        );
    }
    return result;
}

/**
 * Filtres de la barre avancée communs aux deux visualiseurs (visibilité, faisabilité, constellation).
 *
 * @param items - Corps à filtrer.
 * @param visibility - Filtre de visibilité nocturne.
 * @param compatibility - Filtre de faisabilité.
 * @param constellation - Code de constellation, ou `all`.
 * @returns Les corps retenus.
 */
export function filterBySelects<T extends ObservedSmallBody>(
    items: T[],
    visibility: VisibilityFilter,
    compatibility: CompatibilityFilter,
    constellation: string,
): T[] {
    let result = items;
    if ((visibility as string) !== 'all' && (visibility as string) !== '') {
        if (visibility === 'parfaite') {
            result = result.filter(
                (item) => item.hoursVisible > 0 && item.maxAltNight !== undefined && item.maxAltNight >= 60,
            );
        } else if (visibility === 'observable') {
            result = result.filter(
                (item) => item.hoursVisible > 0 && item.maxAltNight !== undefined && item.maxAltNight >= 30,
            );
        } else if (visibility === 'basse') {
            result = result.filter(
                (item) => item.hoursVisible > 0 && item.maxAltNight !== undefined && item.maxAltNight < 30,
            );
        } else if (visibility === 'invisible') {
            result = result.filter((item) => item.hoursVisible === 0);
        }
    }
    if ((compatibility as string) !== 'all' && (compatibility as string) !== '') {
        result = result.filter((item) => item.feasibility.status === compatibility);
    }
    if (constellation !== 'all' && constellation !== '') {
        result = result.filter((item) => item.constellation === constellation);
    }
    return result;
}

/** Tri actif d'un tableau de petits corps. */
export interface SortState<Column extends string> {
    col: Column;
    dir: 'asc' | 'desc';
}

/**
 * État de tri suivant après un clic sur une colonne : ascendant (descendant pour le score),
 * puis inversion, puis retour au tri par score décroissant.
 *
 * @param prev - Tri actif.
 * @param col - Colonne cliquée.
 * @returns Le nouveau tri.
 */
export function nextSortState<Column extends string>(
    prev: SortState<Column | 'score'> | null,
    col: Column | 'score',
): SortState<Column | 'score'> {
    if (!prev || prev.col !== col) {
        return { col, dir: col === 'score' ? 'desc' : 'asc' };
    }
    if (prev.dir === 'desc') {
        return { col, dir: 'asc' };
    }
    return { col: 'score', dir: 'desc' };
}

/** Rang de tri des verdicts de faisabilité (du plus favorable au moins favorable). */
const FEASIBILITY_SORT_RANK: Record<string, number> = {
    gerable: 0,
    delicat: 1,
    inobservable: 2,
    hors_portee: 3,
};

/**
 * Valeurs de tri communes : score, nom, magnitude, visibilité et faisabilité.
 *
 * @param item - Corps à trier.
 * @param col - Colonne triée.
 * @returns La clé de tri, ou `undefined` si la colonne est propre au visualiseur.
 */
export function commonSortValue(item: ObservedSmallBody, col: string): number | string | undefined {
    if (col === 'score') return item.score;
    if (col === 'name') return item.name;
    if (col === 'mag') return item.orbit.apparentMag;
    if (col === 'visibility') return item.maxAltNight || -90;
    if (col === 'compatibility') return FEASIBILITY_SORT_RANK[item.feasibility.status] ?? 4;
    return undefined;
}

/**
 * Trie une copie des corps. Les clés texte se comparent avec `localeCompare`, les clés
 * numériques indéfinies ou NaN valent 999.
 *
 * @param items - Corps à trier.
 * @param sort - Tri actif (`null` : score décroissant).
 * @param getSortValue - Clé de tri d'un corps pour une colonne.
 * @returns Une nouvelle liste triée.
 */
export function sortSmallBodies<T, Column extends string>(
    items: T[],
    sort: SortState<Column> | null,
    // POURQUOI : NoInfer, sinon `Column` est déduit du callback et perd la colonne `score`.
    getSortValue: NoInfer<(item: T, col: Column | 'score') => number | string | undefined>,
): T[] {
    const activeSort: SortState<Column | 'score'> = sort || { col: 'score', dir: 'desc' };
    return [...items].sort((a, b) => {
        const rawA = getSortValue(a, activeSort.col);
        const rawB = getSortValue(b, activeSort.col);

        if (typeof rawA === 'string' || typeof rawB === 'string') {
            const textA = String(rawA);
            const textB = String(rawB);
            return activeSort.dir === 'asc' ? textA.localeCompare(textB) : textB.localeCompare(textA);
        }

        let valA = rawA ?? 0;
        let valB = rawB ?? 0;
        // Gérer les valeurs indéfinies ou NaN
        if (isNaN(valA)) valA = 999;
        if (isNaN(valB)) valB = 999;

        return activeSort.dir === 'asc' ? valA - valB : valB - valA;
    });
}

/** Libellé de type d'une comète selon son excentricité. */
export function cometOrbitType(e: number): 'Périodique' | 'Non-périodique' {
    return e < 0.9 ? 'Périodique' : 'Non-périodique';
}

/** Classe dynamique d'un astéroïde. */
export type AsteroidClass = 'PHA' | 'NEA' | 'Distant' | 'Unusual';

/**
 * Vrai pour un géocroiseur (périhélie q = a·(1 − e) < 1,3 UA).
 *
 * @param a - Demi-grand axe (UA).
 * @param e - Excentricité.
 * @returns Vrai si l'astéroïde est un NEA (PHA compris).
 */
export function isNearEarthAsteroid(a: number, e: number): boolean {
    return a * (1 - e) < 1.3;
}

/**
 * Classe un astéroïde : PHA (NEA avec H ≤ 22), NEA, distant (a > 5,5 UA) ou inhabituel.
 *
 * @param asteroid - Demi-grand axe, excentricité et magnitude absolue.
 * @returns La classe dynamique.
 */
export function classifyAsteroid(asteroid: { a: number; e: number; h: number }): AsteroidClass {
    if (isNearEarthAsteroid(asteroid.a, asteroid.e)) return asteroid.h <= 22.0 ? 'PHA' : 'NEA';
    if (asteroid.a > 5.5) return 'Distant';
    return 'Unusual';
}

/** Filtre de type d'astéroïde de la barre avancée. */
export type AsteroidTypeFilter = 'all' | 'pha' | 'nea' | 'distant' | 'inhabituel';

/**
 * Vrai si l'astéroïde correspond au filtre de type.
 *
 * POURQUOI : « distant » ne teste que a > 5,5 UA, sans exclure les NEA, contrairement à
 * {@link classifyAsteroid} ; comportement historique conservé.
 *
 * @param asteroid - Demi-grand axe, excentricité et magnitude absolue.
 * @param filter - Filtre sélectionné.
 * @returns Vrai si l'astéroïde est retenu.
 */
export function matchesAsteroidTypeFilter(
    asteroid: { a: number; e: number; h: number },
    filter: AsteroidTypeFilter,
): boolean {
    const isNea = isNearEarthAsteroid(asteroid.a, asteroid.e);
    const isPha = isNea && asteroid.h <= 22.0;
    const isDistant = asteroid.a > 5.5;
    if (filter === 'pha') return isPha;
    if (filter === 'nea') return isNea && !isPha;
    if (filter === 'distant') return isDistant;
    if (filter === 'inhabituel') return !isNea && !isDistant;
    return true;
}
