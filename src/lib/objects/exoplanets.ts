/**
 * Calculs purs du planificateur de transits d'exoplanètes
 *
 * Responsabilité : éphémérides de transit (transit de la nuit, prochain transit), bruit
 * photométrique et rapport signal/bruit selon l'instrument, faisabilité de l'observation,
 * filtrage et tri de la liste, et modèle trapézoïdal de la courbe de lumière du simulateur.
 * Aucune dépendance React : consommé par `src/components/Objects/ExoplanetViewer.tsx` et ses
 * sous-composants (`src/components/Objects/exoplanets/`).
 */

import { julianDate, dateFromJulian } from '@/lib/astro/time';
import { altAz, sunPosition, getLocalNoonAtLongitude, type ObsLocation } from '@/lib/objects/observation';
import { getConstellationName } from '@/lib/constellations';
import { calculateExoplanetScore } from '@/lib/objects/scoring';
import { foldAccents } from '@/utils/normalize';

/** Exoplanète telle que renvoyée par `/api/exoplanets`. */
export interface Exoplanet {
    id: string;
    name: string;
    commonName: string;
    starName: string;
    vMag: number;
    ra: number;
    dec: number;
    period: number;
    epoch: number;
    duration: number; // en heures
    depth: number; // en %
    mass: number; // en masses joviennes
    radius: number; // en rayons joviens
    distance: number; // en années-lumière
    spectralType: string;
    starRadius: number; // en rayons solaires
    constellation: string; // code UAI à 3 lettres
    isCandidate: boolean; // true = TESS TOI candidate (PC/APC), false = confirmed
}

/** Observabilité d'un transit depuis le site de l'observateur. */
export type TransitObservability = 'oui' | 'partiel' | 'non' | 'horizon' | 'jour';

export interface TransitOccurrence {
    tc: Date;
    start: Date;
    end: Date;
    starAltMid: number;
    sunAltMid: number;
    observable: TransitObservability;
    observabilityReason: string;
}

export interface NextTransit {
    tc: Date;
    start: Date;
    end: Date;
    daysUntil: number;
}

/** Libellé de difficulté instrumentale, déduit du rapport signal/bruit. */
export type DifficultyLabel = 'Facile' | 'Moyen' | 'Difficile' | 'Hors de portée';

export interface Difficulty {
    label: DifficultyLabel;
    color: string;
    snr: number;
    noise: number;
}

/** Statut de faisabilité, valeur du filtre « Faisabilité ». */
export type FeasibilityStatus = 'gerable' | 'delicat' | 'inobservable' | 'hors_portee';

export interface Feasibility {
    label: string;
    color: string;
    status: FeasibilityStatus;
}

/** Exoplanète enrichie des calculs de la nuit sélectionnée. */
export interface AnalysedExoplanet extends Exoplanet {
    transit: TransitOccurrence | null;
    nextTransit: NextTransit | null;
    difficulty: Difficulty;
    feasibility: Feasibility;
    score: number;
}

export type ExoplanetCategory = 'all' | 'confirmed' | 'candidates';
export type TransitFilter = 'all' | 'oui' | 'partiel' | 'horizon' | 'jour';
export type FeasibilityFilter = 'all' | FeasibilityStatus;

/** Critères de filtrage de la liste (les bornes numériques restent des chaînes de champ). */
export interface ExoplanetFilterCriteria {
    exoplanetCategory: ExoplanetCategory;
    transitFilter: TransitFilter;
    difficultyFilter: FeasibilityFilter;
    constellationFilter: string;
    minMag: string;
    maxMag: string;
    minDepth: string;
    maxDepth: string;
    minScore: string;
    maxScore: string;
    filterVisibleCeSoir: boolean;
    filterObservable: boolean;
}

/** Critères par défaut (aucun filtre actif). */
export const DEFAULT_EXOPLANET_FILTERS: ExoplanetFilterCriteria = {
    exoplanetCategory: 'all',
    transitFilter: 'all',
    difficultyFilter: 'all',
    constellationFilter: 'all',
    minMag: '',
    maxMag: '',
    minDepth: '',
    maxDepth: '',
    minScore: '',
    maxScore: '',
    filterVisibleCeSoir: false,
    filterObservable: false,
};

