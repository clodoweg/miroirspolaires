// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildAstroAlt, planAstroAlts } from './alt-coverage.mjs';

describe('buildAstroAlt', () => {
    it('reprend le titre et le nom français de la constellation', () => {
        expect(buildAstroAlt({ Title: 'Nébuleuse d’Orion (M42)', Constellation: 'Ori' })).toBe(
            'Nébuleuse d’Orion (M42), astrophotographie (constellation : Orion).',
        );
    });

    it('se passe de la constellation si elle est inconnue', () => {
        expect(buildAstroAlt({ Title: 'M31', Constellation: '' })).toBe('M31, astrophotographie.');
        expect(buildAstroAlt({ Title: 'M31', Constellation: 'Unknown' })).toBe('M31, astrophotographie.');
    });
});

describe('planAstroAlts', () => {
    const row = { ID: '10', Title: 'M31', Uploaded: '2026-01-02', Constellation: 'And' };
    const key = '/assets/astrophotographies/2026/10_raw.jpg';

    it('ne remplace jamais un alt existant', () => {
        expect(planAstroAlts([row], { [key]: 'Mon alt' })).toEqual({});
    });

    it("préfère l'alt déjà écrit sous une autre année", () => {
        const altData = { '/assets/astrophotographies/2025/10_raw.jpg': 'Alt relu' };
        expect(planAstroAlts([row], altData)).toEqual({ [key]: 'Alt relu' });
    });

    it('construit un alt pour une nouvelle photo', () => {
        expect(planAstroAlts([row], {})[key]).toMatch(/^M31, astrophotographie \(constellation : /);
    });
});
