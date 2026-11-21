/**
 * @file variable-stars.ts
 * @description Calculs purs de l'outil d'observation des étoiles variables (VariableStarsViewer).
 *
 * Responsabilité :
 * - Types partagés (étoile, compatibilité instrumentale, faisabilité, étoile analysée, filtres, tri).
 * - Phénomènes de variabilité (éclipses, éruptions, pulsations) : cycle courant et fenêtre temporelle.
 * - Phase réelle, date d'une phase, modèle de magnitude et courbe de lumière du simulateur.
 * - Compatibilité instrumentale, statut de visibilité nocturne, faisabilité et score d'une cible.
 * - Filtrage, tri et libellés (types, faisabilité, chips de filtres actifs).
 */

import { julianDate, dateFromJulian } from '@/lib/astro/time';
import { observability, type ObsLocation, type Observability } from '@/lib/objects/observation';
import { calculateVariableStarScore } from '@/lib/objects/scoring';
import { getConstellationName } from '@/lib/constellations';
import { foldAccents } from '@/utils/normalize';

export type VariableStarType = 'eclipsing' | 'cepheid' | 'mira' | 'cataclysmique' | 'semiregular';

export interface VariableStar {
    id: string;
    name: string;
    starName: string;
    constellation: string;
    ra: number;
    dec: number;
    vMagMin: number; // magnitude au maximum d'éclat (la plus brillante, donc valeur mag la plus petite)
    vMagMax: number; // magnitude au minimum d'éclat (la plus faible, donc valeur mag la plus grande)
    period: number; // en jours
    epoch: number; // epoch JD de référence
    type: VariableStarType;
    spectralType: string;
    distance: number;
    details?: string;
}

export interface DifficultyEval {
    label:
        | 'Entièrement observable'
        | 'Observable au maximum'
        | 'Partiellement observable'
        | 'Trop faible pour votre setup';
    color: string;
    limitMag: number;
}

export interface Feasibility {
    label: string;
    color: string;
    status: string;
}

export interface AnalysedVariableStar extends VariableStar {
    obs: Observability;
    currentAlt: number;
    maxAltNight: number | undefined;
    hoursVisible: number;
    statusLabel: string;
    statusColor: string;
    comp: DifficultyEval;
    feasibility: Feasibility;
    score: number;
}

export type VariableStarSortColumn = 'name' | 'score' | 'type' | 'vMag' | 'period' | 'visibility' | 'compatibility';
export type VariableStarSort = { col: VariableStarSortColumn; dir: 'asc' | 'desc' } | null;

export type VisibilityFilter = 'all' | 'parfaite' | 'observable' | 'basse' | 'invisible';
export type CompatibilityFilter = 'all' | 'gerable' | 'delicat' | 'inobservable' | 'hors_portee';

/** Ensemble des critères de filtrage côté client (les champs numériques restent des chaînes de saisie). */
export interface VariableStarFilters {
    query: string;
    filterType: 'all' | VariableStarType;
    filterVisibleCeSoir: boolean;
    filterObservable: boolean;
    minMag: string;
    maxMag: string;
    minAmplitude: string;
    maxAmplitude: string;
    minPeriod: string;
    maxPeriod: string;
    minScore: string;
    maxScore: string;
    visibilityFilter: VisibilityFilter;
    compatibilityFilter: CompatibilityFilter;
    constellationFilter: string;
}

export interface VariableStarPhenomenon {
    startDate: Date;
    midDate: Date;
    endDate: Date;
    startLabel: string;
    midLabel: string;
    endLabel: string;
}

/** Ligne de base des badges (vert, ambre, rouge) partagée par compatibilité et faisabilité. */
const BADGE_GREEN = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
const BADGE_AMBER = 'bg-amber-500/20 text-amber-400 border-amber-500/30';
const BADGE_RED = 'bg-red-500/20 text-red-400 border-red-500/30';

