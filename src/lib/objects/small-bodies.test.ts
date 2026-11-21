import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCATION } from '@/lib/objects/observation';
import {
    classifyAsteroid,
    cometOrbitType,
    commonSortValue,
    evaluateSetupFeasibility,
    feasibilityTitle,
    filterByQuickToggles,
    filterByRange,
    filterBySelects,
    filterByText,
    getVisibilityStatus,
    isExactQueryMatch,
    isNearEarthAsteroid,
    matchesAsteroidTypeFilter,
    nextSortState,
    observeSmallBody,
    optionLabel,
    sortSmallBodies,
    type FeasibilityEvaluation,
    type ObservedSmallBody,
} from './small-bodies';

const LIMITS = { limitMag: 14, limitMagPhoto: 20 };

function feasibility(mag: number, maxAlt: number | undefined): FeasibilityEvaluation {
    return evaluateSetupFeasibility(mag, maxAlt, LIMITS.limitMag, LIMITS.limitMagPhoto);
}

function body(overrides: Partial<ObservedSmallBody>): ObservedSmallBody {
    return {
        name: 'Corps',
        id: 'X',
        constellation: 'Ori',
        score: 50,
        hoursVisible: 2,
        maxAltNight: 45,
        feasibility: feasibility(10, 45),
        orbit: { apparentMag: 10 },
        ...overrides,
    };
}

describe('evaluateSetupFeasibility', () => {
    it('classe une cible jamais au-dessus de 10° comme inobservable', () => {
        expect(feasibility(5, undefined).status).toBe('inobservable');
        expect(feasibility(5, 9.9).label).toBe('Inobservable');
    });

    it('signale un setup insuffisant au-delà de la limite photo', () => {
        expect(feasibility(20.1, 60).status).toBe('hors_portee');
    });

    it('juge délicate une cible basse ou proche de la limite visuelle', () => {
        expect(feasibility(10, 25).status).toBe('delicat');
        expect(feasibility(12.6, 60).status).toBe('delicat');
    });

    it('juge gérable une cible haute et brillante', () => {
        const verdict = feasibility(12.5, 30);
        expect(verdict).toEqual({
            label: 'Gérable',
            color: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5',
            status: 'gerable',
        });
    });

    it('fournit une infobulle par verdict', () => {
        expect(feasibilityTitle('gerable')).toMatch(/^Gérable/);
        expect(feasibilityTitle('hors_portee')).toMatch(/^Setup insuffisant/);
    });
});

describe('getVisibilityStatus', () => {
    it('distingue circumpolaire, observable, basse et invisible', () => {
        expect(getVisibilityStatus(true, 5, 0).statusLabel).toBe('Circumpolaire');
        expect(getVisibilityStatus(false, 30, 1).statusLabel).toBe('Observable');
        expect(getVisibilityStatus(false, 30, 0).statusLabel).toBe('Basse');
        expect(getVisibilityStatus(false, 10, 0).statusColor).toBe('text-yellow-400/80');
        expect(getVisibilityStatus(false, 9, 0)).toEqual({
            statusLabel: 'Invisible',
            statusColor: 'text-mp-text-muted',
        });
    });
});

describe('observeSmallBody', () => {
    it('trouve circumpolaire une cible proche du pôle sud depuis le Chili', () => {
        const observation = observeSmallBody(
            { ra: 0, dec: -89, apparentMag: 30 },
            DEFAULT_LOCATION,
            new Date('2026-10-28T12:00:00Z'),
            LIMITS,
        );
        expect(observation.statusLabel).toBe('Circumpolaire');
        expect(observation.constellation).toBe('Oct');
        expect(observation.feasibility.status).toBe('hors_portee');
    });
});

describe('recherche', () => {
    it('reconnaît une désignation exacte sans espaces ni accents', () => {
        expect(isExactQueryMatch('hale bopp', 'Hale-Bopp', 'C1995O1')).toBe(false);
        expect(isExactQueryMatch('halebopp', 'Hale Bopp', 'C1995O1')).toBe(true);
        expect(isExactQueryMatch('c1995 o1', 'Hale-Bopp', 'C1995O1')).toBe(true);
    });

    it('filtre sur le nom, la désignation ou la constellation', () => {
        const items = [
            body({ name: 'Éros', id: '00433' }),
            body({ name: 'Icarus', id: '01566', constellation: 'Cyg' }),
        ];
        const names = (q: string) =>
            filterByText(items, q, (code) => (code === 'Cyg' ? 'Cygne' : 'Orion')).map((i) => i.name);
        expect(names('eros')).toEqual(['Éros']);
        expect(names('1566')).toEqual(['Icarus']);
        expect(names('cygne')).toEqual(['Icarus']);
        expect(names('  ')).toEqual(['Éros', 'Icarus']);
    });
});

