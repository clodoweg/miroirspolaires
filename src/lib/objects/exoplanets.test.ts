/**
 * Tests des calculs purs du planificateur de transits d'exoplanètes : éphémérides, bruit
 * photométrique, faisabilité, filtres, tri et modèle du simulateur.
 */

import { describe, it, expect } from 'vitest';
import { julianDate } from '@/lib/astro/time';
import {
    analyseExoplanet,
    computeSetupNoise,
    DEFAULT_EXOPLANET_FILTERS,
    estimateApertureMm,
    evaluateDifficulty,
    evaluateFeasibility,
    filterExoplanets,
    getExoplanetFilterChips,
    getNextTransit,
    getTransitOnDate,
    lightCurvePoints,
    nextExoplanetSort,
    nextTransitLabel,
    planetStarRadiusRatio,
    simulatedTimeAtProgress,
    sortExoplanets,
    transitFluxPercent,
    transitPhaseLabel,
    type AnalysedExoplanet,
    type Exoplanet,
    type TransitOccurrence,
} from './exoplanets';

const HOUR_MS = 3_600_000;
const SITE = { lat: 45, lon: 0, name: 'Test' };
const MIDNIGHT_JAN_2 = new Date('2026-01-02T00:00:00Z');

function makePlanet(overrides: Partial<Exoplanet> = {}): Exoplanet {
    return {
        id: 'p1',
        name: 'Test b',
        commonName: '',
        starName: 'Test',
        vMag: 11,
        ra: 100,
        dec: 45,
        period: 3,
        // Milieu de transit le 2026-01-02 à 0 h UTC, durée 2,4 h (0,1 jour).
        epoch: julianDate(MIDNIGHT_JAN_2),
        duration: 2.4,
        depth: 1,
        mass: 1,
        radius: 1,
        distance: 100,
        spectralType: 'G2V',
        starRadius: 1,
        constellation: 'Aur',
        isCandidate: false,
        ...overrides,
    };
}

function transit(observable: TransitOccurrence['observable']): TransitOccurrence {
    return {
        tc: MIDNIGHT_JAN_2,
        start: MIDNIGHT_JAN_2,
        end: MIDNIGHT_JAN_2,
        starAltMid: 60,
        sunAltMid: -40,
        observable,
        observabilityReason: '',
    };
}

describe('getNextTransit', () => {
    it("renvoie l'époque elle-même quand on part de l'instant du milieu", () => {
        const next = getNextTransit(makePlanet(), MIDNIGHT_JAN_2);
        expect(next?.tc.toISOString()).toBe('2026-01-02T00:00:00.000Z');
        expect(next?.start.getTime()).toBeCloseTo(MIDNIGHT_JAN_2.getTime() - 1.2 * HOUR_MS, -1);
        expect(next?.end.getTime()).toBeCloseTo(MIDNIGHT_JAN_2.getTime() + 1.2 * HOUR_MS, -1);
        expect(next?.daysUntil).toBeCloseTo(0, 6);
    });

    it('avance d’une période après le milieu du transit', () => {
        const next = getNextTransit(makePlanet(), new Date('2026-01-03T00:00:00Z'));
        expect(next?.tc.getTime()).toBeCloseTo(new Date('2026-01-05T00:00:00Z').getTime(), -1);
        expect(next?.daysUntil).toBeCloseTo(2, 6);
    });

    it('compte en périodes entières depuis une époque ancienne', () => {
        const planet = makePlanet({ epoch: julianDate(MIDNIGHT_JAN_2) - 300 });
        const next = getNextTransit(planet, new Date('2026-01-01T12:00:00Z'));
        expect(next?.tc.getTime()).toBeCloseTo(MIDNIGHT_JAN_2.getTime(), -1);
        expect(next?.daysUntil).toBeCloseTo(0.5, 6);
    });

    it('renvoie null sans éphémérides valides', () => {
        expect(getNextTransit(makePlanet({ period: 0 }), MIDNIGHT_JAN_2)).toBeNull();
        expect(getNextTransit(makePlanet({ period: -1 }), MIDNIGHT_JAN_2)).toBeNull();
        expect(getNextTransit(makePlanet({ epoch: 0 }), MIDNIGHT_JAN_2)).toBeNull();
        expect(getNextTransit(makePlanet({ duration: 0 }), MIDNIGHT_JAN_2)).toBeNull();
    });
});