export type ExoplanetSortColumn = 'name' | 'score' | 'type' | 'vMag' | 'depth' | 'transit' | 'difficulty';

export interface ExoplanetSort {
    col: ExoplanetSortColumn;
    dir: 'asc' | 'desc';
}

/** Tri par défaut : meilleur score en premier. */
export const DEFAULT_EXOPLANET_SORT: ExoplanetSort = { col: 'score', dir: 'desc' };

const MS_PER_DAY = 86400000;

/** Classes des pastilles rouges (hors de portée, inobservable). */
const RED_BADGE = 'bg-red-500/20 text-red-400 border-red-500/30';
const AMBER_BADGE = 'bg-amber-500/20 text-amber-400 border-amber-500/30';
const EMERALD_BADGE = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';

/**
 * Indique si les paramètres orbitaux permettent de calculer un transit.
 *
 * @param planet - L'exoplanète ciblée.
 * @returns `false` si la période, l'époque ou la durée est absente ou nulle.
 */
function hasValidEphemeris(planet: Exoplanet): boolean {
    return !(!planet.period || planet.period <= 0 || !planet.epoch || !planet.duration);
}

/**
 * Calcule si un transit de l'exoplanète se produit durant la nuit (midi local à midi local du lendemain)
 * pour la date et le lieu donnés.
 *
 * @param planet - L'exoplanète ciblée
 * @param date - La date d'observation sélectionnée
 * @param loc - Les coordonnées géographiques de l'observateur
 * @returns L'occurrence du transit ou null si aucun transit ne se produit.
 */
export function getTransitOnDate(planet: Exoplanet, date: Date, loc: ObsLocation): TransitOccurrence | null {
    // POURQUOI: Si la période ou l'époque est invalide ou nulle, on évite une boucle infinie de division par zéro.
    if (!hasValidEphemeris(planet)) return null;

    // POURQUOI: On ancre la journée d'observation du midi local de l'observatoire au midi local du lendemain.
    const noon = getLocalNoonAtLongitude(date, loc.lon);
    const jdStart = julianDate(noon);
    const jdEnd = jdStart + 1.0;

    const T0 = planet.epoch;
    const P = planet.period;
    const durDays = planet.duration / 24;

    const nMin = Math.ceil((jdStart - T0 - durDays) / P);
    const nMax = Math.floor((jdEnd - T0 + durDays) / P);

    for (let n = nMin; n <= nMax; n++) {
        const tcJd = T0 + n * P;
        const startJd = tcJd - durDays / 2;
        const endJd = tcJd + durDays / 2;

        if (endJd >= jdStart && startJd <= jdEnd) {
            const tc = dateFromJulian(tcJd);
            const start = dateFromJulian(startJd);
            const end = dateFromJulian(endJd);

            const starAltMid = altAz(planet.ra, planet.dec, loc, tc).altDeg;
            const sunPos = sunPosition(tc);
            const sunAltMid = altAz(sunPos.ra, sunPos.dec, loc, tc).altDeg;

            let observable: TransitObservability = 'oui';
            let observabilityReason = 'Transit entièrement nocturne avec une hauteur cible optimale.';

            if (starAltMid < 0) {
                observable = 'horizon';
                observabilityReason = "La cible est sous l'horizon lors du milieu du transit.";
            } else if (starAltMid < 30) {
                observable = 'partiel';
                observabilityReason =
                    "La cible est basse sur l'horizon (altitude < 30°), extinction atmosphérique importante.";
            }

            if (observable !== 'horizon') {
                if (sunAltMid > -12) {
                    observable = 'jour';
                    observabilityReason = 'Le milieu du transit se produit en plein jour ou au crépuscule.';
                } else {
                    const sunPosStart = sunPosition(start);
                    const sunAltStart = altAz(sunPosStart.ra, sunPosStart.dec, loc, start).altDeg;
                    const sunPosEnd = sunPosition(end);
                    const sunAltEnd = altAz(sunPosEnd.ra, sunPosEnd.dec, loc, end).altDeg;

                    if (sunAltStart > -12 || sunAltEnd > -12) {
                        observable = 'partiel';
                        observabilityReason = 'Le transit commence ou se termine au crépuscule / pendant la journée.';
                    }
                }
            }

            return {
                tc,
                start,
                end,
                starAltMid,
                sunAltMid,
                observable,
                observabilityReason,
            };
        }
    }

    return null;
}

