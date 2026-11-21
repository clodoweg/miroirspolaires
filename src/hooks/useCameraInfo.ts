/**
 * Camera Info Hook
 *
 * Polls the Stellarium engine at 5Hz to extract and format the current
 * camera position in both horizontal (Alt/Az) and equatorial (RA/Dec) coordinates.
 */
import { useState, useEffect } from 'react';
import { horizontalToJ2000, formatCoordinates, formatHorizontal } from '../lib/stellarium-utils';

export interface CameraInfoState {
    az: string;
    alt: string;
    fov: string;
    ra: string;
    dec: string;
}

/**
 * Tracks the Stellarium camera position and converts it to formatted coordinate strings.
 * @param engineInstance - Active Stellarium Web Engine instance
 * @returns Current camera info (az, alt, fov, ra, dec) or null if engine is not ready
 */
export function useCameraInfo(engineInstance: any) {
    const [info, setInfo] = useState<CameraInfoState | null>(null);

    useEffect(() => {
        if (!engineInstance) return;
        const core = engineInstance.core || engineInstance;

        const interval = setInterval(() => {
            const obs = core.observer;
            if (obs) {
                // 1. Get Alt/Az
                const azRad = obs.yaw;
                const altRad = obs.pitch;
                const fovRad = core.fov || 0;

                // 2. Identify Coordinate System based on Mount Frame
                const isEquatorial = core.mount_frame === 1; // 1 = Equatorial Mount

                let raRad = 0;
                let decRad = 0;

                if (isEquatorial) {
                    // --- EQUATORIAL MODE ---
                    // Yaw = RA (0-2PI), Pitch = Dec (-PI/2 to +PI/2) directly.
                    // Note: Yaw might be RA or RA + offset.
                    // Based on tests: Yaw ~ 3.14 involves 12h.
                    // Let's assume Yaw = RA for now as per pan logic.
                    raRad = azRad % (2 * Math.PI);
                    if (raRad < 0) raRad += 2 * Math.PI;
                    decRad = altRad;
                } else {
                    // --- ALTAZ MODE ---
                    // Yaw = Az, Pitch = Alt -> Convert to J2000
                    const coords = horizontalToJ2000(azRad, altRad, obs);
                    if (coords) {
                        raRad = coords.ra;
                        decRad = coords.dec;
                    }
                }

                // 3. Format Strings
                const horFmt = formatHorizontal(azRad, altRad, fovRad);
                let eqFmt = { raStr: '--', decStr: '--' };

                if (isEquatorial || raRad !== 0 || decRad !== 0) {
                    eqFmt = formatCoordinates(raRad, decRad);
                } else if (!isEquatorial && obs.latitude !== undefined) {
                    // Fallback for AltAz if conversion failed
                }

                setInfo({
                    az: horFmt.azStr,
                    alt: horFmt.altStr,
                    fov: horFmt.fovStr,
                    ra: eqFmt.raStr,
                    dec: eqFmt.decStr,
                });
            }
        }, 200); // 5Hz

        return () => clearInterval(interval);
    }, [engineInstance]);

    return info;
}