describe('getTransitOnDate', () => {
    // POURQUOI : getLocalNoonAtLongitude lit la date locale ; midi local évite tout changement de jour.
    const night = new Date(2026, 0, 1, 12);

    it('trouve le transit de minuit, haut dans le ciel et en pleine nuit', () => {
        const result = getTransitOnDate(makePlanet(), night, SITE);
        expect(result?.tc.toISOString()).toBe('2026-01-02T00:00:00.000Z');
        expect(result?.starAltMid).toBeGreaterThan(80);
        expect(result?.sunAltMid).toBeLessThan(-12);
        expect(result?.observable).toBe('oui');
    });

    it('classe en « partiel » une cible basse (< 30°)', () => {
        const result = getTransitOnDate(makePlanet({ dec: -30 }), night, SITE);
        expect(result?.starAltMid).toBeGreaterThan(0);
        expect(result?.starAltMid).toBeLessThan(30);
        expect(result?.observable).toBe('partiel');
    });

    it('classe en « horizon » une cible sous l’horizon', () => {
        expect(getTransitOnDate(makePlanet({ ra: 280, dec: -60 }), night, SITE)?.observable).toBe('horizon');
    });

    it('classe en « jour » un transit à midi d’une cible circumpolaire', () => {
        const planet = makePlanet({ dec: 89, epoch: julianDate(new Date('2026-01-01T14:00:00Z')) });
        expect(getTransitOnDate(planet, night, SITE)?.observable).toBe('jour');
    });

    it('renvoie null quand aucun transit ne tombe dans la nuit', () => {
        const planet = makePlanet({ epoch: julianDate(new Date('2026-01-03T00:00:00Z')) });
        expect(getTransitOnDate(planet, night, SITE)).toBeNull();
        expect(getTransitOnDate(makePlanet({ period: 0 }), night, SITE)).toBeNull();
    });
});

describe('instrument et bruit photométrique', () => {
    it('privilégie le diamètre du télescope, sinon estime F/6 borné', () => {
        expect(estimateApertureMm(150, 600, 1)).toBe(150);
        expect(estimateApertureMm(undefined, 600, undefined)).toBe(100);
        expect(estimateApertureMm(undefined, 1000, 0.5)).toBe(83);
        expect(estimateApertureMm(undefined, 60, 1)).toBe(20);
        expect(estimateApertureMm(undefined, 20000, 1)).toBe(2000);
    });

    it('vaut 1 mmag pour mag 11 et 200 mm, et suit le diamètre et la magnitude', () => {
        expect(computeSetupNoise(11, 200)).toBeCloseTo(1, 10);
        expect(computeSetupNoise(11, 100)).toBeCloseTo(2, 10);
        expect(computeSetupNoise(16, 200)).toBeCloseTo(10, 10);
        expect(computeSetupNoise(30, 20)).toBe(100);
        expect(computeSetupNoise(0, 2000)).toBe(0.1);
    });

    it('classe la difficulté selon le S/B (profondeur en mmag / bruit)', () => {
        expect(evaluateDifficulty(1, 11, 200)).toMatchObject({ label: 'Facile', snr: 10, noise: 1 });
        expect(evaluateDifficulty(0.5, 11, 200).label).toBe('Moyen');
        expect(evaluateDifficulty(0.3, 11, 200).label).toBe('Difficile');
        expect(evaluateDifficulty(0.1, 11, 200).label).toBe('Hors de portée');
    });
});

describe('evaluateFeasibility', () => {
    const easy = evaluateDifficulty(1, 11, 200);
    const hard = evaluateDifficulty(0.3, 11, 200);
    const outOfReach = evaluateDifficulty(0.1, 11, 200);

    it('combine instrument et visibilité', () => {
        expect(evaluateFeasibility(outOfReach, transit('oui')).status).toBe('hors_portee');
        expect(evaluateFeasibility(easy, null)).toMatchObject({ label: 'Pas de transit', status: 'inobservable' });
        expect(evaluateFeasibility(easy, transit('jour'))).toMatchObject({ label: 'Inobservable' });
        expect(evaluateFeasibility(easy, transit('horizon')).status).toBe('inobservable');
        expect(evaluateFeasibility(easy, transit('partiel')).status).toBe('delicat');
        expect(evaluateFeasibility(hard, transit('oui')).status).toBe('delicat');
        expect(evaluateFeasibility(easy, transit('oui'))).toMatchObject({ label: 'Gérable', status: 'gerable' });
    });
});