/**
 * Détermine le prochain transit à partir d'une date de référence : le premier dont le milieu
 * est postérieur ou égal à cette date (un transit déjà commencé mais pas encore à mi-parcours compte).
 *
 * @param planet - L'exoplanète ciblée
 * @param fromDate - La date à partir de laquelle chercher
 * @returns Les informations de date et le délai en jours jusqu'au milieu du transit.
 */
export function getNextTransit(planet: Exoplanet, fromDate: Date): NextTransit | null {
    // POURQUOI: Évite une division par zéro ou boucle infinie si les paramètres orbitaux sont absents de la base.
    if (!hasValidEphemeris(planet)) return null;

    const jdNow = julianDate(fromDate);
    const T0 = planet.epoch;
    const P = planet.period;
    const durDays = planet.duration / 24;

    let n = Math.ceil((jdNow - T0) / P);
    let tcJd = T0 + n * P;

    if (tcJd + durDays / 2 < jdNow) {
        n += 1;
        tcJd = T0 + n * P;
    }

    const startJd = tcJd - durDays / 2;
    const endJd = tcJd + durDays / 2;

    return {
        tc: dateFromJulian(tcJd),
        start: dateFromJulian(startJd),
        end: dateFromJulian(endJd),
        daysUntil: tcJd - jdNow,
    };
}

/**
 * Diamètre de l'instrument (mm) : celui du télescope choisi, sinon une estimation par la focale.
 *
 * @param telescopeApertureMm - Diamètre du télescope du catalogue, s'il est connu.
 * @param focalLengthMm - Focale saisie par l'utilisateur.
 * @param focalMultiplier - Réducteur ou Barlow (1 par défaut).
 * @returns Le diamètre retenu, borné entre 20 et 2000 mm pour l'estimation.
 */
export function estimateApertureMm(
    telescopeApertureMm: number | undefined,
    focalLengthMm: number,
    focalMultiplier: number | undefined,
): number {
    if (telescopeApertureMm) return telescopeApertureMm;
    const focal = focalLengthMm * (focalMultiplier ?? 1);
    // POURQUOI : approximation standard (rapport F/D ≈ 6) si aucun modèle n'est sélectionné.
    return Math.max(20, Math.min(2000, Math.round(focal / 6)));
}

/**
 * Bruit de mesure photométrique moyen (mmag) pour une étoile et un instrument.
 *
 * Formule empirique : écart-type de photométrie différentielle sur 2 min de pose au zénith,
 * 1 mmag pour une étoile de magnitude 11 avec 200 mm.
 *
 * @param vMag - Magnitude V de l'étoile hôte.
 * @param apertureMm - Diamètre de l'instrument.
 * @returns Le bruit en mmag, borné entre 0,1 et 100.
 */
export function computeSetupNoise(vMag: number, apertureMm: number): number {
    const noise = 1.0 * (200 / apertureMm) * Math.pow(10, 0.2 * (vMag - 11));
    return Math.min(100, Math.max(0.1, noise));
}

/**
 * Évalue la difficulté instrumentale d'un transit à partir du rapport signal/bruit.
 *
 * @param depthPercent - Profondeur du transit en %.
 * @param vMag - Magnitude V de l'étoile hôte.
 * @param apertureMm - Diamètre de l'instrument.
 * @returns Libellé, classes de pastille, S/B et bruit (mmag).
 */
export function evaluateDifficulty(depthPercent: number, vMag: number, apertureMm: number): Difficulty {
    const depthMmag = depthPercent * 10;
    const noise = computeSetupNoise(vMag, apertureMm);
    const snr = depthMmag / noise;

    if (snr < 2.0) return { label: 'Hors de portée', color: RED_BADGE, snr, noise };
    if (snr < 4.0) return { label: 'Difficile', color: AMBER_BADGE, snr, noise };
    if (snr < 7.0) return { label: 'Moyen', color: EMERALD_BADGE, snr, noise };
    return { label: 'Facile', color: 'bg-green-500/20 text-green-400 border-green-500/30', snr, noise };
}