/**
 * Calcule les dates et heures exactes de début, milieu et fin du phénomène de variabilité
 * (éclipse, éruption ou pic de pulsation) pour le cycle contenant la date donnée.
 *
 * @param star - Étoile (période, époque et type).
 * @param date - Date contenue dans le cycle recherché.
 * @returns Les trois instants et leurs libellés, ou `null` si la période ou l'époque est invalide.
 */
export function getVariableStarPhenomenon(star: VariableStar, date: Date): VariableStarPhenomenon | null {
    const period = star.period;
    const epoch = star.epoch;
    if (!period || period <= 0 || !epoch) return null;

    const selectedJd = julianDate(date);
    const cycles = (selectedJd - epoch) / period;
    const currentCycleNumber = Math.floor(cycles);
    const jdCycleStart = epoch + currentCycleNumber * period;

    let startPhase = 0;
    let midPhase = 50;
    let endPhase = 100;

    let startLabel = 'Début du cycle';
    let midLabel = 'Milieu du cycle';
    let endLabel = 'Fin du cycle';

    if (star.type === 'cataclysmique') {
        startPhase = 70;
        midPhase = 75;
        endPhase = 100;
        startLabel = "Début de l'éruption";
        midLabel = "Pic d'éclat (Max)";
        endLabel = "Fin de l'éruption";
    } else if (star.type === 'eclipsing') {
        startPhase = 40;
        midPhase = 50;
        endPhase = 60;
        startLabel = "Début de l'éclipse";
        midLabel = "Milieu de l'éclipse";
        endLabel = "Fin de l'éclipse";
    } else if (star.type === 'cepheid' || star.type === 'mira') {
        startPhase = 0;
        midPhase = 25;
        endPhase = 100;
        startLabel = 'Début de montée';
        midLabel = "Maximum d'éclat";
        endLabel = 'Fin du cycle';
    }

    const jdStart = jdCycleStart + (startPhase / 100) * period;
    const jdMid = jdCycleStart + (midPhase / 100) * period;
    const jdEnd = jdCycleStart + (endPhase / 100) * period;

    return {
        startDate: dateFromJulian(jdStart),
        midDate: dateFromJulian(jdMid),
        endDate: dateFromJulian(jdEnd),
        startLabel,
        midLabel,
        endLabel,
    };
}

/**
 * Calcule tous les phénomènes de variabilité (éruptions, éclipses, pulsations)
 * qui se produisent dans une fenêtre temporelle donnée (ex: la période 24h du graphique).
 *
 * @param star - Étoile (période, époque et type).
 * @param t0 - Début de la fenêtre.
 * @param t1 - Fin de la fenêtre.
 * @returns Les phénomènes qui chevauchent la fenêtre (vide si période ou époque invalide).
 */
export function getVariableStarPhenomenaInWindow(
    star: VariableStar,
    t0: Date,
    t1: Date,
): Array<{ start: Date; end: Date; label: string }> {
    const period = star.period;
    const epoch = star.epoch;
    if (!period || period <= 0 || !epoch) return [];

    const jd0 = julianDate(t0);
    const jd1 = julianDate(t1);

    const minCycle = Math.floor((jd0 - epoch) / period) - 1;
    const maxCycle = Math.ceil((jd1 - epoch) / period) + 1;

    let startPhase = 0;
    let endPhase = 100;
    let label = 'Phénomène';

    if (star.type === 'cataclysmique') {
        startPhase = 70;
        endPhase = 100;
        label = 'Éruption';
    } else if (star.type === 'eclipsing') {
        startPhase = 40;
        endPhase = 60;
        label = 'Éclipse';
    } else if (star.type === 'cepheid' || star.type === 'mira') {
        startPhase = 0;
        endPhase = 100;
        label = 'Phénomène';
    }

    const results: Array<{ start: Date; end: Date; label: string }> = [];

    for (let c = minCycle; c <= maxCycle; c++) {
        const jdCycleStart = epoch + c * period;
        const jdStart = jdCycleStart + (startPhase / 100) * period;
        const jdEnd = jdCycleStart + (endPhase / 100) * period;

        const start = dateFromJulian(jdStart);
        const end = dateFromJulian(jdEnd);

        if (end.getTime() >= t0.getTime() && start.getTime() <= t1.getTime()) {
            results.push({ start, end, label });
        }
    }

    return results;
}

