/**
 * Tests du hook useUserSettings : lecture et migration depuis localStorage,
 * synchronisation entre onglets, mises à jour et réinitialisations.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useUserSettings } from './useUserSettings';
import { DEFAULT_SETTINGS, LEGACY_LOCATION_KEY, SETTINGS_KEY, type UserSettings } from './userSettings';

const PARIS = { lat: 48.85, lon: 2.35, name: 'Paris' };

function storedSettings(): UserSettings | null {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? (JSON.parse(raw) as UserSettings) : null;
}

describe('useUserSettings', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renvoie les réglages par défaut quand rien n’est stocké', () => {
        const { result } = renderHook(() => useUserSettings());
        expect(result.current.settings).toEqual(DEFAULT_SETTINGS);
        expect(result.current.isLocationCustom).toBe(false);
        expect(result.current.isCameraCustom).toBe(false);
    });

    it('charge un réglage complet stocké et conserve les identifiants de matériel', () => {
        const stored: UserSettings = {
            location: PARIS,
            camera: {
                rotationDeg: 45,
                sensorWidthMm: 23.5,
                sensorHeightMm: 15.7,
                focalLengthMm: 800,
                pixelSizeUm: 3.76,
                cameraId: 'asi2600',
                telescopeId: 'scope',
                accessoryId: 'red',
                focalMultiplier: 0.8,
            },
        };
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(stored));
        const { result } = renderHook(() => useUserSettings());
        expect(result.current.settings).toEqual(stored);
        expect(result.current.isLocationCustom).toBe(true);
        expect(result.current.isCameraCustom).toBe(true);
    });

    it('complète un ancien format sans focale, pixel, identifiants ni multiplicateur', () => {
        localStorage.setItem(
            SETTINGS_KEY,
            JSON.stringify({
                location: PARIS,
                camera: { rotationDeg: 10, sensorWidthMm: 22, sensorHeightMm: 15, focalLengthMm: 0, cameraId: '' },
            }),
        );
        const { result } = renderHook(() => useUserSettings());
        const cam = result.current.camera;
        expect(cam.rotationDeg).toBe(10);
        expect(cam.focalLengthMm).toBe(DEFAULT_SETTINGS.camera.focalLengthMm);
        expect(cam.pixelSizeUm).toBe(DEFAULT_SETTINGS.camera.pixelSizeUm);
        expect(cam.focalMultiplier).toBe(DEFAULT_SETTINGS.camera.focalMultiplier);
        expect(cam.cameraId).toBeUndefined();
        expect(cam.telescopeId).toBeUndefined();
        expect(cam.accessoryId).toBeUndefined();
    });

    it('migre l’ancienne clé de lieu vers le nouveau format puis la supprime', () => {
        localStorage.setItem(LEGACY_LOCATION_KEY, JSON.stringify(PARIS));
        const { result } = renderHook(() => useUserSettings());
        expect(result.current.location).toEqual(PARIS);
        expect(result.current.camera).toEqual(DEFAULT_SETTINGS.camera);
        expect(localStorage.getItem(LEGACY_LOCATION_KEY)).toBeNull();
        expect(storedSettings()).toEqual({ location: PARIS, camera: DEFAULT_SETTINGS.camera });
    });

    it('ignore une entrée invalide ou corrompue', () => {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ location: { lat: 'x' }, camera: {} }));
        localStorage.setItem(LEGACY_LOCATION_KEY, JSON.stringify({ lat: 1 }));
        const { result: invalid } = renderHook(() => useUserSettings());
        expect(invalid.current.settings).toEqual(DEFAULT_SETTINGS);
        expect(localStorage.getItem(LEGACY_LOCATION_KEY)).not.toBeNull();

        localStorage.setItem(SETTINGS_KEY, '{pas du json');
        const { result: corrupted } = renderHook(() => useUserSettings());
        expect(corrupted.current.settings).toEqual(DEFAULT_SETTINGS);
    });

    it('setLocation et setCamera mettent à jour l’état et le stockage', () => {
        const { result } = renderHook(() => useUserSettings());
        act(() => result.current.setLocation(PARIS));
        expect(result.current.location).toEqual(PARIS);
        act(() => result.current.setCamera({ rotationDeg: 90 }));
        expect(result.current.camera.rotationDeg).toBe(90);
        expect(result.current.camera.sensorWidthMm).toBe(DEFAULT_SETTINGS.camera.sensorWidthMm);
        expect(storedSettings()).toEqual({
            location: PARIS,
            camera: { ...DEFAULT_SETTINGS.camera, rotationDeg: 90 },
        });
    });

    it('resetLocation et resetCamera rétablissent chaque partie séparément', () => {
        const { result } = renderHook(() => useUserSettings());
        act(() => result.current.setLocation(PARIS));
        act(() => result.current.setCamera({ rotationDeg: 30 }));
        act(() => result.current.resetLocation());
        expect(result.current.location).toEqual(DEFAULT_SETTINGS.location);
        expect(result.current.camera.rotationDeg).toBe(30);
        act(() => result.current.resetCamera());
        expect(result.current.settings).toEqual(DEFAULT_SETTINGS);
        expect(storedSettings()).toEqual(DEFAULT_SETTINGS);
    });

    it('resetAll efface le stockage et revient aux valeurs par défaut', () => {
        const { result } = renderHook(() => useUserSettings());
        act(() => result.current.setLocation(PARIS));
        act(() => result.current.resetAll());
        expect(result.current.settings).toEqual(DEFAULT_SETTINGS);
        expect(localStorage.getItem(SETTINGS_KEY)).toBeNull();
    });

    it('garde l’état en mémoire si localStorage refuse l’écriture ou la suppression', () => {
        const { result } = renderHook(() => useUserSettings());
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('quota');
        });
        vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
            throw new Error('privé');
        });
        act(() => result.current.setLocation(PARIS));
        expect(result.current.location).toEqual(PARIS);
        act(() => result.current.resetAll());
        expect(result.current.settings).toEqual(DEFAULT_SETTINGS);
    });

    it('se synchronise sur l’événement storage des autres onglets et ignore les autres clés', () => {
        const { result } = renderHook(() => useUserSettings());
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ location: PARIS, camera: DEFAULT_SETTINGS.camera }));

        act(() => {
            window.dispatchEvent(new StorageEvent('storage', { key: 'autre-cle' }));
        });
        expect(result.current.location).toEqual(DEFAULT_SETTINGS.location);

        act(() => {
            window.dispatchEvent(new StorageEvent('storage', { key: SETTINGS_KEY }));
        });
        expect(result.current.location).toEqual(PARIS);

        localStorage.removeItem(SETTINGS_KEY);
        act(() => {
            window.dispatchEvent(new StorageEvent('storage', { key: SETTINGS_KEY }));
        });
        expect(result.current.settings).toEqual(DEFAULT_SETTINGS);
    });
});
