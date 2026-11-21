/**
 * Tests des versions web pré-générées : clés R2, largeurs à produire et choix d'une version.
 */
import { describe, it, expect } from 'vitest';
import {
    buildWebImageSrcset,
    getWebImageWidths,
    normalizeAssetKey,
    pickWebImageWidth,
    planWebImageWidths,
    webImageKey,
    webImageUrl,
} from './webImages.mjs';

describe('normalizeAssetKey', () => {
    it.each([
        ['../../../assets/blog/2026/trip/photo.jpg', 'blog/2026/trip/photo.jpg'],
        ['/assets/voyages/2025/x/a.jpg', 'voyages/2025/x/a.jpg'],
        ['src/assets/blog/a.jpg?v=3#360', 'blog/a.jpg'],
        ['blog/2026/trip/vue%20du%20fjord.jpg', 'blog/2026/trip/vue du fjord.jpg'],
        ['blog/100%.jpg', 'blog/100%.jpg'],
    ])('%s → %s', (input, expected) => {
        expect(normalizeAssetKey(input)).toBe(expected);
    });

    it('ramène un nom accentué décomposé (NFD) à la forme NFC du manifeste', () => {
        expect(normalizeAssetKey('blog/été.jpg')).toBe('blog/été.jpg');
    });

    it('renvoie une chaîne vide pour une entrée vide', () => {
        expect(normalizeAssetKey(undefined as unknown as string)).toBe('');
    });
});

describe('webImageKey et webImageUrl', () => {
    it('place la version sous web/ en remplaçant l’extension', () => {
        expect(webImageKey('blog/2026/trip/photo.PNG', 800)).toBe('web/blog/2026/trip/photo-w800.jpg');
    });

    it('encode les espaces de la clé pour un srcset valide', () => {
        expect(webImageUrl('https://r2.test/', 'blog/vue du fjord.jpg', 400)).toBe(
            'https://r2.test/web/blog/vue%20du%20fjord-w400.jpg',
        );
    });
});

describe('planWebImageWidths', () => {
    it.each([
        [6000, [400, 800, 1200]],
        [1200, [400, 800, 1200]],
        [1000, [400, 800, 1000]],
        [500, [400, 500]],
        [400, []],
        [250, []],
    ])('source de %i px → %j', (width, expected) => {
        expect(planWebImageWidths(width)).toEqual(expected);
    });
});

describe('getWebImageWidths, buildWebImageSrcset et pickWebImageWidth', () => {
    const manifest = { 'blog/a.jpg': [400, 800, 1200], 'blog/vide.jpg': [] };

    it('trouve les largeurs d’une image du manifeste, quel que soit le format du chemin', () => {
        expect(getWebImageWidths(manifest, '/assets/blog/a.jpg')).toEqual([400, 800, 1200]);
        expect(getWebImageWidths(manifest, 'blog/absente.jpg')).toBeNull();
        expect(getWebImageWidths(manifest, 'blog/vide.jpg')).toBeNull();
    });

    it('construit le srcset R2', () => {
        expect(buildWebImageSrcset('https://r2.test', 'blog/a.jpg', [400, 800])).toBe(
            'https://r2.test/web/blog/a-w400.jpg 400w, https://r2.test/web/blog/a-w800.jpg 800w',
        );
    });

    it('choisit la plus petite version assez large, sinon la plus large', () => {
        expect(pickWebImageWidth([400, 800, 1200], 600)).toBe(800);
        expect(pickWebImageWidth([400, 800, 1200], 400)).toBe(400);
        expect(pickWebImageWidth([400, 800], 1000)).toBe(800);
    });
});