/**
 * Traduit le type de variabilité technique en texte lisible en français.
 *
 * @param type - Type brut issu du fichier JSON
 * @returns Libellé en français.
 */
export function getVariabilityTypeLabel(type: VariableStarType): string {
    switch (type) {
        case 'eclipsing':
            return 'Binaire à éclipses';
        case 'cepheid':
            return 'Pulsante (Céphéide / RR Lyrae)';
        case 'mira':
            return 'Pulsante à longue période (Mira)';
        case 'cataclysmique':
            return 'Cataclysmique (Nova naine)';
        case 'semiregular':
            return 'Semi-régulière / Irrégulière';
        default:
            return 'Inconnu';
    }
}

/**
 * Libellé court du type, affiché dans le badge de ligne et utilisé pour le tri par type.
 *
 * @param type - Type de variabilité.
 * @returns Libellé court (« Semi-régulière » pour tout type non reconnu).
 */
export function getVariableTypeShortLabel(type: VariableStarType): string {
    switch (type) {
        case 'eclipsing':
            return 'Éclipses';
        case 'cepheid':
            return 'Céphéide';
        case 'mira':
            return 'Mira';
        case 'cataclysmique':
            return 'Cataclysmique';
        default:
            return 'Semi-régulière';
    }
}

/**
 * Classes de couleur du badge de type.
 *
 * @param type - Type de variabilité.
 * @returns Classes Tailwind de bordure, fond et texte.
 */
export function getVariableTypeBadgeColor(type: VariableStarType): string {
    switch (type) {
        case 'mira':
            return 'border-purple-500/40 bg-purple-500/15 text-purple-400';
        case 'cepheid':
            return 'border-blue-500/40 bg-blue-500/15 text-blue-400';
        case 'eclipsing':
            return 'border-teal-500/40 bg-teal-500/15 text-teal-400';
        case 'cataclysmique':
            return 'border-rose-500/40 bg-rose-500/15 text-rose-400';
        default:
            return 'border-amber-500/40 bg-amber-500/15 text-amber-400';
    }
}

/**
 * Infobulle explicative du badge de type.
 *
 * @param type - Type de variabilité.
 * @returns Phrase descriptive du mécanisme de variabilité.
 */
export function getVariableTypeTooltip(type: VariableStarType): string {
    switch (type) {
        case 'eclipsing':
            return 'Système binaire à éclipses : Étoiles en orbite mutuelle provoquant une occultation périodique.';
        case 'cepheid':
            return 'Céphéide : Étoile géante pulsante dont la période de variation est reliée à sa luminosité absolue.';
        case 'mira':
            return 'Variable type Mira : Géante rouge pulsante à très forte amplitude sur de longues périodes.';
        case 'cataclysmique':
            return 'Variable cataclysmique (Nova / Nova naine) : Système binaire subissant des explosions récurrentes.';
        default:
            return "Semi-régulière : Géante ou supergéante présentant des pulsations accompagnées d'irrégularités.";
    }
}

/**
 * Infobulle explicative du badge de faisabilité.
 *
 * @param status - Statut de faisabilité (`gerable`, `delicat`, `inobservable`, `hors_portee`).
 * @returns Phrase descriptive (« Setup insuffisant » pour tout autre statut).
 */
export function getFeasibilityTooltip(status: string): string {
    if (status === 'gerable')
        return 'Gérable : Cible bien visible ce soir (hauteur > 30°) et parfaitement adaptée à votre matériel.';
    if (status === 'delicat')
        return "Délicat : Cible basse (< 30°) ou proche de la limite d'ouverture / magnitude de votre instrument.";
    if (status === 'inobservable')
        return "Inobservable : Cible sous l'horizon ou n'atteignant pas une hauteur suffisante ce soir.";
    return "Setup insuffisant : Magnitude trop faible ou diamètre d'instrument insuffisant pour cette cible.";
}

