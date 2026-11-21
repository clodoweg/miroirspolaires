/**
 * Sky Navigation Hook
 *
 * Provides pan, zoom, reset, and go-to controls for the Stellarium sky map.
 * Supports both equatorial (RA/Dec direct) and alt-az (coordinate conversion) modes.
 */
import { useCallback, useEffect } from 'react';
import { horizontalToJ2000, j2000ToHorizontal } from '../lib/stellarium-utils';

export type NavMode = 'eq' | 'altaz';

/**
 * Provides camera navigation callbacks (pan, zoom, reset, go-to) for the Stellarium engine.
 * @param engineInstance - Active Stellarium Web Engine instance
 * @param navMode - Navigation mode: 'eq' (equatorial) or 'altaz' (horizontal)
 * @returns Object with handlePan, handleZoom, handleReset, handleResetSouth, handleResetCenter, handleGoTo
 */
export function useSkyNavigation(engineInstance: any, navMode: NavMode) {
    // Sync Mount Frame with Mode to prevent Field Rotation oscillation
    useEffect(() => {
        if (!engineInstance) return;
        const core = engineInstance.core || engineInstance;

        if (navMode === 'eq') {
            // Equatorial Mount (North Up)
            core.mount_frame = 1;
        } else {
            // Alt/Az (Zenith Up) - Default is usually 5 (Custom) or 0 (AltAz)
            // Reverting to 5 as observed default.
            core.mount_frame = 5;
        }
    }, [engineInstance, navMode]);

    const handlePan = useCallback(
        (dYaw: number, dPitch: number) => {
            if (!engineInstance) return;
            const core = engineInstance.core || engineInstance;
            const obs = core.observer;
            if (!obs) return;

            if (navMode === 'eq') {
                // --- EQUATORIAL MODE (Direct Yaw/Pitch manipulation) ---
                // In mount_frame = 1:
                // Yaw corresponds to RA (Right Ascension)
                // Pitch corresponds to Dec (Declination)

                // Note: dYaw is usually "drag screen right", which shifts view Left.
                // Increasing RA moves view "Left" (Eastward).
                // So +dYaw should ADD to Yaw (RA).

                let newYaw = (obs.yaw || 0) - dYaw;
                let newPitch = (obs.pitch || 0) + dPitch;

                // Normalize Yaw to [0, 2PI]: RA is periodic and Stellarium rejects values
                // outside this range, causing a visual jump on wrap-around.
                newYaw = newYaw % (2 * Math.PI);
                if (newYaw < 0) newYaw += 2 * Math.PI;

                // Clamp Pitch (Dec -PI/2 to +PI/2)
                // Allow effectively 90 degrees (Pole)
                const LIMIT = Math.PI / 2 - 0.000001;
                newPitch = Math.max(-LIMIT, Math.min(LIMIT, newPitch));

                // Apply directly
                core.observer.yaw = newYaw;
                core.observer.pitch = newPitch;
            } else {
                // --- ALTAZ MODE (Convert-Pan-Convert) ---
                // Existing logic: Convert current Az/Alt -> RA/Dec -> Pan RA/Dec -> Convert back to Az/Alt
                // This mimics "Sky Dragging" relative to the stars.

                const j2000 = horizontalToJ2000(obs.yaw, obs.pitch, obs); // Pass full obs

                if (j2000) {
                    let { ra, dec } = j2000;

                    // 2. Apply Delta
                    ra -= dYaw;
                    dec += dPitch;

                    // 3. Clamp Poles
                    const PI_2 = Math.PI / 2;
                    if (dec > PI_2) dec = PI_2;
                    if (dec < -PI_2) dec = -PI_2;

                    // 4. Back to Horizontal
                    const hor = j2000ToHorizontal(ra, dec, obs); // Pass full obs

                    if (hor) {
                        const { alt, az } = hor;

                        // 5. Zenith Continuity Handle
                        // Near the zenith, a tiny drag can flip the azimuth by ~180°, causing
                        // the view to spin wildly. When the new azimuth would jump by more than
                        // 90° relative to the current one, we keep the current azimuth and instead
                        // reflect the altitude through the zenith (π - alt) to preserve continuity.
                        let yawDiff = Math.abs(az - obs.yaw);
                        if (yawDiff > Math.PI) yawDiff = 2 * Math.PI - yawDiff;

                        if (yawDiff > PI_2) {
                            core.observer.yaw = obs.yaw;
                            core.observer.pitch = alt >= 0 ? Math.PI - alt : -Math.PI - alt;
                        } else {
                            core.observer.yaw = az;
                            core.observer.pitch = alt;
                        }
                    }
                } else {
                    // Fallback
                    core.observer.pitch += dPitch;
                    core.observer.yaw += dYaw;
                }
            }

            // Ensure update
            if (core.update) core.update();
        },
        [engineInstance, navMode],
    );

    const handleZoom = useCallback(
        (dFov: number) => {
            if (!engineInstance) return;
            const core = engineInstance.core || engineInstance;
            if (core.fov !== undefined) {
                let newFov = core.fov + dFov;
                const minFov = 0.1 * (Math.PI / 180);
                const maxFov = Math.PI;
                if (newFov < minFov) newFov = minFov;
                if (newFov > maxFov) newFov = maxFov;
                core.fov = newFov;
            }
        },
        [engineInstance],
    );

    const handleReset = useCallback(() => {
        if (!engineInstance) return;
        const core = engineInstance.core || engineInstance;
        if (core.observer) {
            core.observer.yaw = 0; // RA 0
            core.observer.pitch = Math.PI / 2; // Dec 90 (North Pole)
            core.observer.latitude = 45;
        }
        if (core.fov !== undefined) core.fov = (110 * Math.PI) / 180;
    }, [engineInstance]);

    const handleResetSouth = useCallback(() => {
        if (!engineInstance) return;
        const core = engineInstance.core || engineInstance;
        if (core.observer) {
            // RA 0, Dec -90
            core.observer.yaw = 0;
            core.observer.pitch = -Math.PI / 2;
        }
        if (core.fov !== undefined) core.fov = (110 * Math.PI) / 180;
    }, [engineInstance]);

    const handleResetCenter = useCallback(() => {
        if (!engineInstance) return;
        const core = engineInstance.core || engineInstance;
        if (core.observer) {
            // RA 0, Dec 0 (Equator)
            core.observer.yaw = 0;
            core.observer.pitch = 0;
        }
        if (core.fov !== undefined) core.fov = (110 * Math.PI) / 180;
    }, [engineInstance]);

    const handleGoTo = useCallback(
        (raDeg: number, decDeg: number) => {
            if (!engineInstance) return;
            const core = engineInstance.core || engineInstance;
            if (core.observer) {
                // Convert degrees to radians
                const targetYaw = (raDeg * Math.PI) / 180;
                const targetPitch = (decDeg * Math.PI) / 180;

                core.observer.yaw = targetYaw;
                core.observer.pitch = targetPitch;
                if (core.update) core.update();
            }
        },
        [engineInstance],
    );

    return { handlePan, handleZoom, handleReset, handleResetSouth, handleResetCenter, handleGoTo };
}
