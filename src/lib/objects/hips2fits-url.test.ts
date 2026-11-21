/**
 * Tests de la construction d'URL de vignette hips2fits côté client.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hips2fitsUrl, SKY_THUMBNAIL_PLACEHOLDER } from './hips2fits-url';

const { activeRoutes } = vi.hoisted(() => ({ activeRoutes: { override: null as unknown[] | null } }));

vi.mock('@/config/upstream-routes', async (importOriginal) => {
    const original = await importOriginal<typeof import('@/config/upstream-routes')>();
    return {
        ...original,
        getActiveRoutes: (serviceId: 'hips2fits') => activeRoutes.override ?? original.getActiveRoutes(serviceId),
    };
});

beforeEach(() => {
    activeRoutes.override = null;
});

function params(url: string): URLSearchParams {
    return new URL(url).searchParams;
}

describe('hips2fitsUrl', () => {
    it('applique les valeurs par défaut (DSS2 couleur, 100 px, champ de 6′ × 2,5)', () => {
        const url = hips2fitsUrl({ ra: 10.684708, dec: 41.26875 });
        expect(url.startsWith('https://alasky.cds.unistra.fr/hips-image-services/hips2fits?')).toBe(true);
        const p = params(url);
        expect(p.get('hips')).toBe('CDS/P/DSS2/color');
        expect(p.get('ra')).toBe('10.68471');
        expect(p.get('dec')).toBe('41.26875');
        expect(p.get('fov')).toBe('0.2500');
        expect(p.get('width')).toBe('100');
        expect(p.get('height')).toBe('100');
        expect(p.get('projection')).toBe('TAN');
        expect(p.get('format')).toBe('jpg');
    });

    it('respecte la taille, le relevé et borne le champ entre 0,1° et 2°', () => {
        const big = params(hips2fitsUrl({ ra: 0, dec: 0, sizeArcmin: 600, sizePx: 200, hips: 'CDS/P/2MASS/color' }));
        expect(big.get('fov')).toBe('2.0000');
        expect(big.get('width')).toBe('200');
        expect(big.get('hips')).toBe('CDS/P/2MASS/color');

        const tiny = params(hips2fitsUrl({ ra: 0, dec: 0, sizeArcmin: 0.5 }));
        expect(tiny.get('fov')).toBe('0.1000');
    });

    it('montre un visuel neutre au lieu d’envoyer les listes vers SkyView', () => {
        activeRoutes.override = [{ id: 'skyview', protocol: 'skyview', baseUrl: 'https://skyview.test/run' }];
        expect(hips2fitsUrl({ ra: 1, dec: 2 })).toBe(SKY_THUMBNAIL_PLACEHOLDER);
    });

    it('passe par SkyView pour un aperçu unique quand hips2fits n’est plus en tête', () => {
        activeRoutes.override = [{ id: 'skyview', protocol: 'skyview', baseUrl: 'https://skyview.test/run' }];
        const url = hips2fitsUrl({ ra: 1.5, dec: -29.8, sizeArcmin: 70, sizePx: 400, allowSkyView: true });
        expect(url.startsWith('https://skyview.test/run?')).toBe(true);
        const p = params(url);
        expect(p.get('Position')).toBe('1.500000,-29.800000');
        expect(p.get('survey')).toBe('DSS2 Red');
        expect(p.get('pixels')).toBe('400');
        expect(p.get('size')).toBe('2.0000');
        expect(p.get('return')).toBe('jpeg');
    });

    it('garde hips2fits pour un aperçu unique quand il est en tête', () => {
        const url = hips2fitsUrl({ ra: 1, dec: 2, sizePx: 400, allowSkyView: true });
        expect(url.startsWith('https://alasky.cds.unistra.fr/hips-image-services/hips2fits?')).toBe(true);
    });

    it('montre un visuel neutre quand aucune route n’est active', () => {
        activeRoutes.override = [];
        expect(hips2fitsUrl({ ra: 1, dec: 2 })).toBe(SKY_THUMBNAIL_PLACEHOLDER);
    });
});
