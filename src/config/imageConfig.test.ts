import { describe, it, expect } from 'vitest';
import { IMAGE_CONFIG } from './imageConfig.mjs';

describe('IMAGE_CONFIG', () => {
    it('déclare dans CACHED_VARIANTS chaque couple largeur × qualité du srcset', () => {
        const cachedKeys = new Set(IMAGE_CONFIG.CACHED_VARIANTS.map(([width, quality]) => `${width}:${quality}`));
        for (const width of IMAGE_CONFIG.WIDTHS) {
            expect(cachedKeys.has(`${width}:${IMAGE_CONFIG.QUALITY.DESKTOP}`)).toBe(true);
            expect(cachedKeys.has(`${width}:${IMAGE_CONFIG.QUALITY.MOBILE}`)).toBe(true);
        }
    });

    it('ne déclare aucune variante en double', () => {
        const keys = IMAGE_CONFIG.CACHED_VARIANTS.map(([width, quality]) => `${width}:${quality}`);
        expect(new Set(keys).size).toBe(keys.length);
    });

    it('garde des largeurs croissantes plafonnées à 1200 px et un repli parmi elles', () => {
        expect([...IMAGE_CONFIG.WIDTHS].sort((a, b) => a - b)).toEqual(IMAGE_CONFIG.WIDTHS);
        expect(Math.max(...IMAGE_CONFIG.WIDTHS)).toBeLessThanOrEqual(1200);
        expect(IMAGE_CONFIG.WIDTHS).toContain(IMAGE_CONFIG.DEFAULT_WIDTH);
    });

    it('fournit des attributs sizes terminés par une largeur fixe', () => {
        expect(IMAGE_CONFIG.SIZES.GRID).toMatch(/, \d+px$/);
        expect(IMAGE_CONFIG.SIZES.DEFAULT).toMatch(/, \d+px$/);
    });
});
