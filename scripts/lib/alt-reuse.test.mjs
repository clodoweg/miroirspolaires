// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { findReusableAlt, isValidAlt } from './alt-reuse.mjs';

describe('isValidAlt', () => {
    it('refuse les valeurs vides ou corrompues', () => {
        expect(isValidAlt('Une galaxie')).toBe(true);
        expect(isValidAlt('')).toBe(false);
        expect(isValidAlt(undefined)).toBe(false);
        expect(isValidAlt('<think>…')).toBe(false);
        expect(isValidAlt('deux\nlignes')).toBe(false);
    });
});

describe('findReusableAlt', () => {
    it("réutilise l'alt d'une astrophoto sous une autre année", () => {
        const altData = { '/assets/astrophotographies/2018/332901_raw.jpg': 'M31' };
        expect(findReusableAlt('/assets/astrophotographies/2017/332901_raw.jpg', altData)).toBe('M31');
    });

    it('ignore un alt corrompu et un autre ID', () => {
        const altData = {
            '/assets/astrophotographies/2018/332901_raw.jpg': '<think>',
            '/assets/astrophotographies/2018/999_raw.jpg': 'Autre photo',
        };
        expect(findReusableAlt('/assets/astrophotographies/2017/332901_raw.jpg', altData)).toBeNull();
    });

    it("réutilise pour une miniature l'alt de l'image complète", () => {
        const altData = { '/assets/blog/2026/article/_dsc1-hdr.jpg': 'Un fjord' };
        expect(findReusableAlt('/assets/blog/2026/article/_dsc1-hdr-thumb.jpg', altData)).toBe('Un fjord');
    });

    it('ne rapproche pas deux images de même nom dans des articles différents', () => {
        const altData = { '/assets/blog/2026/article-a/_dsc1.jpg': 'Un fjord' };
        expect(findReusableAlt('/assets/blog/2026/article-b/_dsc1.jpg', altData)).toBeNull();
    });
});
