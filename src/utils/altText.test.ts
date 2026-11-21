import { describe, it, expect, vi } from 'vitest';

vi.mock('../data/alt.json', () => ({
    default: {
        '/assets/blog/milky-way.jpg': 'La Voie Lactée depuis les Alpes',
        '/assets/astrophotographies/m31.jpg': "Galaxie d'Andromède M31",
        'images/logo-mp.png': 'Logo Miroirs Polaires',
    },
}));

import { getAltText } from './altText';

describe('getAltText', () => {
    it('returns alt text for an exact /assets/ path', () => {
        expect(getAltText('/assets/blog/milky-way.jpg')).toBe('La Voie Lactée depuis les Alpes');
    });

    it('normalizes src/assets/ path to /assets/', () => {
        expect(getAltText('src/assets/blog/milky-way.jpg')).toBe('La Voie Lactée depuis les Alpes');
    });

    it('normalizes relative paths (../../assets/...)', () => {
        expect(getAltText('../../assets/blog/milky-way.jpg')).toBe('La Voie Lactée depuis les Alpes');
    });

    it('strips query parameters before lookup', () => {
        expect(getAltText('/assets/blog/milky-way.jpg?v=abc123')).toBe('La Voie Lactée depuis les Alpes');
    });

    it('resolves an ImageMetadata object via its src property', () => {
        const meta = { src: '/assets/astrophotographies/m31.jpg', width: 800, height: 600, format: 'jpg' as const };
        expect(getAltText(meta)).toBe("Galaxie d'Andromède M31");
    });

    it('returns the fallback string when no entry is found', () => {
        expect(getAltText('/assets/missing.jpg', 'Image manquante')).toBe('Image manquante');
    });

    it('returns empty string by default when no entry and no fallback', () => {
        expect(getAltText('/assets/missing.jpg')).toBe('');
    });

    it('returns fallback for null or undefined src', () => {
        expect(getAltText(null, 'fallback')).toBe('fallback');
        expect(getAltText(undefined, 'fallback')).toBe('fallback');
    });

    it('returns empty string for null with no fallback', () => {
        expect(getAltText(null)).toBe('');
    });

    it('accepte une clé brute hors de /assets/ si elle existe dans alt.json', () => {
        expect(getAltText('images/logo-mp.png', 'repli')).toBe('Logo Miroirs Polaires');
    });

    it('renvoie le repli pour un chemin hors de /assets/ absent de alt.json', () => {
        expect(getAltText('images/inconnue.png', 'repli')).toBe('repli');
    });

    it('extrait le chemin /assets/ d’une URL absolue', () => {
        expect(getAltText('https://www.miroirspolaires.fr/assets/blog/milky-way.jpg')).toBe(
            'La Voie Lactée depuis les Alpes',
        );
    });

    it('renvoie le repli pour un objet sans propriété src', () => {
        const objetSansSrc = { width: 10, height: 10 } as unknown as Parameters<typeof getAltText>[0];
        expect(getAltText(objetSansSrc, 'repli')).toBe('repli');
    });
});
