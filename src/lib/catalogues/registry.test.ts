/**
 * Tests du registre des catalogues : cohérence des définitions et recherche par slug.
 */

import { describe, it, expect } from 'vitest';
import { CATALOGUES, getCatalogue } from './registry';
import { CATALOGUE_EPOCH } from './precess';

describe('registre des catalogues', () => {
    it('a des slugs uniques, chacun doté d’une époque de précession', () => {
        const slugs = CATALOGUES.map((c) => c.slug);
        expect(new Set(slugs).size).toBe(slugs.length);
        for (const slug of slugs) expect(CATALOGUE_EPOCH[slug]).toBeTypeOf('number');
    });

    it('fournit les listes d’identifiants des catalogues SIMBAD', () => {
        const messier = getCatalogue('messier');
        expect(messier?.source).toBe('simbad-list');
        expect(messier?.ids).toHaveLength(110);
        expect(messier?.ids?.[0]).toBe('M 1');
        expect(messier?.ids?.[109]).toBe('M 110');

        const caldwell = getCatalogue('caldwell');
        expect(caldwell?.source).toBe('simbad-list');
        expect(caldwell?.ids?.length).toBeGreaterThan(100);
        expect(caldwell?.ids).toContain('NGC 188');
    });

    it('renvoie la définition par slug ou undefined pour un slug inconnu', () => {
        expect(getCatalogue('sharpless')?.source).toBe('vizier-sharpless');
        expect(getCatalogue('inexistant')).toBeUndefined();
    });
});
