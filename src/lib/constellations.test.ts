import { describe, it, expect } from 'vitest';
import { getConstellationName } from './constellations';

describe('Constellation Utilities', () => {
    it('returns the French name for a valid IAU abbreviation', () => {
        expect(getConstellationName('And')).toBe('Andromède');
        expect(getConstellationName('Ori')).toBe('Orion');
        expect(getConstellationName('UMa')).toBe('Grande Ourse');
    });

    it('returns the original string if abbreviation is not found', () => {
        expect(getConstellationName('XYZ')).toBe('XYZ');
    });

    it('handles Unknown or empty strings', () => {
        expect(getConstellationName('Unknown')).toBe('Unknown');
        expect(getConstellationName('')).toBe('');
    });

    it('trims whitespace from abbreviations', () => {
        expect(getConstellationName('  And  ')).toBe('Andromède');
    });
});