/**
 * Faisabilité globale de l'observation pour la nuit : combine l'instrument et la visibilité.
 *
 * @param difficulty - Difficulté instrumentale.
 * @param transit - Transit de la nuit, ou null.
 * @returns Libellé, classes de pastille et statut.
 */
export function evaluateFeasibility(difficulty: Difficulty, transit: TransitOccurrence | null): Feasibility {
    if (difficulty.label === 'Hors de portée') {
        return { label: 'Setup insuffisant', color: RED_BADGE, status: 'hors_portee' };
    }
    if (!transit) {
        return {
            label: 'Pas de transit',
            color: 'text-mp-text-muted bg-mp-ui-black/20 border-mp-glass-border',
            status: 'inobservable',
        };
    }
    if (transit.observable === 'horizon' || transit.observable === 'jour') {
        return { label: 'Inobservable', color: RED_BADGE, status: 'inobservable' };
    }
    if (transit.observable === 'partiel' || difficulty.label === 'Difficile') {
        return { label: 'Délicat', color: AMBER_BADGE, status: 'delicat' };
    }
    return { label: 'Gérable', color: EMERALD_BADGE, status: 'gerable' };
}

/**
 * Analyse complète d'une exoplanète pour une nuit, un lieu et un instrument.
 *
 * @param planet - L'exoplanète.
 * @param date - Date d'observation sélectionnée.
 * @param loc - Site de l'observateur.
 * @param apertureMm - Diamètre de l'instrument.
 * @returns L'exoplanète enrichie (transit, prochain transit, difficulté, faisabilité, score).
 */
export function analyseExoplanet(
    planet: Exoplanet,
    date: Date,
    loc: ObsLocation,
    apertureMm: number,
): AnalysedExoplanet {
    const transit = getTransitOnDate(planet, date, loc);
    const nextTransit = getNextTransit(planet, date);
    const difficulty = evaluateDifficulty(planet.depth, planet.vMag, apertureMm);
    const feasibility = evaluateFeasibility(difficulty, transit);
    const score = calculateExoplanetScore(
        difficulty.snr,
        planet.vMag,
        !!transit,
        transit ? transit.observable : 'non',
        feasibility.status,
    );
    return { ...planet, transit, nextTransit, difficulty, feasibility, score };
}

/**
 * Applique la recherche texte et les filtres à la liste analysée.
 *
 * @param planets - Exoplanètes analysées.
 * @param query - Recherche (nom, nom courant, étoile, constellation), insensible aux accents.
 * @param criteria - Filtres actifs.
 * @returns Les exoplanètes retenues, dans le même ordre.
 */
export function filterExoplanets(
    planets: AnalysedExoplanet[],
    query: string,
    criteria: ExoplanetFilterCriteria,
): AnalysedExoplanet[] {
    const cleanString = (str: string) => foldAccents(str).trim();
    const q = cleanString(query);
    return planets.filter((p) => {
        // Filtre par catégorie (confirmée / candidate / toutes)
        if (criteria.exoplanetCategory === 'confirmed' && p.isCandidate) return false;
        if (criteria.exoplanetCategory === 'candidates' && !p.isCandidate) return false;

        if (q) {
            const haystack = cleanString(
                `${p.name} ${p.commonName} ${p.starName} ${getConstellationName(p.constellation)}`,
            );
            if (!haystack.includes(q)) return false;
        }

        // Filtres observabilité
        if (criteria.filterVisibleCeSoir) {
            if (!p.transit || (p.transit.observable !== 'oui' && p.transit.observable !== 'partiel')) return false;
        }
        if (criteria.filterObservable) {
            if (p.feasibility.status === 'inobservable' || p.feasibility.status === 'hors_portee') return false;
        }

        // --- FILTRES AVANCÉS ---
        if (criteria.minMag !== '' && p.vMag < parseFloat(criteria.minMag)) return false;
        if (criteria.maxMag !== '' && p.vMag > parseFloat(criteria.maxMag)) return false;
        if (criteria.minDepth !== '' && p.depth < parseFloat(criteria.minDepth)) return false;
        if (criteria.maxDepth !== '' && p.depth > parseFloat(criteria.maxDepth)) return false;
        if (criteria.minScore !== '' && p.score < parseFloat(criteria.minScore)) return false;
        if (criteria.maxScore !== '' && p.score > parseFloat(criteria.maxScore)) return false;
        if (criteria.transitFilter !== 'all') {
            if (!p.transit || p.transit.observable !== criteria.transitFilter) return false;
        }
        if (criteria.difficultyFilter !== 'all') {
            if (p.feasibility.status !== criteria.difficultyFilter) return false;
        }
        if (criteria.constellationFilter !== 'all' && criteria.constellationFilter !== '') {
            if (p.constellation !== criteria.constellationFilter) return false;
        }

        return true;
    });
}