/**
 * Formate la période pour les colonnes du tableau.
 *
 * @param period - Période en jours.
 * @returns « Irrégulière » si absente ou ≥ 10 000 j, sinon « x.xx j ».
 */
export function formatVariableStarPeriod(period: number): string {
    return !period || period >= 10000 ? 'Irrégulière' : `${period.toFixed(2)} j`;
}

/**
 * Évalue la compatibilité instrumentale d'une cible selon ses magnitudes extrêmes.
 *
 * @param vMagMin - Magnitude au maximum d'éclat (la plus brillante).
 * @param vMagMax - Magnitude au minimum d'éclat (la plus faible).
 * @param limitMag - Magnitude limite visuelle de l'instrument.
 * @param limitMagPhoto - Magnitude limite photométrique de l'instrument.
 * @returns Libellé, classes du badge et magnitude limite visuelle.
 */
export function evaluateSetupCompatibility(
    vMagMin: number,
    vMagMax: number,
    limitMag: number,
    limitMagPhoto: number,
): DifficultyEval {
    // vMagMin est la plus brillante (ex: 2.12), vMagMax la plus faible (ex: 30.8)
    const safetyThreshold = limitMag - 1.0;

    if (vMagMax <= safetyThreshold) {
        return { label: 'Entièrement observable', color: BADGE_GREEN, limitMag };
    } else if (vMagMax <= limitMagPhoto) {
        return { label: 'Observable au maximum', color: BADGE_GREEN, limitMag };
    } else if (vMagMin <= limitMagPhoto) {
        return { label: 'Partiellement observable', color: BADGE_AMBER, limitMag };
    } else {
        return { label: 'Trop faible pour votre setup', color: BADGE_RED, limitMag };
    }
}

/**
 * Statut de visibilité nocturne d'une cible.
 *
 * @param tag - Étiquette d'observabilité (`circumpolaire`…).
 * @param maxAltNight - Hauteur maximale pendant la nuit astronomique (degrés).
 * @param hoursVisible - Heures exploitables (hauteur ≥ 30° de nuit).
 * @returns Libellé et classes de couleur du texte.
 */
export function getVisibilityStatus(
    tag: Observability['tag'],
    maxAltNight: number | undefined,
    hoursVisible: number,
): { statusLabel: string; statusColor: string } {
    if (tag === 'circumpolaire') {
        return { statusLabel: 'Circumpolaire', statusColor: 'text-emerald-400 font-semibold' };
    }
    if (maxAltNight !== undefined && maxAltNight >= 10) {
        // POURQUOI: Une cible est considérée comme 'Très basse' si sa hauteur maximale durant la nuit
        // est de 10° ou plus (mais sans atteindre les 30° d'utilité optimale requis pour incrémenter hoursVisible).
        if (maxAltNight >= 30 && hoursVisible > 0) {
            return { statusLabel: 'Observable', statusColor: 'text-emerald-400' };
        }
        return { statusLabel: 'Très basse', statusColor: 'text-amber-400' };
    }
    return { statusLabel: "Sous l'horizon", statusColor: 'text-mp-text-muted' };
}

/**
 * Faisabilité globale de l'observation ce soir.
 *
 * @param comp - Compatibilité instrumentale.
 * @param statusLabel - Statut de visibilité nocturne.
 * @param maxAltNight - Hauteur maximale nocturne (degrés).
 * @returns Libellé, classes du badge et statut (`gerable` | `delicat` | `inobservable` | `hors_portee`).
 */
export function getFeasibility(
    comp: DifficultyEval,
    statusLabel: string,
    maxAltNight: number | undefined,
): Feasibility {
    if (comp.label === 'Trop faible pour votre setup') {
        return { label: 'Setup insuffisant', color: BADGE_RED, status: 'hors_portee' };
    }
    if (
        statusLabel === "Sous l'horizon" ||
        statusLabel === 'Invisible' ||
        maxAltNight === undefined ||
        maxAltNight < 10
    ) {
        return { label: 'Inobservable', color: BADGE_RED, status: 'inobservable' };
    }
    if (
        statusLabel === 'Très basse' ||
        comp.label === 'Observable au maximum' ||
        comp.label === 'Partiellement observable'
    ) {
        return { label: 'Délicat', color: BADGE_AMBER, status: 'delicat' };
    }
    return { label: 'Gérable', color: BADGE_GREEN, status: 'gerable' };
}

