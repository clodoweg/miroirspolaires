import React, { useRef, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useStellariumEngine } from '../../hooks/useStellariumEngine';
import { theme, withOpacity } from '@/lib/theme';
import { CrosshairReticle } from './CrosshairReticle';

interface StaticSkyMapProps {
    raVal: number; // RA in degrees
    decVal: number; // Dec in degrees
    radius?: number; // Field radius in degrees
    fieldSize?: string; // e.g. "1.5° × 1.0°"
    title: string; // Object name
}

/** Sous-ensemble du `core` du moteur Stellarium modifié par la vue statique. */
interface StellariumCoreLike {
    core?: StellariumCoreLike;
    fov?: number;
    observer?: { yaw: number; pitch: number };
    mount_frame?: number;
    lines?: { equatorial?: { visible: boolean } };
    constellations?: { images_visible: boolean; bounds_visible: boolean };
    update?: () => void;
}

/**
 * Centre le moteur Stellarium sur l'objet et applique la configuration de la vue « carte de repérage ».
 * POURQUOI : fonction hors composant, car le moteur est un objet externe mutable que le compilateur
 * React interdit de modifier directement depuis le corps d'un effet (valeur renvoyée par un hook).
 *
 * @param engineInstance - Instance du moteur Stellarium (ou son `core`).
 * @param raVal - Ascension droite en degrés.
 * @param decVal - Déclinaison en degrés.
 */
function centerStaticView(engineInstance: StellariumCoreLike, raVal: number, decVal: number): void {
    const core = engineInstance.core || engineInstance;

    // Set fixed FOV of 25 degrees (Detail View - Zoomed in per user request)
    const fovDeg = 25;
    core.fov = fovDeg * (Math.PI / 180);

    // Center on RA/Dec
    if (core.observer) {
        core.observer.yaw = (raVal * Math.PI) / 180;
        core.observer.pitch = (decVal * Math.PI) / 180;
    }

    // Ensure equatorial mount frame
    core.mount_frame = 1;

    // Disable equatorial grid lines
    if (core.lines && core.lines.equatorial) {
        core.lines.equatorial.visible = false;
    }

    // Enable constellation artwork and boundaries
    if (core.constellations) {
        core.constellations.images_visible = true;
        core.constellations.bounds_visible = true;
    }

    if (core.update) core.update();
}

/**
 * StaticSkyMap
 *
 * A simplified, non-interactive sky map centered on a specific celestial object.
 * Used in astrophotography detail pages as a "finding chart".
 */
const StaticSkyMap: React.FC<StaticSkyMapProps> = ({ raVal, decVal, radius = 2, fieldSize }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const { engineInstance, status, errorMessage } = useStellariumEngine(canvasRef);
    const [isPositioned, setIsPositioned] = useState(false);

    // Center the view on the object once engine is ready
    useEffect(() => {
        if (!engineInstance || status !== 'ready' || isPositioned) return;

        centerStaticView(engineInstance, raVal, decVal);
        setIsPositioned(true);
    }, [engineInstance, status, raVal, decVal, radius, isPositioned]);

    // Parse field size for rectangle dimensions
    const parseFieldSize = (fs: string | undefined): { width: number; height: number } | null => {
        if (!fs) return null;
        // Format: "1.5° x 1.0°" or "1.5° × 1.0°"
        const match = fs.match(/([\d.]+)°?\s*[x×]\s*([\d.]+)°?/i);
        if (match) {
            return { width: parseFloat(match[1]), height: parseFloat(match[2]) };
        }
        return null;
    };

    const fieldDimensions = parseFieldSize(fieldSize);

    // Calculate rectangle size as percentage of canvas
    const calculateRectPercentage = () => {
        if (!fieldDimensions || !engineInstance) return null;

        const core = engineInstance.core || engineInstance;
        const fovDeg = (core.fov || (radius * 3 * Math.PI) / 180) * (180 / Math.PI);

        // Rectangle size as percentage of FOV
        const widthPercent = (fieldDimensions.width / fovDeg) * 100;
        const heightPercent = (fieldDimensions.height / fovDeg) * 100;

        return { widthPercent, heightPercent };
    };

    const rectSize = isPositioned ? calculateRectPercentage() : null;

    if (status === 'error') {
        return (
            <div className="flex aspect-photo w-full items-center justify-center rounded-lg bg-mp-bg-secondary text-sm text-mp-astro-red md:aspect-2/1">
                <span>Erreur: {errorMessage}</span>
            </div>
        );
    }

    return (
        <div className="relative aspect-photo w-full overflow-hidden rounded-lg bg-mp-bg-secondary md:aspect-2/1">
            {/* Canvas */}
            <canvas
                ref={canvasRef}
                className={`block h-full w-full transition-opacity duration-500 ${status === 'ready' ? 'opacity-100' : 'opacity-0'}`}
                style={{ pointerEvents: 'none' }} // Disable all interactions
            />

            {/* Loading Overlay */}
            {status === 'loading' && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <Loader2 className="h-6 w-6 animate-spin text-white" />
                </div>
            )}

            {/* Field Rectangle Overlay */}
            {status === 'ready' && rectSize && (
                <div
                    className="pointer-events-none absolute"
                    style={{
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: `${rectSize.widthPercent}%`,
                        height: `${rectSize.heightPercent}%`,
                        border: `2px solid ${withOpacity(theme.accent.red, 0.8)}`,
                        boxShadow: `0 0 10px ${withOpacity(theme.accent.red, 0.5)}`,
                        borderRadius: '2px',
                    }}
                />
            )}

            {/* Reticle — shared with StellariumWrapper via CrosshairReticle */}
            {status === 'ready' && <CrosshairReticle className="inset-0" />}
        </div>
    );
};

export default StaticSkyMap;
