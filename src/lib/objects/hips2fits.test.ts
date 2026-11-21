/**
 * Tests des vignettes multi-relevés hips2fits et du choix du champ par défaut.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSkyImages, pickFovDeg } from './hips2fits';

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

describe('buildSkyImages', () => {
    it('produit une image pleine taille et une vignette par relevé', () => {
        const images = buildSkyImages(83.822, -5.391, 1.5);
        expect(images.map((i) => i.id)).toEqual([
            'dss2-color',
            '2mass-color',
            'sdss9-color',
            'allwise-color',
            'finkbeiner-halpha',
            'mellinger-color',
        ]);
        const first = images[0];
        expect(first.fovDeg).toBe(1.5);
        const full = new URL(first.url).searchParams;
        expect(full.get('hips')).toBe('CDS/P/DSS2/color');
        expect(full.get('ra')).toBe('83.822000');
        expect(full.get('dec')).toBe('-5.391000');
        expect(full.get('fov')).toBe('1.5000');
        expect(full.get('width')).toBe('800');
        expect(full.get('projection')).toBe('TAN');
        const thumb = new URL(first.thumbUrl ?? '').searchParams;
        expect(thumb.get('width')).toBe('220');
        expect(thumb.get('height')).toBe('220');
    });
});

describe('buildSkyImages sans hips2fits', () => {
    it('propose une seule image SkyView en DSS2 avec le bon champ', () => {
        activeRoutes.override = [{ id: 'skyview', protocol: 'skyview', baseUrl: 'https://skyview.test/run' }];
        const images = buildSkyImages(10.6847, 41.2687, 1.5);
        expect(images.map((image) => image.id)).toEqual(['dss2-red']);
        const full = new URL(images[0].url);
        expect(full.origin + full.pathname).toBe('https://skyview.test/run');
        expect(full.searchParams.get('Position')).toBe('10.684700,41.268700');
        expect(full.searchParams.get('survey')).toBe('DSS2 Red');
        expect(full.searchParams.get('size')).toBe('1.5000');
        expect(full.searchParams.get('pixels')).toBe('800');
        expect(full.searchParams.get('return')).toBe('jpeg');
        expect(new URL(images[0].thumbUrl ?? '').searchParams.get('pixels')).toBe('220');
    });

    it('ne propose rien quand aucune route n’est active', () => {
        activeRoutes.override = [];
        expect(buildSkyImages(1, 2, 1)).toEqual([]);
    });
});

describe('pickFovDeg', () => {
    it('renvoie 0,5° quand la dimension est inconnue ou invalide', () => {
        expect(pickFovDeg()).toBe(0.5);
        expect(pickFovDeg(0)).toBe(0.5);
        expect(pickFovDeg(-3)).toBe(0.5);
        expect(pickFovDeg(Number.NaN)).toBe(0.5);
    });

    it('triple la dimension et la convertit en degrés, bornée entre 0,1° et 4°', () => {
        expect(pickFovDeg(20)).toBeCloseTo(1);
        expect(pickFovDeg(1)).toBe(0.1);
        expect(pickFovDeg(200)).toBe(4);
    });
});
