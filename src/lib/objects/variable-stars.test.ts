/**
 * Tests des calculs purs des étoiles variables : phénomènes, phase, modèle de magnitude,
 * courbe de lumière, compatibilité, faisabilité, filtres, tri et chips actifs.
 *
 * Référence temporelle : JD 2451545.0 = 2000-01-01T12:00:00Z (époque J2000).
 */

import { describe, it, expect } from 'vitest';
import type { Observability } from '@/lib/objects/observation';
import {
    analyseVariableStar,
    evaluateSetupCompatibility,
    filterVariableStars,
    formatVariableStarPeriod,
    getActiveFilterChips,
    getDateAtPhase,
    getFeasibility,
    getLightCurvePoints,
    getMagnitudeAtPhase,
    getRealTimePhase,
    getVariableStarPhenomenaInWindow,
    getVariableStarPhenomenon,
    getVariableTypeShortLabel,
    getVisibilityStatus,
    magnitudeToCurveY,
    nextVariableStarSort,
    sortVariableStars,
    type AnalysedVariableStar,
    type VariableStar,
    type VariableStarFilters,
} from './variable-stars';

const J2000 = 2451545.0;

function makeStar(overrides: Partial<VariableStar> = {}): VariableStar {
    return {
        id: 'algol',
        name: 'Algol',
        starName: 'bet Per',
        constellation: 'Per',
        ra: 47.04,
        dec: 40.96,
        vMagMin: 2,
        vMagMax: 3,
        period: 10,
        epoch: J2000,
        type: 'eclipsing',
        spectralType: 'B8V',
        distance: 90,
        ...overrides,
    };
}

function makeAnalysed(overrides: Partial<AnalysedVariableStar> = {}): AnalysedVariableStar {
    return {
        ...makeStar(),
        obs: {} as Observability,
        currentAlt: 40,
        maxAltNight: 70,
        hoursVisible: 5,
        statusLabel: 'Observable',
        statusColor: 'text-emerald-400',
        comp: { label: 'Entièrement observable', color: '', limitMag: 12 },
        feasibility: { label: 'Gérable', color: '', status: 'gerable' },
        score: 80,
        ...overrides,
    };
}

const NO_FILTERS: VariableStarFilters = {
    query: '',
    filterType: 'all',
    filterVisibleCeSoir: false,
    filterObservable: false,
    minMag: '',
    maxMag: '',
    minAmplitude: '',
    maxAmplitude: '',
    minPeriod: '',
    maxPeriod: '',
    minScore: '',
    maxScore: '',
    visibilityFilter: 'all',
    compatibilityFilter: 'all',
    constellationFilter: 'all',
};

describe('getVariableStarPhenomenon', () => {
    it("place l'éclipse entre 40 % et 60 % du cycle courant", () => {
        // JD 2451547 (03/01/2000 12h) : cycle 0, qui démarre à J2000.
        const phenom = getVariableStarPhenomenon(makeStar(), new Date('2000-01-03T12:00:00Z'));
        expect(phenom?.startDate.toISOString()).toBe('2000-01-05T12:00:00.000Z');
        expect(phenom?.midDate.toISOString()).toBe('2000-01-06T12:00:00.000Z');
        expect(phenom?.endDate.toISOString()).toBe('2000-01-07T12:00:00.000Z');
        expect(phenom?.midLabel).toBe("Milieu de l'éclipse");
    });

    it("donne le pic d'une nova naine à 75 % du cycle", () => {
        const phenom = getVariableStarPhenomenon(makeStar({ type: 'cataclysmique' }), new Date('2000-01-03T12:00:00Z'));
        expect(phenom?.midDate.toISOString()).toBe('2000-01-09T00:00:00.000Z');
        expect(phenom?.startLabel).toBe("Début de l'éruption");
    });

    it('renvoie null sans période ou sans époque', () => {
        expect(getVariableStarPhenomenon(makeStar({ period: 0 }), new Date())).toBeNull();
        expect(getVariableStarPhenomenon(makeStar({ epoch: 0 }), new Date())).toBeNull();
    });
});