describe('analyseExoplanet', () => {
    it('enrichit la planète et donne un score positif à un transit idéal', () => {
        const analysed = analyseExoplanet(makePlanet(), new Date(2026, 0, 1, 12), SITE, 200);
        expect(analysed.transit?.observable).toBe('oui');
        expect(analysed.feasibility.status).toBe('gerable');
        expect(analysed.score).toBeGreaterThan(0);
    });

    it('donne un score nul sans transit', () => {
        const planet = makePlanet({ epoch: julianDate(new Date('2026-01-03T00:00:00Z')) });
        expect(analyseExoplanet(planet, new Date(2026, 0, 1, 12), SITE, 200).score).toBe(0);
    });
});

function analysed(overrides: Partial<AnalysedExoplanet>): AnalysedExoplanet {
    return {
        ...makePlanet(),
        transit: null,
        nextTransit: null,
        difficulty: evaluateDifficulty(1, 11, 200),
        feasibility: { label: 'Gérable', color: '', status: 'gerable' },
        score: 50,
        ...overrides,
    };
}

describe('filterExoplanets', () => {
    const list = [
        analysed({ id: 'a', name: 'Kepler b', vMag: 10, depth: 1, score: 80, constellation: 'Lyr' }),
        analysed({ id: 'b', name: 'TOI 1', isCandidate: true, vMag: 13, depth: 0.2, score: 10 }),
        analysed({ id: 'c', name: 'WASP c', transit: transit('jour'), constellation: 'Peg' }),
    ];
    const ids = (result: AnalysedExoplanet[]) => result.map((p) => p.id);

    it('ne filtre rien par défaut', () => {
        expect(ids(filterExoplanets(list, '', DEFAULT_EXOPLANET_FILTERS))).toEqual(['a', 'b', 'c']);
    });

    it('cherche sans tenir compte des accents ni de la casse, y compris le nom de constellation', () => {
        expect(ids(filterExoplanets(list, 'KEPLER', DEFAULT_EXOPLANET_FILTERS))).toEqual(['a']);
        expect(ids(filterExoplanets(list, 'lyre', DEFAULT_EXOPLANET_FILTERS))).toEqual(['a']);
    });

    it('applique catégorie, bornes, visibilité et constellation', () => {
        const base = DEFAULT_EXOPLANET_FILTERS;
        expect(ids(filterExoplanets(list, '', { ...base, exoplanetCategory: 'candidates' }))).toEqual(['b']);
        expect(ids(filterExoplanets(list, '', { ...base, exoplanetCategory: 'confirmed' }))).toEqual(['a', 'c']);
        expect(ids(filterExoplanets(list, '', { ...base, maxMag: '12' }))).toEqual(['a', 'c']);
        expect(ids(filterExoplanets(list, '', { ...base, minDepth: '0.5' }))).toEqual(['a', 'c']);
        expect(ids(filterExoplanets(list, '', { ...base, minScore: '60' }))).toEqual(['a']);
        expect(ids(filterExoplanets(list, '', { ...base, transitFilter: 'jour' }))).toEqual(['c']);
        expect(ids(filterExoplanets(list, '', { ...base, constellationFilter: 'Peg' }))).toEqual(['c']);
    });
});

describe('sortExoplanets et nextExoplanetSort', () => {
    const list = [
        analysed({ id: 'a', name: 'B', score: 10, feasibility: { label: '', color: '', status: 'delicat' } }),
        analysed({ id: 'b', name: 'A', score: 90, nextTransit: null }),
        analysed({
            id: 'c',
            name: 'C',
            score: 50,
            nextTransit: { tc: MIDNIGHT_JAN_2, start: MIDNIGHT_JAN_2, end: MIDNIGHT_JAN_2, daysUntil: 1 },
        }),
    ];
    const ids = (result: AnalysedExoplanet[]) => result.map((p) => p.id);

    it('trie par score décroissant par défaut, sans modifier la liste', () => {
        expect(ids(sortExoplanets(list, null, 0))).toEqual(['b', 'c', 'a']);
        expect(ids(list)).toEqual(['a', 'b', 'c']);
    });

    it('trie par nom, faisabilité et transit à venir (absent en dernier)', () => {
        expect(ids(sortExoplanets(list, { col: 'name', dir: 'asc' }, 0))).toEqual(['b', 'a', 'c']);
        expect(ids(sortExoplanets(list, { col: 'difficulty', dir: 'desc' }, 0))[0]).toBe('a');
        expect(ids(sortExoplanets(list, { col: 'transit', dir: 'asc' }, 0))[0]).toBe('c');
    });

    it('fait tourner le cycle asc → desc → défaut (desc d’abord pour le score)', () => {
        expect(nextExoplanetSort(null, 'name')).toEqual({ col: 'name', dir: 'asc' });
        expect(nextExoplanetSort({ col: 'name', dir: 'asc' }, 'name')).toEqual({ col: 'score', dir: 'desc' });
        expect(nextExoplanetSort({ col: 'name', dir: 'desc' }, 'name')).toEqual({ col: 'name', dir: 'asc' });
        expect(nextExoplanetSort({ col: 'name', dir: 'asc' }, 'score')).toEqual({ col: 'score', dir: 'desc' });
    });
});