/**
 * Analyse complète d'une cible : observabilité, statut, compatibilité, faisabilité et score.
 *
 * @param star - Étoile à analyser.
 * @param location - Lieu d'observation.
 * @param date - Date de référence.
 * @param limitMag - Magnitude limite visuelle.
 * @param limitMagPhoto - Magnitude limite photométrique.
 * @returns L'étoile enrichie des résultats d'analyse.
 */
export function analyseVariableStar(
    star: VariableStar,
    location: ObsLocation,
    date: Date,
    limitMag: number,
    limitMagPhoto: number,
): AnalysedVariableStar {
    const obs = observability(star.ra, star.dec, location, date);
    // POURQUOI: Utiliser directement l'altitude calculée par observability pour éviter 14 600 appels redondants de altAz.
    const currentAlt = obs.nowAltAz.altDeg;
    const maxAltNight = obs.riseSet.maxAltAtNightDeg;
    const hoursVisible = obs.riseSet.hoursAboveHorizonAtNight ?? 0;
    const comp = evaluateSetupCompatibility(star.vMagMin, star.vMagMax, limitMag, limitMagPhoto);
    const { statusLabel, statusColor } = getVisibilityStatus(obs.tag, maxAltNight, hoursVisible);
    const feasibility = getFeasibility(comp, statusLabel, maxAltNight);
    const score = calculateVariableStarScore(hoursVisible, star.vMagMin, star.vMagMax, feasibility.status);

    return {
        ...star,
        obs,
        currentAlt,
        maxAltNight,
        hoursVisible,
        statusLabel,
        statusColor,
        comp,
        feasibility,
        score,
    };
}

/**
 * Applique la recherche textuelle et l'ensemble des filtres (simples et avancés).
 *
 * @param stars - Étoiles analysées.
 * @param filters - Critères de filtrage.
 * @returns Les étoiles retenues, dans l'ordre d'origine.
 */
export function filterVariableStars(
    stars: AnalysedVariableStar[],
    filters: VariableStarFilters,
): AnalysedVariableStar[] {
    const {
        query,
        filterType,
        filterVisibleCeSoir,
        filterObservable,
        minMag,
        maxMag,
        minAmplitude,
        maxAmplitude,
        minPeriod,
        maxPeriod,
        minScore,
        maxScore,
        visibilityFilter,
        compatibilityFilter,
        constellationFilter,
    } = filters;
    const cleanString = (str: string) => foldAccents(str).trim();
    const q = cleanString(query);

    return stars.filter((s) => {
        // Recherche textuelle
        if (q) {
            const haystack = cleanString(
                `${s.name} ${s.starName} ${getConstellationName(s.constellation)} ${getVariabilityTypeLabel(s.type)}`,
            );
            if (!haystack.includes(q)) return false;
        }

        // Filtrage par type de variabilité
        if ((filterType as string) !== 'all' && (filterType as string) !== '' && s.type !== filterType) return false;

        if (filterVisibleCeSoir && s.hoursVisible <= 0) return false;
        if (filterObservable && (s.feasibility.status === 'inobservable' || s.feasibility.status === 'hors_portee'))
            return false;

        // --- FILTRES AVANCÉS ---
        if (minMag !== '' && s.vMagMin < parseFloat(minMag)) return false;
        if (maxMag !== '' && s.vMagMax > parseFloat(maxMag)) return false;
        if (minAmplitude !== '' && Math.abs(s.vMagMax - s.vMagMin) < parseFloat(minAmplitude)) return false;
        if (maxAmplitude !== '' && Math.abs(s.vMagMax - s.vMagMin) > parseFloat(maxAmplitude)) return false;
        if (minPeriod !== '' && (s.period ?? 0) < parseFloat(minPeriod)) return false;
        if (maxPeriod !== '' && (s.period ?? 0) > parseFloat(maxPeriod)) return false;
        if (minScore !== '' && (s.score ?? 0) < parseFloat(minScore)) return false;
        if (maxScore !== '' && (s.score ?? 0) > parseFloat(maxScore)) return false;

        if ((visibilityFilter as string) !== 'all' && (visibilityFilter as string) !== '') {
            if (visibilityFilter === 'parfaite' && (s.maxAltNight === undefined || s.maxAltNight < 60)) return false;
            if (
                visibilityFilter === 'observable' &&
                s.statusLabel !== 'Observable' &&
                s.statusLabel !== 'Circumpolaire'
            )
                return false;
            if (visibilityFilter === 'basse' && s.statusLabel !== 'Très basse') return false;
            if (visibilityFilter === 'invisible' && s.statusLabel !== 'Invisible' && s.statusLabel !== "Sous l'horizon")
                return false;
        }
        if ((compatibilityFilter as string) !== 'all' && (compatibilityFilter as string) !== '') {
            if (s.feasibility.status !== compatibilityFilter) return false;
        }
        if (constellationFilter !== 'all' && constellationFilter !== '') {
            if (s.constellation !== constellationFilter) return false;
        }

        return true;
    });
}