describe('getVariableStarPhenomenaInWindow', () => {
    it('ne retient que les éclipses qui chevauchent la fenêtre', () => {
        const result = getVariableStarPhenomenaInWindow(
            makeStar(),
            new Date('2000-01-05T00:00:00Z'),
            new Date('2000-01-06T00:00:00Z'),
        );
        expect(result).toHaveLength(1);
        expect(result[0].label).toBe('Éclipse');
        expect(result[0].start.toISOString()).toBe('2000-01-05T12:00:00.000Z');
    });

    it('renvoie une liste vide pour une période invalide', () => {
        expect(getVariableStarPhenomenaInWindow(makeStar({ period: -1 }), new Date(), new Date())).toEqual([]);
    });
});

describe('getRealTimePhase / getDateAtPhase', () => {
    it('calcule la phase en pourcentage arrondi', () => {
        expect(getRealTimePhase(makeStar(), new Date('2000-01-03T12:00:00Z'))).toBe(20);
        // Avant l'époque : phase ramenée dans [0, 100[.
        expect(getRealTimePhase(makeStar(), new Date('1999-12-30T12:00:00Z'))).toBe(80);
    });

    it('renvoie 50 et la date inchangée sans période', () => {
        const date = new Date('2000-01-03T12:00:00Z');
        expect(getRealTimePhase(makeStar({ period: 0 }), date)).toBe(50);
        expect(getDateAtPhase(makeStar({ period: 0 }), date, 30)).toBe(date);
    });

    it('ancre la phase sur le début du cycle courant', () => {
        const date = new Date('2000-01-03T12:00:00Z');
        expect(getDateAtPhase(makeStar(), date, 50).toISOString()).toBe('2000-01-06T12:00:00.000Z');
        expect(getDateAtPhase(makeStar(), date, 0).toISOString()).toBe('2000-01-01T12:00:00.000Z');
    });
});

describe('getMagnitudeAtPhase', () => {
    it('modélise une binaire à éclipses (principale à 50, secondaire à 0/100)', () => {
        const star = makeStar();
        expect(getMagnitudeAtPhase(star, 50)).toBeCloseTo(2.95);
        expect(getMagnitudeAtPhase(star, 0)).toBeCloseTo(2.25);
        expect(getMagnitudeAtPhase(star, 100)).toBeCloseTo(2.25);
        expect(getMagnitudeAtPhase(star, 25)).toBe(2);
    });

    it('modélise un sursaut de nova naine', () => {
        const star = makeStar({ type: 'cataclysmique', vMagMin: 10, vMagMax: 15 });
        expect(getMagnitudeAtPhase(star, 0)).toBe(15);
        expect(getMagnitudeAtPhase(star, 72.5)).toBeCloseTo(12.5);
        expect(getMagnitudeAtPhase(star, 75)).toBe(10);
        expect(getMagnitudeAtPhase(star, 100)).toBe(15);
    });

    it('modélise une pulsation (mi-amplitude à la phase 0) et une semi-régulière', () => {
        expect(getMagnitudeAtPhase(makeStar({ type: 'cepheid' }), 0)).toBeCloseTo(2.5);
        expect(getMagnitudeAtPhase(makeStar({ type: 'mira' }), 0)).toBeCloseTo(2.5);
        const wave = (0.4 * Math.cos(0.8)) / 1.4;
        expect(getMagnitudeAtPhase(makeStar({ type: 'semiregular' }), 0)).toBeCloseTo(2 + (wave + 1) / 2);
    });
});

describe('courbe de lumière', () => {
    it('projette les magnitudes extrêmes sur y = 10 et y = 45', () => {
        expect(magnitudeToCurveY(2, 2, 3)).toBe(10);
        expect(magnitudeToCurveY(3, 2, 3)).toBe(45);
        // Amplitude nulle : pas de division par zéro.
        expect(magnitudeToCurveY(5, 5, 5)).toBe(10);
    });

    it('génère 101 points de x = 20 à x = 260', () => {
        const points = getLightCurvePoints(makeStar()).split(' ');
        expect(points).toHaveLength(101);
        expect(points[0]).toBe(`20,${10 + 0.25 * 35}`);
        const [midX, midY] = points[50].split(',').map(Number);
        expect(midX).toBe(140);
        expect(midY).toBeCloseTo(10 + 0.95 * 35);
        expect(points[100].startsWith('260,')).toBe(true);
    });
});

