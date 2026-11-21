/**
 * Tests des réglages utilisateur : calculs optiques (focale effective, champ,
 * échantillonnage) et détection des réglages personnalisés.
 */

import { describe, it, expect } from 'vitest';
import {
    DEFAULT_SETTINGS,
    arcsecPerPixel,
    effectiveFocalLengthMm,
    fovDegFor,
    isCameraCustom,
    isLocationCustom,
} from './userSettings';

describe('effectiveFocalLengthMm', () => {
    it('applique le multiplicateur du réducteur ou de la Barlow', () => {
        expect(effectiveFocalLengthMm({ ...DEFAULT_SETTINGS.camera, focalLengthMm: 1000, focalMultiplier: 0.8 })).toBe(
            800,
        );
    });

    it('considère un multiplicateur absent comme 1', () => {
        const cam = { ...DEFAULT_SETTINGS.camera, focalLengthMm: 500 } as Partial<typeof DEFAULT_SETTINGS.camera>;
        delete cam.focalMultiplier;
        expect(effectiveFocalLengthMm(cam as typeof DEFAULT_SETTINGS.camera)).toBe(500);
    });
});

describe('fovDegFor', () => {
    it('calcule le champ angulaire d’un côté de capteur', () => {
        // 36 mm à 1000 mm ≈ 2,062°
        expect(fovDegFor(36, 1000)).toBeCloseTo(2.0626, 3);
    });

    it('renvoie 0 pour une focale nulle ou négative', () => {
        expect(fovDegFor(36, 0)).toBe(0);
        expect(fovDegFor(36, -10)).toBe(0);
    });
});

describe('arcsecPerPixel', () => {
    it('calcule l’échantillonnage en secondes d’arc par pixel', () => {
        expect(arcsecPerPixel(3.76, 2939)).toBeCloseTo(0.2639, 3);
    });

    it('renvoie 0 pour une focale nulle', () => {
        expect(arcsecPerPixel(3.76, 0)).toBe(0);
    });
});

describe('isLocationCustom', () => {
    it('renvoie false pour le site par défaut', () => {
        expect(isLocationCustom(DEFAULT_SETTINGS.location)).toBe(false);
    });

    it('renvoie true dès que la latitude, la longitude ou le nom diffère', () => {
        const base = DEFAULT_SETTINGS.location;
        expect(isLocationCustom({ ...base, lat: 45 })).toBe(true);
        expect(isLocationCustom({ ...base, lon: 2 })).toBe(true);
        expect(isLocationCustom({ ...base, name: 'Paris' })).toBe(true);
    });
});

describe('isCameraCustom', () => {
    it('renvoie false pour la caméra par défaut', () => {
        expect(isCameraCustom(DEFAULT_SETTINGS.camera)).toBe(false);
    });

    it.each([
        ['rotationDeg', 90],
        ['sensorWidthMm', 23.5],
        ['sensorHeightMm', 15.6],
        ['focalLengthMm', 1000],
        ['pixelSizeUm', 4.63],
        ['cameraId', 'asi2600'],
        ['telescopeId', 'autre'],
        ['accessoryId', 'generic-red-080'],
        ['focalMultiplier', 0.8],
    ] as const)('renvoie true quand %s diffère', (field, value) => {
        expect(isCameraCustom({ ...DEFAULT_SETTINGS.camera, [field]: value })).toBe(true);
    });
});
