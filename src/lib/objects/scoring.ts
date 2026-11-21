/**
 * Normalise l'état de faisabilité en un niveau standardisé.
 */
export type FeasibilityLevel = 'gerable' | 'delicat' | 'inobservable' | 'hors_portee';

function parseFeasibilityLevel(input: string | undefined): FeasibilityLevel {
    if (!input) return 'inobservable';
    const s = input.toLowerCase();
    if (s.includes('gerable') || s.includes('gérable')) return 'gerable';
    if (s.includes('delicat') || s.includes('délicat')) return 'delicat';
    if (s.includes('hors') || s.includes('insuffisant') || s.includes('portee')) return 'hors_portee';
    return 'inobservable';
}

/**
 * Coefficient de faisabilité (facteur principal du score global pour tous les outils).
 * - Gérable = 1.0 (score plein potentiel 0-100)
 * - Délicat = 0.5 (score plafonné/pondéré à 50%)
 * - Inobservable / Hors de portée = 0.0 (score strictly 0)
 */
function getFeasibilityCoeff(level: FeasibilityLevel): number {
    switch (level) {
        case 'gerable':
            return 1.0;
        case 'delicat':
            return 0.5;
        case 'hors_portee':
        case 'inobservable':
        default:
            return 0.0;
    }
}

/**
 * Calcul du score d'observabilité pour une exoplanète (0 à 100).
 * RÈGLE STRICTE: Si aucun transit n'est observable ce soir (ou transit de jour/sous l'horizon), le score est STRICTEMENT 0.
 * La faisabilité matérielle et nocturne est le facteur principal.
 */
export function calculateExoplanetScore(
    snr: number,
    vMag: number,
    hasTransitTonight: boolean,
    transitObservable: 'oui' | 'partiel' | 'non' | 'horizon' | 'jour',
    feasibilityInput?: string,
): number {
    // 1. Condition de transit obligatoire : Si pas de transit observable ce soir -> SCORE 0
    if (
        !hasTransitTonight ||
        transitObservable === 'non' ||
        transitObservable === 'horizon' ||
        transitObservable === 'jour'
    ) {
        return 0;
    }

    // 2. Facteur principal : Faisabilité instrumentale & environnementale
    const feasibilityLevel = parseFeasibilityLevel(feasibilityInput);
    const coeff = getFeasibilityCoeff(feasibilityLevel);
    if (coeff === 0) return 0;

    // 3. Sous-critères photométriques
    let snrScore: number;
    if (snr >= 10) snrScore = 40;
    else if (snr >= 5) snrScore = 30;
    else if (snr >= 3) snrScore = 15;
    else snrScore = 5;

    let magScore: number;
    if (vMag <= 9) magScore = 30;
    else if (vMag <= 11) magScore = 20;
    else if (vMag <= 13) magScore = 10;
    else magScore = 5;

    const transitWindowScore = transitObservable === 'oui' ? 30 : 15;

    const rawScore = Math.min(100, snrScore + magScore + transitWindowScore);
    return Math.round(rawScore * coeff);
}

/**
 * Calcul du score d'observabilité pour un astéroïde (0 à 100).
 * La faisabilité (altitude nocturne + magnitude limite) est le facteur principal.
 */
export function calculateAsteroidScore(
    hoursVisible: number,
    apparentMag: number,
    isPhaOrNea: boolean,
    feasibilityInput?: string,
): number {
    const feasibilityLevel = parseFeasibilityLevel(feasibilityInput);
    const coeff = getFeasibilityCoeff(feasibilityLevel);
    if (coeff === 0) return 0;

    let visScore = 0;
    if (hoursVisible >= 5) visScore = 40;
    else if (hoursVisible >= 3) visScore = 30;
    else if (hoursVisible >= 1) visScore = 15;
    else if (hoursVisible > 0) visScore = 5;

    let magScore = 0;
    if (apparentMag <= 10) magScore = 35;
    else if (apparentMag <= 12) magScore = 25;
    else if (apparentMag <= 14) magScore = 15;
    else if (apparentMag <= 16) magScore = 5;

    const typeScore = isPhaOrNea ? 25 : 10;

    const rawScore = Math.min(100, visScore + magScore + typeScore);
    return Math.round(rawScore * coeff);
}

/**
 * Calcul du score d'observabilité pour une comète (0 à 100).
 * La faisabilité est le facteur principal.
 */
export function calculateCometScore(
    hoursVisible: number,
    apparentMag: number,
    distSun: number,
    distEarth: number,
    feasibilityInput?: string,
): number {
    const feasibilityLevel = parseFeasibilityLevel(feasibilityInput);
    const coeff = getFeasibilityCoeff(feasibilityLevel);
    if (coeff === 0) return 0;

    let visScore = 0;
    if (hoursVisible >= 5) visScore = 40;
    else if (hoursVisible >= 3) visScore = 30;
    else if (hoursVisible >= 1) visScore = 15;
    else if (hoursVisible > 0) visScore = 5;

    let magScore = 0;
    if (apparentMag <= 8) magScore = 35;
    else if (apparentMag <= 10) magScore = 25;
    else if (apparentMag <= 12) magScore = 15;
    else if (apparentMag <= 14) magScore = 5;

    let distScore: number;
    if (distSun < 1.5 && distEarth < 1.5) distScore = 25;
    else if (distSun < 2.5) distScore = 15;
    else distScore = 5;

    const rawScore = Math.min(100, visScore + magScore + distScore);
    return Math.round(rawScore * coeff);
}

/**
 * Calcul du score d'observabilité pour une étoile variable (0 à 100).
 * La faisabilité (compatibilité instrumentale & visibilité nocturne) est le facteur principal.
 */
export function calculateVariableStarScore(
    hoursVisible: number,
    vMagMin: number,
    vMagMax: number,
    feasibilityInput?: string,
): number {
    const feasibilityLevel = parseFeasibilityLevel(feasibilityInput);
    const coeff = getFeasibilityCoeff(feasibilityLevel);
    if (coeff === 0) return 0;

    let visScore = 0;
    if (hoursVisible >= 4) visScore = 40;
    else if (hoursVisible >= 2) visScore = 25;
    else if (hoursVisible > 0) visScore = 10;

    const amplitude = Math.abs(vMagMax - vMagMin);
    let ampScore: number;
    if (amplitude >= 3.0) ampScore = 30;
    else if (amplitude >= 1.5) ampScore = 20;
    else if (amplitude >= 0.5) ampScore = 10;
    else ampScore = 5;

    let magScore: number;
    if (vMagMin <= 6) magScore = 30;
    else if (vMagMin <= 9) magScore = 20;
    else if (vMagMin <= 12) magScore = 10;
    else magScore = 5;

    const rawScore = Math.min(100, visScore + ampScore + magScore);
    return Math.round(rawScore * coeff);
}