describe('filtres', () => {
    const items = [body({ score: 10 }), body({ score: 50 }), body({ score: 90 })];

    it('applique une plage saisie en texte et ignore les bornes vides ou invalides', () => {
        const scores = (min: string, max: string) => filterByRange(items, min, max, (i) => i.score).map((i) => i.score);
        expect(scores('20', '')).toEqual([50, 90]);
        expect(scores('', '50')).toEqual([10, 50]);
        expect(scores('abc', '')).toEqual([10, 50, 90]);
    });

    it('applique les bascules rapides', () => {
        const hidden = body({ hoursVisible: 0 });
        const tooFaint = body({ feasibility: feasibility(25, 60) });
        expect(filterByQuickToggles([hidden, tooFaint], true, false)).toEqual([tooFaint]);
        expect(filterByQuickToggles([hidden, tooFaint], false, true)).toEqual([hidden]);
    });

    it('applique visibilité, faisabilité et constellation', () => {
        const high = body({ maxAltNight: 70 });
        const low = body({ maxAltNight: 20, constellation: 'Cyg', feasibility: feasibility(10, 20) });
        const hidden = body({ hoursVisible: 0 });
        expect(filterBySelects([high, low, hidden], 'parfaite', 'all', 'all')).toEqual([high]);
        expect(filterBySelects([high, low, hidden], 'basse', 'all', 'all')).toEqual([low]);
        expect(filterBySelects([high, low, hidden], 'invisible', 'all', 'all')).toEqual([hidden]);
        expect(filterBySelects([high, low, hidden], 'all', 'delicat', 'all')).toEqual([low]);
        expect(filterBySelects([high, low, hidden], 'all', 'all', 'Cyg')).toEqual([low]);
    });

    it('retrouve le libellé d’une option ou la valeur brute', () => {
        const options = [{ value: 'a', label: 'Alpha' }];
        expect(optionLabel(options, 'a')).toBe('Alpha');
        expect(optionLabel(options, 'z')).toBe('z');
    });
});

describe('tri', () => {
    it('alterne ascendant, descendant puis revient au score décroissant', () => {
        const first = nextSortState(null, 'mag');
        expect(first).toEqual({ col: 'mag', dir: 'asc' });
        const second = nextSortState({ col: 'mag', dir: 'desc' }, 'mag');
        expect(second).toEqual({ col: 'mag', dir: 'asc' });
        expect(nextSortState(first, 'mag')).toEqual({ col: 'score', dir: 'desc' });
        expect(nextSortState(first, 'score')).toEqual({ col: 'score', dir: 'desc' });
    });

    it('trie par score décroissant par défaut et renvoie une copie', () => {
        const items = [body({ score: 10 }), body({ score: 90 }), body({ score: 50 })];
        const sorted = sortSmallBodies(items, null, commonSortValue);
        expect(sorted.map((i) => i.score)).toEqual([90, 50, 10]);
        expect(items.map((i) => i.score)).toEqual([10, 90, 50]);
    });

    it('trie les textes avec localeCompare et place les NaN comme 999', () => {
        const items = [body({ name: 'Zeta', orbit: { apparentMag: NaN } }), body({ name: 'Alpha' })];
        expect(sortSmallBodies(items, { col: 'name', dir: 'asc' }, commonSortValue).map((i) => i.name)).toEqual([
            'Alpha',
            'Zeta',
        ]);
        expect(sortSmallBodies(items, { col: 'mag', dir: 'desc' }, commonSortValue)[0].name).toBe('Zeta');
    });

    it('classe la faisabilité de la plus favorable à la moins favorable', () => {
        expect(commonSortValue(body({ feasibility: feasibility(10, 45) }), 'compatibility')).toBe(0);
        expect(commonSortValue(body({ feasibility: feasibility(25, 45) }), 'compatibility')).toBe(3);
        expect(commonSortValue(body({ maxAltNight: undefined }), 'visibility')).toBe(-90);
    });
});

describe('classification', () => {
    it('type d’orbite cométaire', () => {
        expect(cometOrbitType(0.89)).toBe('Périodique');
        expect(cometOrbitType(0.9)).toBe('Non-périodique');
    });

    it('classe les astéroïdes', () => {
        expect(isNearEarthAsteroid(1, 0.5)).toBe(true);
        expect(classifyAsteroid({ a: 1, e: 0.5, h: 20 })).toBe('PHA');
        expect(classifyAsteroid({ a: 1, e: 0.5, h: 23 })).toBe('NEA');
        expect(classifyAsteroid({ a: 13.7, e: 0.38, h: 6 })).toBe('Distant');
        expect(classifyAsteroid({ a: 3, e: 0.1, h: 6 })).toBe('Unusual');
    });

    it('filtre par type, « distant » incluant les NEA à grand demi-axe', () => {
        const farNea = { a: 6, e: 0.9, h: 23 };
        expect(classifyAsteroid(farNea)).toBe('NEA');
        expect(matchesAsteroidTypeFilter(farNea, 'distant')).toBe(true);
        expect(matchesAsteroidTypeFilter(farNea, 'nea')).toBe(true);
        expect(matchesAsteroidTypeFilter({ a: 1, e: 0.5, h: 20 }, 'nea')).toBe(false);
        expect(matchesAsteroidTypeFilter({ a: 3, e: 0.1, h: 6 }, 'inhabituel')).toBe(true);
        expect(matchesAsteroidTypeFilter({ a: 3, e: 0.1, h: 6 }, 'all')).toBe(true);
    });
});
