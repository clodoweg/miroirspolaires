import { describe, it, expect } from 'vitest';
import { socialLinks } from './social';

describe('socialLinks', () => {
    it('liste Instagram, YouTube et Astrobin avec des URL https distinctes', () => {
        expect(socialLinks.map((link) => link.name)).toEqual(['Instagram', 'YouTube', 'Astrobin']);
        const urls = socialLinks.map((link) => link.url);
        expect(urls.every((url) => new URL(url).protocol === 'https:')).toBe(true);
        expect(new Set(urls).size).toBe(urls.length);
    });

    it('fournit un tracé SVG commençant par une commande moveto', () => {
        for (const link of socialLinks) {
            expect(link.path).toMatch(/^M\d/);
        }
    });
});