const FEASIBILITY_RANK: Record<FeasibilityStatus, number> = {
    gerable: 0,
    delicat: 1,
    inobservable: 2,
    hors_portee: 3,
};

/**
 * Instant de début de transit servant au tri : transit de la nuit, sinon prochain transit.
 *
 * @param planet - Exoplanète analysée.
 * @param referenceMs - Instant de référence du délai `daysUntil`.
 * @returns L'instant en ms, `Infinity` sans éphémérides.
 */
function transitSortTime(planet: AnalysedExoplanet, referenceMs: number): number {
    if (planet.transit) return planet.transit.start.getTime();
    if (planet.nextTransit) return referenceMs + planet.nextTransit.daysUntil * MS_PER_DAY;
    return Infinity;
}

/**
 * Trie une copie de la liste selon la colonne choisie.
 *
 * @param planets - Exoplanètes analysées (non modifiées).
 * @param sort - Colonne et sens ; null équivaut au tri par défaut (score décroissant).
 * @param referenceMs - Instant de référence pour le tri par transit à venir.
 * @returns Une nouvelle liste triée.
 */
export function sortExoplanets(
    planets: AnalysedExoplanet[],
    sort: ExoplanetSort | null,
    referenceMs: number,
): AnalysedExoplanet[] {
    const { col, dir } = sort || DEFAULT_EXOPLANET_SORT;
    const sign = dir === 'desc' ? -1 : 1;
    const planetType = (x: AnalysedExoplanet) => (x.isCandidate ? 'Candidate TESS' : 'Confirmée');

    return [...planets].sort((a, b) => {
        switch (col) {
            case 'score':
                return sign * (a.score - b.score);
            case 'name':
                return sign * a.name.localeCompare(b.name);
            case 'type':
                return sign * planetType(a).localeCompare(planetType(b));
            case 'vMag':
                return sign * (a.vMag - b.vMag);
            case 'depth':
                return sign * (a.depth - b.depth);
            case 'transit':
                return sign * (transitSortTime(a, referenceMs) - transitSortTime(b, referenceMs));
            case 'difficulty':
                return (
                    sign *
                    ((FEASIBILITY_RANK[a.feasibility.status] ?? 4) - (FEASIBILITY_RANK[b.feasibility.status] ?? 4))
                );
            default:
                return 0;
        }
    });
}

/**
 * Tri suivant après un clic sur un en-tête : premier clic (asc, desc pour le score), puis
 * inversion, puis retour au tri par défaut.
 *
 * @param current - Tri actif.
 * @param key - Colonne cliquée.
 * @returns Le nouveau tri.
 */
export function nextExoplanetSort(current: ExoplanetSort | null, key: ExoplanetSortColumn): ExoplanetSort {
    if (!current || current.col !== key) return { col: key, dir: key === 'score' ? 'desc' : 'asc' };
    if (current.dir === 'desc') return { col: key, dir: 'asc' };
    return { col: 'score', dir: 'desc' };
}