describe('libellés', () => {
    it('formule le délai du prochain transit', () => {
        const at = (daysUntil: number) => ({
            tc: MIDNIGHT_JAN_2,
            start: MIDNIGHT_JAN_2,
            end: MIDNIGHT_JAN_2,
            daysUntil,
        });
        expect(nextTransitLabel(null)).toBe('Non disponible');
        expect(nextTransitLabel(at(0.4))).toBe('Ce soir');
        expect(nextTransitLabel(at(1.5))).toBe('Demain');
        expect(nextTransitLabel(at(4.9))).toBe('Dans 4 jours');
    });

    it('construit les pastilles des filtres actifs', () => {
        const chips = getExoplanetFilterChips({
            ...DEFAULT_EXOPLANET_FILTERS,
            exoplanetCategory: 'candidates',
            difficultyFilter: 'hors_portee',
            minMag: '9',
        });
        expect(chips).toEqual([
            { key: 'exoplanetCategory', label: 'Type', value: 'Candidates TESS' },
            { key: 'difficultyFilter', label: 'Faisabilité', value: 'Setup insuffisant' },
            { key: 'minMag', label: 'Mag Min', value: '9 V' },
        ]);
        expect(getExoplanetFilterChips(DEFAULT_EXOPLANET_FILTERS)).toEqual([]);
    });
});

describe('simulateur de transit', () => {
    it('suit un profil trapézoïdal', () => {
        expect(transitFluxPercent(0, 1)).toBe(100);
        expect(transitFluxPercent(15, 1)).toBe(100);
        expect(transitFluxPercent(22.5, 2)).toBe(99);
        expect(transitFluxPercent(50, 1)).toBe(99);
        expect(transitFluxPercent(77.5, 2)).toBe(99);
        expect(transitFluxPercent(90, 1)).toBe(100);
    });

    it('trace 101 points, du bord gauche au fond du transit au centre', () => {
        const points = lightCurvePoints(1).split(' ');
        expect(points).toHaveLength(101);
        expect(points[0]).toBe('20,10');
        expect(points[50]).toBe('140,45');
        expect(points[100]).toBe('260,10');
    });

    it('place le début du transit à 15 %, le milieu à 50 % et la fin à 85 %', () => {
        const start = new Date('2026-01-01T22:00:00Z');
        const end = new Date('2026-01-02T05:00:00Z');
        expect(simulatedTimeAtProgress(start, end, 15).getTime()).toBeCloseTo(start.getTime(), -1);
        expect(simulatedTimeAtProgress(start, end, 50).toISOString()).toBe('2026-01-02T01:30:00.000Z');
        expect(simulatedTimeAtProgress(start, end, 85).getTime()).toBeCloseTo(end.getTime(), -1);
    });

    it('nomme les phases', () => {
        expect(transitPhaseLabel(50)).toBe('Milieu (Transit max)');
        expect(transitPhaseLabel(10)).toBe('Hors transit');
        expect(transitPhaseLabel(20)).toBe('Entrée (Ingress)');
        expect(transitPhaseLabel(40)).toBe('Plein transit');
        expect(transitPhaseLabel(80)).toBe('Sortie (Egress)');
    });

    it('rapporte le rayon planétaire au rayon stellaire (1 R☉ ≈ 9,73 RJ)', () => {
        expect(planetStarRadiusRatio(9.73, 1)).toBeCloseTo(1, 10);
        expect(planetStarRadiusRatio(1, 1)).toBeCloseTo(0.1028, 4);
    });
});