const FEASIBILITY_ORDER: Record<string, number> = {
    gerable: 0,
    delicat: 1,
    inobservable: 2,
    hors_portee: 3,
};

/**
 * Trie une copie des étoiles selon la colonne active (score décroissant par défaut).
 *
 * @param stars - Étoiles analysées.
 * @param sort - Colonne et sens, ou `null` pour le tri par défaut.
 * @returns Nouveau tableau trié.
 */
export function sortVariableStars(stars: AnalysedVariableStar[], sort: VariableStarSort): AnalysedVariableStar[] {
    const { col, dir } = sort || { col: 'score', dir: 'desc' };
    const sign = dir === 'desc' ? -1 : 1;

    return [...stars].sort((a, b) => {
        if (col === 'name') return sign * a.name.localeCompare(b.name);
        if (col === 'score') return sign * ((a.score ?? 0) - (b.score ?? 0));
        if (col === 'type')
            return sign * getVariableTypeShortLabel(a.type).localeCompare(getVariableTypeShortLabel(b.type));
        if (col === 'vMag') return sign * (a.vMagMin - b.vMagMin);
        if (col === 'period') return sign * ((a.period ?? 0) - (b.period ?? 0));
        // POURQUOI : sens inversé volontaire (b - a) hérité de l'implémentation d'origine.
        if (col === 'visibility') return sign * (b.hoursVisible - a.hoursVisible);
        if (col === 'compatibility') {
            const valA = FEASIBILITY_ORDER[a.feasibility.status] ?? 4;
            const valB = FEASIBILITY_ORDER[b.feasibility.status] ?? 4;
            return sign * (valA - valB);
        }
        return 0;
    });
}

/**
 * État de tri suivant après un clic sur un en-tête : nouvelle colonne (score en décroissant,
 * les autres en croissant), puis bascule descendant → croissant, puis retour au score décroissant.
 *
 * @param current - Tri courant.
 * @param key - Colonne cliquée.
 * @returns Nouveau tri.
 */
export function nextVariableStarSort(current: VariableStarSort, key: VariableStarSortColumn): VariableStarSort {
    if (!current || current.col !== key) return { col: key, dir: key === 'score' ? 'desc' : 'asc' };
    if (current.dir === 'desc') return { col: key, dir: 'asc' };
    return { col: 'score', dir: 'desc' };
}

const TYPE_FILTER_LABELS: Record<string, string> = {
    eclipsing: 'Éclipses',
    cepheid: 'Céphéides',
    mira: 'Mira',
    cataclysmique: 'Cataclysmiques',
    semiregular: 'Semi-régulières',
};

const VISIBILITY_FILTER_LABELS: Record<string, string> = {
    parfaite: 'Parfaite (>60°)',
    observable: 'Observable (>30°)',
    basse: 'Très basse (<30°)',
    invisible: 'Invisible / Sous horizon',
};