describe('evaluateSetupCompatibility', () => {
    // Limite visuelle 12 (seuil de sécurité 11), limite photo 14.
    it.each([
        [2, 10, 'Entièrement observable'],
        [9, 13, 'Observable au maximum'],
        [13, 16, 'Partiellement observable'],
        [15, 17, 'Trop faible pour votre setup'],
    ])('vMag %s-%s → %s', (vMagMin, vMagMax, label) => {
        const result = evaluateSetupCompatibility(vMagMin, vMagMax, 12, 14);
        expect(result.label).toBe(label);
        expect(result.limitMag).toBe(12);
    });
});

describe('getVisibilityStatus / getFeasibility', () => {
    it('classe la visibilité nocturne', () => {
        expect(getVisibilityStatus('circumpolaire', 5, 0).statusLabel).toBe('Circumpolaire');
        expect(getVisibilityStatus('excellent', 45, 3).statusLabel).toBe('Observable');
        expect(getVisibilityStatus('correct', 45, 0).statusLabel).toBe('Très basse');
        expect(getVisibilityStatus('bas', 9, 0).statusLabel).toBe("Sous l'horizon");
        expect(getVisibilityStatus('bas', undefined, 0).statusColor).toBe('text-mp-text-muted');
    });

    it('combine visibilité et compatibilité', () => {
        const full = evaluateSetupCompatibility(2, 3, 12, 14);
        const tooFaint = evaluateSetupCompatibility(15, 17, 12, 14);
        const partial = evaluateSetupCompatibility(13, 16, 12, 14);
        expect(getFeasibility(tooFaint, 'Observable', 60).status).toBe('hors_portee');
        expect(getFeasibility(full, "Sous l'horizon", 60).status).toBe('inobservable');
        expect(getFeasibility(full, 'Observable', undefined).status).toBe('inobservable');
        expect(getFeasibility(full, 'Très basse', 20).status).toBe('delicat');
        expect(getFeasibility(partial, 'Observable', 60).status).toBe('delicat');
        expect(getFeasibility(full, 'Observable', 60)).toMatchObject({ label: 'Gérable', status: 'gerable' });
    });
});

describe('analyseVariableStar', () => {
    it("marque circumpolaire une étoile proche du pôle vue de l'hémisphère nord", () => {
        const location = { name: 'Test', lat: 48, lon: 2 };
        const result = analyseVariableStar(
            makeStar({ dec: 89, ra: 37.95 }),
            location,
            new Date('2024-01-15T20:00:00Z'),
            12,
            14,
        );
        expect(result.obs.tag).toBe('circumpolaire');
        expect(result.statusLabel).toBe('Circumpolaire');
        expect(result.comp.label).toBe('Entièrement observable');
        expect(result.id).toBe('algol');
    });
});

