import { describe, it, expect } from 'vitest';
import { normalizeCatalog, normalizeForSearch } from './normalize';
import { normalizeCountries } from './data';

describe('Normalization Utilities', () => {
    describe('normalizeCatalog', () => {
        it('removes accents', () => {
            expect(normalizeCatalog('Nébuleuse')).toBe('Nebuleuse');
            expect(normalizeCatalog('Andromède')).toBe('Andromede');
        });

        it('adds space between catalogue prefix and number', () => {
            expect(normalizeCatalog('NGC7635')).toBe('NGC 7635');
            expect(normalizeCatalog('IC123')).toBe('IC 123');
            expect(normalizeCatalog('M31')).toBe('M 31');
        });

        it('does not touch already spaced strings', () => {
            expect(normalizeCatalog('NGC 7635')).toBe('NGC 7635');
        });
    });

    describe('normalizeForSearch', () => {
        it('lowercases, normalizes catalog and removes spaces', () => {
            expect(normalizeForSearch('NGC 7635')).toBe('ngc7635');
            expect(normalizeForSearch("Nébuleuse d'Orion")).toBe("nebuleused'orion");
        });
    });
});

describe('Data Utilities', () => {
    describe('normalizeCountries', () => {
        it('returns array for string', () => {
            expect(normalizeCountries('France')).toEqual(['France']);
        });

        it('returns array for array', () => {
            expect(normalizeCountries(['France', 'Chili'])).toEqual(['France', 'Chili']);
        });

        it('returns ["Inconnu"] for undefined', () => {
            expect(normalizeCountries(undefined)).toEqual(['Inconnu']);
        });
    });
});