const COMPATIBILITY_FILTER_LABELS: Record<string, string> = {
    gerable: 'Gérable',
    delicat: 'Délicat',
    inobservable: 'Inobservable',
    hors_portee: 'Setup insuffisant',
};

/**
 * Chips des filtres actifs, dans l'ordre d'affichage de la barre de filtres.
 *
 * @param filters - Critères de filtrage (recherche et cases à cocher ignorées).
 * @returns Liste `{ key, label, value }` compatible avec `ActiveFilterChip`.
 */
export function getActiveFilterChips(
    filters: Omit<VariableStarFilters, 'query' | 'filterVisibleCeSoir' | 'filterObservable'>,
): Array<{ key: string; label: string; value: string }> {
    const chips: Array<{ key: string; label: string; value: string }> = [];
    const { filterType, visibilityFilter, compatibilityFilter, constellationFilter } = filters;
    if (filterType !== 'all') {
        chips.push({ key: 'filterType', label: 'Type', value: TYPE_FILTER_LABELS[filterType] || filterType });
    }
    if (visibilityFilter !== 'all') {
        chips.push({
            key: 'visibilityFilter',
            label: 'Visibilité',
            value: VISIBILITY_FILTER_LABELS[visibilityFilter] || visibilityFilter,
        });
    }
    if (compatibilityFilter !== 'all') {
        chips.push({
            key: 'compatibilityFilter',
            label: 'Faisabilité',
            value: COMPATIBILITY_FILTER_LABELS[compatibilityFilter] || compatibilityFilter,
        });
    }
    if (constellationFilter !== 'all') {
        chips.push({
            key: 'constellationFilter',
            label: 'Constellation',
            value: getConstellationName(constellationFilter),
        });
    }
    if (filters.minMag) chips.push({ key: 'minMag', label: 'Mag Min', value: `${filters.minMag} V` });
    if (filters.maxMag) chips.push({ key: 'maxMag', label: 'Mag Max', value: `${filters.maxMag} V` });
    if (filters.minAmplitude)
        chips.push({ key: 'minAmplitude', label: 'Amp. Min', value: `${filters.minAmplitude} mag` });
    if (filters.maxAmplitude)
        chips.push({ key: 'maxAmplitude', label: 'Amp. Max', value: `${filters.maxAmplitude} mag` });
    if (filters.minPeriod) chips.push({ key: 'minPeriod', label: 'Période Min', value: `${filters.minPeriod} j` });
    if (filters.maxPeriod) chips.push({ key: 'maxPeriod', label: 'Période Max', value: `${filters.maxPeriod} j` });
    if (filters.minScore) chips.push({ key: 'minScore', label: 'Score Min', value: filters.minScore });
    if (filters.maxScore) chips.push({ key: 'maxScore', label: 'Score Max', value: filters.maxScore });
    return chips;
}

/**
 * Phase réelle (0-100, arrondie) de l'étoile à la date donnée.
 *
 * @param star - Étoile (période, époque).
 * @param date - Date d'observation.
 * @returns Phase en pourcentage ; 50 si période ou époque invalide.
 */
export function getRealTimePhase(star: VariableStar, date: Date): number {
    if (!star.period || star.period <= 0 || !star.epoch) return 50;
    const selectedJd = julianDate(date);
    const rawPhase = ((((selectedJd - star.epoch) / star.period) % 1) + 1) % 1;
    return Math.round(rawPhase * 100);
}

/**
 * Date correspondant à une phase du cycle contenant la date sélectionnée.
 *
 * @param star - Étoile (période, époque).
 * @param date - Date sélectionnée (ancre du cycle courant).
 * @param phase - Phase en pourcentage (0-100).
 * @returns La date de la phase ; `date` inchangée si période ou époque invalide.
 */
