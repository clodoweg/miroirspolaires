import { useCallback, useEffect, useState } from 'react';
import type { ObsLocation } from '@/lib/objects/observation';
import {
    DEFAULT_SETTINGS,
    LEGACY_LOCATION_KEY,
    SETTINGS_KEY,
    isCameraCustom,
    isLocationCustom,
    type CameraSettings,
    type UserSettings,
} from './userSettings';

function readStored(): UserSettings | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem(SETTINGS_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            const loc = parsed?.location;
            const cam = parsed?.camera;
            if (
                loc &&
                typeof loc.lat === 'number' &&
                typeof loc.lon === 'number' &&
                typeof loc.name === 'string' &&
                cam &&
                typeof cam.rotationDeg === 'number' &&
                typeof cam.sensorWidthMm === 'number' &&
                typeof cam.sensorHeightMm === 'number'
            ) {
                // Soft-migrate older payloads that didn't carry focal length / pixel size.
                const focal =
                    typeof cam.focalLengthMm === 'number' && cam.focalLengthMm > 0
                        ? cam.focalLengthMm
                        : DEFAULT_SETTINGS.camera.focalLengthMm;
                const pixel =
                    typeof cam.pixelSizeUm === 'number' && cam.pixelSizeUm > 0
                        ? cam.pixelSizeUm
                        : DEFAULT_SETTINGS.camera.pixelSizeUm;
                const cameraId = typeof cam.cameraId === 'string' && cam.cameraId ? cam.cameraId : undefined;
                const telescopeId =
                    typeof cam.telescopeId === 'string' && cam.telescopeId ? cam.telescopeId : undefined;
                const accessoryId =
                    typeof cam.accessoryId === 'string' && cam.accessoryId ? cam.accessoryId : undefined;
                const focalMult =
                    typeof cam.focalMultiplier === 'number' && cam.focalMultiplier > 0
                        ? cam.focalMultiplier
                        : DEFAULT_SETTINGS.camera.focalMultiplier;
                return {
                    location: loc,
                    camera: {
                        ...cam,
                        focalLengthMm: focal,
                        pixelSizeUm: pixel,
                        cameraId,
                        telescopeId,
                        accessoryId,
                        focalMultiplier: focalMult,
                    },
                };
            }
        }
        // Legacy migration: old key only stored ObsLocation.
        const legacy = window.localStorage.getItem(LEGACY_LOCATION_KEY);
        if (legacy) {
            const parsed = JSON.parse(legacy);
            if (
                typeof parsed?.lat === 'number' &&
                typeof parsed?.lon === 'number' &&
                typeof parsed?.name === 'string'
            ) {
                const migrated: UserSettings = {
                    location: parsed,
                    camera: DEFAULT_SETTINGS.camera,
                };
                window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(migrated));
                window.localStorage.removeItem(LEGACY_LOCATION_KEY);
                return migrated;
            }
        }
    } catch {
        // ignore corrupted entries
    }
    return null;
}

/**
 * Reactive hook for the user's persistent observation settings.
 *
 * Backed by `localStorage` (key `mp:user-settings`). Cross-tab sync via the
 * `storage` event. Falls back to {@link DEFAULT_SETTINGS} (Deep Sky Chile +
 * APS-C, 0° rotation) when no value is stored.
 */
export function useUserSettings() {
    const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);

    useEffect(() => {
        const stored = readStored();
        if (stored) setSettings(stored);
    }, []);

    useEffect(() => {
        function onStorage(e: StorageEvent) {
            if (e.key !== SETTINGS_KEY && e.key !== LEGACY_LOCATION_KEY) return;
            const stored = readStored();
            setSettings(stored ?? DEFAULT_SETTINGS);
        }
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, []);

    const persist = useCallback((next: UserSettings) => {
        setSettings(next);
        try {
            window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
        } catch {
            // quota / private mode — keep in-memory state only.
        }
    }, []);

    const setLocation = useCallback(
        (loc: ObsLocation) => {
            persist({ ...settings, location: loc });
        },
        [persist, settings],
    );

    const setCamera = useCallback(
        (partial: Partial<CameraSettings>) => {
            persist({ ...settings, camera: { ...settings.camera, ...partial } });
        },
        [persist, settings],
    );

    const resetLocation = useCallback(() => {
        persist({ ...settings, location: DEFAULT_SETTINGS.location });
    }, [persist, settings]);

    const resetCamera = useCallback(() => {
        persist({ ...settings, camera: DEFAULT_SETTINGS.camera });
    }, [persist, settings]);

    const resetAll = useCallback(() => {
        setSettings(DEFAULT_SETTINGS);
        try {
            window.localStorage.removeItem(SETTINGS_KEY);
        } catch {
            // ignore
        }
    }, []);

    return {
        settings,
        location: settings.location,
        camera: settings.camera,
        isLocationCustom: isLocationCustom(settings.location),
        isCameraCustom: isCameraCustom(settings.camera),
        setLocation,
        setCamera,
        resetLocation,
        resetCamera,
        resetAll,
    };
}