describe('filterVariableStars', () => {
    const stars = [
        makeAnalysed({ id: 'a', name: 'Algol', type: 'eclipsing', vMagMin: 2, vMagMax: 3, period: 2.87, score: 80 }),
        makeAnalysed({
            id: 'b',
            name: 'Mira',
            constellation: 'Cet',
            type: 'mira',
            vMagMin: 3,
            vMagMax: 10,
            period: 332,
            score: 40,
            hoursVisible: 0,
            statusLabel: 'Très basse',
            maxAltNight: 20,
            feasibility: { label: 'Délicat', color: '', status: 'delicat' },
        }),
    ];
    const ids = (filters: Partial<VariableStarFilters>) =>
        filterVariableStars(stars, { ...NO_FILTERS, ...filters }).map((s) => s.id);

    it('ne filtre rien sans critère', () => {
        expect(ids({})).toEqual(['a', 'b']);
    });

    it('recherche sans accents dans le nom, la constellation et le type', () => {
        expect(ids({ query: 'algol' })).toEqual(['a']);
        expect(ids({ query: 'baleine' })).toEqual(['b']);
        expect(ids({ query: 'ECLIPSES' })).toEqual(['a']);
    });

    it('applique type, amplitude, période, score, visibilité, faisabilité et constellation', () => {
        expect(ids({ filterType: 'mira' })).toEqual(['b']);
        expect(ids({ minAmplitude: '5' })).toEqual(['b']);
        expect(ids({ maxPeriod: '10' })).toEqual(['a']);
        expect(ids({ minScore: '50' })).toEqual(['a']);
        expect(ids({ filterVisibleCeSoir: true })).toEqual(['a']);
        expect(ids({ visibilityFilter: 'parfaite' })).toEqual(['a']);
        expect(ids({ visibilityFilter: 'basse' })).toEqual(['b']);
        expect(ids({ compatibilityFilter: 'delicat' })).toEqual(['b']);
        expect(ids({ constellationFilter: 'Per' })).toEqual(['a']);
    });
});

describe('sortVariableStars / nextVariableStarSort', () => {
    const stars = [
        makeAnalysed({ id: 'a', name: 'Beta', score: 10, hoursVisible: 1, type: 'mira' }),
        makeAnalysed({ id: 'b', name: 'Alpha', score: 90, hoursVisible: 6, type: 'eclipsing' }),
    ];

    it('trie par score décroissant par défaut et ne modifie pas le tableau source', () => {
        expect(sortVariableStars(stars, null).map((s) => s.id)).toEqual(['b', 'a']);
        expect(stars.map((s) => s.id)).toEqual(['a', 'b']);
    });

    it('trie par nom, type et visibilité', () => {
        expect(sortVariableStars(stars, { col: 'name', dir: 'asc' }).map((s) => s.id)).toEqual(['b', 'a']);
        expect(sortVariableStars(stars, { col: 'type', dir: 'asc' }).map((s) => s.id)).toEqual(['b', 'a']);
        // Sens inversé hérité : « asc » met d'abord les cibles les plus longtemps visibles.
        expect(sortVariableStars(stars, { col: 'visibility', dir: 'asc' }).map((s) => s.id)).toEqual(['b', 'a']);
    });

    it('fait tourner le tri : nouvelle colonne, inversion, retour au score', () => {
        expect(nextVariableStarSort(null, 'name')).toEqual({ col: 'name', dir: 'asc' });
        expect(nextVariableStarSort({ col: 'name', dir: 'asc' }, 'score')).toEqual({ col: 'score', dir: 'desc' });
        expect(nextVariableStarSort({ col: 'score', dir: 'desc' }, 'score')).toEqual({ col: 'score', dir: 'asc' });
        expect(nextVariableStarSort({ col: 'name', dir: 'asc' }, 'name')).toEqual({ col: 'score', dir: 'desc' });
    });
});

describe('libellés', () => {
    it('formate la période et le libellé court du type', () => {
        expect(formatVariableStarPeriod(2.8673)).toBe('2.87 j');
        expect(formatVariableStarPeriod(0)).toBe('Irrégulière');
        expect(formatVariableStarPeriod(10000)).toBe('Irrégulière');
        expect(getVariableTypeShortLabel('semiregular')).toBe('Semi-régulière');
        expect(getVariableTypeShortLabel('cepheid')).toBe('Céphéide');
    });

    it('produit les chips de filtres actifs dans l’ordre', () => {
        const chips = getActiveFilterChips({
            ...NO_FILTERS,
            filterType: 'cepheid',
            compatibilityFilter: 'hors_portee',
            minMag: '4',
            maxScore: '70',
        });
        expect(chips).toEqual([
            { key: 'filterType', label: 'Type', value: 'Céphéides' },
            { key: 'compatibilityFilter', label: 'Faisabilité', value: 'Setup insuffisant' },
            { key: 'minMag', label: 'Mag Min', value: '4 V' },
            { key: 'maxScore', label: 'Score Max', value: '70' },
        ]);
    });
});