/**
 * Libellé relatif du prochain transit (« Ce soir », « Demain », « Dans N jours »).
 *
 * @param nextTransit - Prochain transit, ou null.
 * @returns Le libellé affiché dans la colonne Transit.
 */
export function nextTransitLabel(nextTransit: NextTransit | null): string {
    if (!nextTransit) return 'Non disponible';
    if (nextTransit.daysUntil < 1) return 'Ce soir';
    if (nextTransit.daysUntil < 2) return 'Demain';
    return `Dans ${Math.floor(nextTransit.daysUntil)} jours`;
}

/**
 * Info-bulle de la pastille de faisabilité.
 *
 * @param status - Statut de faisabilité.
 * @returns Le texte explicatif.
 */
export function feasibilityTooltip(status: FeasibilityStatus): string {
    if (status === 'gerable')
        return 'Gérable : Cible bien visible ce soir (hauteur > 30°) et parfaitement adaptée à votre matériel.';
    if (status === 'delicat')
        return "Délicat : Cible basse (< 30°) ou proche de la limite d'ouverture / magnitude de votre instrument.";
    if (status === 'inobservable')
        return "Inobservable : Cible sous l'horizon ou n'atteignant pas une hauteur suffisante ce soir.";
    return "Setup insuffisant : Magnitude trop faible ou diamètre d'instrument insuffisant pour cette cible.";
}

// --- Simulateur de transit ---
// POURQUOI : la simulation couvre le transit complet (entrée → sortie) entre les progressions 15 et
// 85, soit 70 % de la durée simulée ; le fond plat va de 30 à 70 (profil trapézoïdal).

/**
 * Flux relatif (%) de l'étoile à une progression du simulateur (profil trapézoïdal).
 *
 * @param progress - Progression du curseur, de 0 à 100.
 * @param depthPercent - Profondeur du transit en %.
 * @returns Le flux, 100 hors transit et `100 - depth` au fond.
 */
export function transitFluxPercent(progress: number, depthPercent: number): number {
    if (progress < 15 || progress > 85) return 100;
    if (progress >= 30 && progress <= 70) return 100 - depthPercent;
    if (progress >= 15 && progress < 30) return 100 - depthPercent * ((progress - 15) / 15);
    if (progress > 70 && progress <= 85) return 100 - depthPercent * ((85 - progress) / 15);
    return 100;
}

/**
 * Ordonnée SVG d'un flux sur la courbe de lumière : 100 % à Y=10, le fond du transit à Y=45.
 *
 * @param flux - Flux relatif en %.
 * @param depthPercent - Profondeur du transit en %.
 * @returns L'ordonnée dans le repère `0 0 280 60`.
 */
export function lightCurveY(flux: number, depthPercent: number): number {
    return 10 + ((100 - flux) / depthPercent) * 35;
}

/**
 * Abscisse SVG d'une progression (de 20 à 260, centre de l'étoile à 140).
 *
 * @param progress - Progression, de 0 à 100.
 * @returns L'abscisse dans le repère du simulateur.
 */
export function simulatorX(progress: number): number {
    return 20 + (progress / 100) * 240;
}

/**
 * Points de la polyligne de la courbe de lumière (101 échantillons).
 *
 * @param depthPercent - Profondeur du transit en %.
 * @returns L'attribut `points` du `<polyline>`.
 */
export function lightCurvePoints(depthPercent: number): string {
    const points: string[] = [];
    for (let i = 0; i <= 100; i++) {
        points.push(`${simulatorX(i)},${lightCurveY(transitFluxPercent(i, depthPercent), depthPercent)}`);
    }
    return points.join(' ');
}

/**
 * Instant simulé correspondant à une progression du curseur.
 *
 * @param start - Début du transit.
 * @param end - Fin du transit.
 * @param progress - Progression, de 0 à 100.
 * @returns L'instant ; 15 → début, 50 → milieu, 85 → fin.
 */
export function simulatedTimeAtProgress(start: Date, end: Date, progress: number): Date {
    const startMs = start.getTime();
    const durationMs = end.getTime() - startMs;
    const totalSimDurationMs = durationMs / 0.7;
    const simStartMs = startMs - 0.15 * totalSimDurationMs;
    return new Date(simStartMs + (progress / 100) * totalSimDurationMs);
}