export function getDateAtPhase(star: VariableStar, date: Date, phase: number): Date {
    const period = star.period;
    const epoch = star.epoch;
    // POURQUOI: Éviter une division par zéro ou NaN si les paramètres de période sont invalides.
    if (!period || period <= 0 || !epoch) return date;

    const selectedJd = julianDate(date);
    const currentCycleNumber = Math.floor((selectedJd - epoch) / period);
    const jdCycleStart = epoch + currentCycleNumber * period;
    return dateFromJulian(jdCycleStart + (phase / 100) * period);
}

/**
 * Modèle théorique de magnitude selon le type et la phase.
 *
 * @param star - Étoile (type et magnitudes extrêmes).
 * @param phase - Phase en pourcentage (0-100).
 * @returns Magnitude V simulée.
 */
export function getMagnitudeAtPhase(star: Pick<VariableStar, 'type' | 'vMagMin' | 'vMagMax'>, phase: number): number {
    const min = star.vMagMin; // la plus brillante (ex: 2.1)
    const max = star.vMagMax; // la plus faible (ex: 3.4)
    const delta = max - min;

    if (star.type === 'eclipsing') {
        // Modèle à deux éclipses : principale à phase 50 (baisse de delta × 0,95),
        // secondaire à phase 0/100 (baisse de delta × 0,25).
        if (phase >= 40 && phase <= 60) {
            const x = (phase - 50) / 10; // -1 à +1
            return min + delta * 0.95 * (1 - x * x);
        }
        if (phase <= 10) {
            const x = phase / 10;
            return min + delta * 0.25 * (1 - x * x);
        }
        if (phase >= 90) {
            const x = (100 - phase) / 10;
            return min + delta * 0.25 * (1 - x * x);
        }
        return min;
    }

    if (star.type === 'cepheid' || star.type === 'mira') {
        // POURQUOI : sinusoïde déformée (montée rapide, descente lente), comme les Céphéides et Mira.
        // synth varie entre -1 (mag min, brillante) et +1 (mag max, faible).
        const angle = (phase / 100) * 2 * Math.PI;
        const synth = Math.sin(angle - 0.5 * Math.sin(angle));
        return min + (delta * (synth + 1)) / 2;
    }

    if (star.type === 'cataclysmique') {
        // Nova naine : repos jusqu'à 70, sursaut 70-75, décroissance approximative en racine ensuite.
        if (phase < 70) return max;
        if (phase < 75) return max - delta * ((phase - 70) / 5);
        return min + delta * Math.sqrt((phase - 75) / 25);
    }

    if (star.type === 'semiregular') {
        // POURQUOI : somme de deux sinusoïdes proches pour un effet de battement irrégulier.
        const angle1 = (phase / 100) * 2 * Math.PI;
        const angle2 = (phase / 100) * 4 * Math.PI + 0.8;
        const wave = (Math.sin(angle1) + 0.4 * Math.cos(angle2)) / 1.4; // varie de -1 à +1 environ
        return min + (delta * (wave + 1)) / 2;
    }

    return min;
}

/**
 * Ordonnée SVG d'une magnitude sur la courbe de lumière (y = 10 brillant, y = 45 faible).
 *
 * @param mag - Magnitude à placer.
 * @param vMagMin - Magnitude la plus brillante.
 * @param vMagMax - Magnitude la plus faible.
 * @returns Ordonnée dans le viewBox 280 × 60.
 */
export function magnitudeToCurveY(mag: number, vMagMin: number, vMagMax: number): number {
    const delta = vMagMax - vMagMin;
    return 10 + ((mag - vMagMin) / (delta || 1)) * 35;
}

/**
 * Points de la polyline de la courbe de lumière théorique (101 points, x de 20 à 260).
 *
 * @param star - Étoile (type et magnitudes extrêmes).
 * @returns Attribut `points` SVG (« x,y x,y … »).
 */
export function getLightCurvePoints(star: Pick<VariableStar, 'type' | 'vMagMin' | 'vMagMax'>): string {
    const points: string[] = [];
    for (let i = 0; i <= 100; i++) {
        const x = 20 + (i / 100) * 240;
        const y = magnitudeToCurveY(getMagnitudeAtPhase(star, i), star.vMagMin, star.vMagMax);
        points.push(`${x},${y}`);
    }
    return points.join(' ');
}