/**
 * Libellé de phase affiché à côté du curseur.
 *
 * @param progress - Progression, de 0 à 100.
 * @returns Le nom de la phase.
 */
export function transitPhaseLabel(progress: number): string {
    if (progress === 50) return 'Milieu (Transit max)';
    if (progress < 15) return 'Hors transit';
    if (progress >= 15 && progress < 30) return 'Entrée (Ingress)';
    if (progress > 70 && progress <= 85) return 'Sortie (Egress)';
    // TODO: [Corriger] au-delà de 85, le libellé devrait être « Hors transit » (comportement historique conservé).
    return 'Plein transit';
}

/**
 * Rapport des rayons planète / étoile.
 *
 * @param planetRadiusJup - Rayon de la planète en rayons joviens.
 * @param starRadiusSun - Rayon de l'étoile en rayons solaires.
 * @returns R_planète / R_étoile (R_soleil ≈ 9,73 R_jupiter).
 */
export function planetStarRadiusRatio(planetRadiusJup: number, starRadiusSun: number): number {
    return planetRadiusJup / (starRadiusSun * 9.73);
}

/** Pastille de filtre actif (structure de `ActiveFilterChip` de `ObjectFilterBar`). */
export interface ExoplanetFilterChip {
    key: keyof ExoplanetFilterCriteria;
    label: string;
    value: string;
}

const CATEGORY_LABELS: Record<string, string> = { confirmed: 'Confirmées', candidates: 'Candidates TESS' };
const TRANSIT_LABELS: Record<string, string> = { oui: 'Oui', partiel: 'Partiel', horizon: 'Horizon', jour: 'Jour' };
const FEASIBILITY_LABELS: Record<string, string> = {
    gerable: 'Gérable',
    delicat: 'Délicat',
    inobservable: 'Inobservable',
    hors_portee: 'Setup insuffisant',
};

/**
 * Pastilles des filtres actifs, dans l'ordre d'affichage de la barre de filtres.
 *
 * @param criteria - Filtres actifs.
 * @returns Une pastille par filtre différent de sa valeur par défaut (hors bascules d'observabilité).
 */
export function getExoplanetFilterChips(criteria: ExoplanetFilterCriteria): ExoplanetFilterChip[] {
    const chips: ExoplanetFilterChip[] = [];
    const { exoplanetCategory, transitFilter, difficultyFilter, constellationFilter } = criteria;
    if (exoplanetCategory !== 'all') {
        chips.push({
            key: 'exoplanetCategory',
            label: 'Type',
            value: CATEGORY_LABELS[exoplanetCategory] || exoplanetCategory,
        });
    }
    if (transitFilter !== 'all') {
        chips.push({
            key: 'transitFilter',
            label: 'Visibilité',
            value: TRANSIT_LABELS[transitFilter] || transitFilter,
        });
    }
    if (difficultyFilter !== 'all') {
        chips.push({
            key: 'difficultyFilter',
            label: 'Faisabilité',
            value: FEASIBILITY_LABELS[difficultyFilter] || difficultyFilter,
        });
    }
    if (constellationFilter !== 'all') {
        chips.push({
            key: 'constellationFilter',
            label: 'Constellation',
            value: getConstellationName(constellationFilter),
        });
    }
    if (criteria.minMag) chips.push({ key: 'minMag', label: 'Mag Min', value: `${criteria.minMag} V` });
    if (criteria.maxMag) chips.push({ key: 'maxMag', label: 'Mag Max', value: `${criteria.maxMag} V` });
    if (criteria.minDepth) chips.push({ key: 'minDepth', label: 'Prof. Min', value: `${criteria.minDepth}%` });
    if (criteria.maxDepth) chips.push({ key: 'maxDepth', label: 'Prof. Max', value: `${criteria.maxDepth}%` });
    if (criteria.minScore) chips.push({ key: 'minScore', label: 'Score Min', value: criteria.minScore });
    if (criteria.maxScore) chips.push({ key: 'maxScore', label: 'Score Max', value: criteria.maxScore });
    return chips;
}
