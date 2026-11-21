import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import type { Photo } from '../../lib/photos';
import { Camera, Layers } from 'lucide-react';
import { j2000ToHorizontal, type ObserverState } from '../../lib/stellarium-utils';
import { composeWorkerUrl, DEFAULT_IMAGE_WORKER_URL } from '../../utils/workerUrl';

interface PopoverPlacement {
    placement: string | null;
    alignment: string | null;
}

interface PhotoMarkersProps {
    photos: Photo[];
    selectedPhoto: Photo | null;
    onPhotoSelect: (photo: Photo | null) => void;
    engine: any;
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

const PhotoMarkers: React.FC<PhotoMarkersProps> = ({ photos, selectedPhoto, onPhotoSelect, engine, canvasRef }) => {
    const markerRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});

    // State for hover with delay
    const [hoveredClusterId, setHoveredClusterIdState] = useState<string | null>(null);
    const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // POURQUOI : la boucle d'animation écrit data-placement / data-alignment directement sur les marqueurs.
    // Le rendu ne peut pas lire les refs : on photographie ces attributs à chaque changement de survol,
    // moment où le rendu les relisait auparavant.
    const [popoverPlacements, setPopoverPlacements] = useState<Record<string, PopoverPlacement>>({});

    const setHoveredClusterId = useCallback((clusterId: string | null) => {
        const snapshot: Record<string, PopoverPlacement> = {};
        for (const [id, marker] of Object.entries(markerRefs.current)) {
            snapshot[id] = {
                placement: marker?.getAttribute('data-placement') ?? null,
                alignment: marker?.getAttribute('data-alignment') ?? null,
            };
        }
        setPopoverPlacements(snapshot);
        setHoveredClusterIdState(clusterId);
    }, []);

    const HIDE_DELAY_MS = 3000;

    // Handle mouse enter on marker or popover
    const handleMouseEnter = useCallback(
        (clusterId: string) => {
            // Clear any pending hide timeout
            if (hideTimeoutRef.current) {
                clearTimeout(hideTimeoutRef.current);
                hideTimeoutRef.current = null;
            }
            setHoveredClusterId(clusterId);
        },
        [setHoveredClusterId],
    );

    // Handle mouse leave with 3 second delay
    const handleMouseLeave = useCallback(() => {
        // Set a timeout to hide after 3 seconds
        hideTimeoutRef.current = setTimeout(() => {
            setHoveredClusterId(null);
        }, HIDE_DELAY_MS);
    }, [setHoveredClusterId]);

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (hideTimeoutRef.current) {
                clearTimeout(hideTimeoutRef.current);
            }
        };
    }, []);

    // Close popover when clicking outside (for mobile)
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent | TouchEvent) => {
            // If no popover is open, do nothing
            if (!hoveredClusterId) return;

            // Check if clicked element is inside a marker or popover
            const target = e.target as HTMLElement;
            const isInsideMarker = target.closest('[data-marker-cluster]');

            if (!isInsideMarker) {
                setHoveredClusterId(null);
                if (hideTimeoutRef.current) {
                    clearTimeout(hideTimeoutRef.current);
                    hideTimeoutRef.current = null;
                }
            }
        };

        // Use capture phase to catch events before they're handled
        document.addEventListener('click', handleClickOutside, true);
        document.addEventListener('touchend', handleClickOutside, true);

        return () => {
            document.removeEventListener('click', handleClickOutside, true);
            document.removeEventListener('touchend', handleClickOutside, true);
        };
    }, [hoveredClusterId, setHoveredClusterId]);

    // Cluster photos by proximity (simple grid or radius) to avoid overcrowding
    const clusters = useMemo(() => {
        const groups: { id: string; ra: number; dec: number; photos: Photo[] }[] = [];
        const THRESHOLD = 0.5; // degrees

        photos.forEach((photo) => {
            if (photo.raVal == null || photo.decVal == null) return;

            // Simple greedy clustering (O(n^2) but n is small ~50)
            // Can be optimized if photo count grows.
            const existing = groups.find(
                (g) => Math.abs(g.ra - photo.raVal!) < THRESHOLD && Math.abs(g.dec - photo.decVal!) < THRESHOLD,
            );

            if (existing) {
                existing.photos.push(photo);
            } else {
                groups.push({
                    id: `cluster-${photo.id}`,
                    ra: photo.raVal,
                    dec: photo.decVal,
                    photos: [photo],
                });
            }
        });

        return groups;
    }, [photos]);

    // Added Logic: Sync external selection (e.g. from sidebar) to hovered state
    useEffect(() => {
        if (selectedPhoto) {
            // Find cluster containing this photo
            const cluster = clusters.find((c) => c.photos.some((p) => p.id === selectedPhoto.id));
            if (cluster) {
                // Show popover
                setHoveredClusterId(cluster.id);

                // Clear any existing timeout
                if (hideTimeoutRef.current) {
                    clearTimeout(hideTimeoutRef.current);
                    hideTimeoutRef.current = null;
                }
            }
        }
    }, [selectedPhoto, clusters, setHoveredClusterId]);

    useEffect(() => {
        let animationId: number;

        const updatePositions = () => {
            if (!engine || !canvasRef.current) return;
            const core = engine.core || engine;

            // Get Camera State
            const obs = core.observer as ObserverState;
            if (!obs) return;

            const width = canvasRef.current.clientWidth;
            const height = canvasRef.current.clientHeight;
            const fov = core.fov || 1.0; // Radians

            const minDim = Math.min(width, height);

            // Camera Basis Construction for Projection
            // Z_cam (Forward) = [ -cos(Az)cos(Alt), sin(Az)cos(Alt), sin(Alt) ]
            // Note: Stellarium Engine assumes Yaw=0 is North, increasing East? No, South.
            // My utils assume South=X.
            // Let's use the Utils State directly.

            // To ensure 100% alignment with `j2000ToHorizontal` output:
            // The Utils output [Alt, Az] where Az is from South? No, from North usually in Astro.
            // Let's check Utils logic: `az = atan2(East, -South)` => Az=0 is North (-South=1).
            // So Az is Standard Astronomical Azimuth (0=North).

            // Now, Camera Basis.
            // If Camera Az=0 (North), Alt=0.
            // Forward = [1, 0, 0] (North)
            // Up      = [0, 0, 1] (Zenith)
            // Right   = [0, -1, 0] (West)

            const azRad = obs.yaw || 0;
            const altRad = obs.pitch || 0;

            const cosP = Math.cos(altRad);
            const sinP = Math.sin(altRad);
            const cosY = Math.cos(azRad);
            const sinY = Math.sin(azRad);

            // Verify: My Utils used: South = -cosY*cosP.
            // If Az=0 (cosY=1), South=-cosP. North=cosP.
            // If Alt=0 (cosP=1), North=1. Correct.

            // Construct Camera Basis Vectors in "Horizontal Cartesian" Frame (X=South, Y=East, Z=Zenith)
            // Forward Vector F (Unit):
            // North = cos(Az)*cos(Alt). South = -cos(Az)*cos(Alt).
            // East  = sin(Az)*cos(Alt).
            // Zenith= sin(Alt).
            // F = [-cosY*cosP, sinY*cosP, sinP]
            const fwd = [-cosY * cosP, sinY * cosP, sinP];

            // Right Vector R:
            // Standard Right of Screen corresponds to "Geometric Right" relative to view.
            // For Az=0 (Looking North), Right is East (+Y).
            // R = [0, 1, 0].
            // General Right for Az: [ sin(Az), cos(Az), 0 ]
            // Is this correct?
            // If Az=90 (East), Right should be South (+X).
            // sin(90)=1, cos(90)=0. R=[1, 0, 0] (South). Correct.
            // If Az=180 (South), Right should be West (-Y).
            // sin(180)=0, cos(180)=-1. R=[0, -1, 0]. Correct.
            // Wait, does Pitch affect Right?
            // In a simple AltAz mount, panning pure Alt doesn't tilt the horizon (Right vector stays horizontal).
            // So Right vector always in XY plane is correct.
            const screenRight = [sinY, cosY, 0];

            // Up Vector U: Cross(Right, Forward).
            // U = R x F.
            const screenUp = [
                screenRight[1] * fwd[2] - screenRight[2] * fwd[1],
                screenRight[2] * fwd[0] - screenRight[0] * fwd[2],
                screenRight[0] * fwd[1] - screenRight[1] * fwd[0],
            ];
            // Normalize (though R and F are unit and orthogonal-ish... F is not in plane if P!=0).
            const uLen = Math.sqrt(screenUp[0] ** 2 + screenUp[1] ** 2 + screenUp[2] ** 2);
            if (uLen > 0) {
                screenUp[0] /= uLen;
                screenUp[1] /= uLen;
                screenUp[2] /= uLen;
            }

            clusters.forEach((cluster) => {
                const ref = markerRefs.current[cluster.id];
                if (!ref) return;

                // 1. Determine Coordinate System
                const isEquatorial = core.mount_frame === 1;

                let alpha: number; // Azimuth or RA
                let delta: number; // Altitude or Dec

                if (isEquatorial) {
                    // EQ Mode: Camera is in RA/Dec. Use RA/Dec directly.
                    alpha = (cluster.ra * Math.PI) / 180;
                    delta = (cluster.dec * Math.PI) / 180;
                } else {
                    // AltAz Mode: Camera is in Az/Alt. Convert J2000 -> Horizontal.
                    const raRad = (cluster.ra * Math.PI) / 180;
                    const decRad = (cluster.dec * Math.PI) / 180;
                    const coords = j2000ToHorizontal(raRad, decRad, obs);
                    if (!coords) {
                        ref.style.display = 'none';
                        return;
                    }
                    alpha = coords.az;
                    delta = coords.alt;
                }

                // 2. Convert Target to Cartesian (Horizontal/Equatorial Frame)
                // Use generic alpha/delta (Az/Alt or RA/Dec) matches camera Yaw/Pitch
                const cDelta = Math.cos(delta);
                const pos = [-Math.cos(alpha) * cDelta, Math.sin(alpha) * cDelta, Math.sin(delta)];

                // 3. Project
                // Dot with Forward (Cos Theta)
                const dot = pos[0] * fwd[0] + pos[1] * fwd[1] + pos[2] * fwd[2];

                if (dot > 0.001) {
                    // In front of camera (mostly)
                    // Coordinates in Camera Frame (Screen Space)
                    const xLocal = pos[0] * screenRight[0] + pos[1] * screenRight[1] + pos[2] * screenRight[2];
                    const yLocal = pos[0] * screenUp[0] + pos[1] * screenUp[1] + pos[2] * screenUp[2];

                    // Angle from center (Theta)
                    // dot = cos(theta)
                    // sin(theta) = sqrt(xLocal^2 + yLocal^2)
                    // We can use xLocal/yLocal directly for direction.

                    const rSinTheta = Math.sqrt(xLocal * xLocal + yLocal * yLocal);
                    const theta = Math.acos(Math.max(-1, Math.min(1, dot))); // 0..PI

                    // Projection Logic
                    const projectionMode = core.projection ?? 0; // 0=Perspective, 1=Stereographic, 2=Fisheye

                    let radiusPx: number;
                    const fovRad = fov; // Already in radians (verified)

                    // Calculate Pixel Radius based on Projection
                    // We assume FOV fits into minDim
                    const maxR = minDim / 2;

                    if (projectionMode === 0) {
                        // Perspective: R = f * tan(theta)
                        // maxR = f * tan(fov/2) => f = maxR / tan(fov/2)
                        const f = maxR / Math.tan(fovRad / 2);
                        radiusPx = f * Math.tan(theta);
                    } else if (projectionMode === 1) {
                        // Stereographic: R = f * 2 * tan(theta/2)
                        // maxR = f * 2 * tan(fov/4) => f = maxR / (2 * tan(fov/4))
                        // Existing code used this.
                        const f = maxR / (2 * Math.tan(fovRad / 4));
                        radiusPx = f * 2 * Math.tan(theta / 2);
                    } else if (projectionMode === 2) {
                        // Fisheye (Equidistant): R = f * theta
                        // maxR = f * (fov/2) => f = maxR / (fov/2)
                        const f = maxR / (fovRad / 2);
                        radiusPx = f * theta;
                    } else {
                        // Fallback (Linear/Fisheye is safe)
                        const f = maxR / (fovRad / 2);
                        radiusPx = f * theta;
                    }

                    // Protect against division by zero if theta is tiny
                    let scaleFactor = 0;
                    if (rSinTheta > 0.000001) {
                        scaleFactor = radiusPx / rSinTheta;
                    }

                    const screenX = width / 2 + (isEquatorial ? -1 : 1) * xLocal * scaleFactor;
                    const screenY = height / 2 - yLocal * scaleFactor;

                    // Bounds Check
                    if (screenX > -50 && screenX < width + 50 && screenY > -50 && screenY < height + 50) {
                        ref.style.display = 'block';
                        ref.style.transform = `translate(${screenX}px, ${screenY}px) translate(-50%, -50%)`;

                        // Metadata for tooltip placement
                        ref.setAttribute('data-placement', screenY < height * 0.55 ? 'bottom' : 'top');
                        ref.setAttribute(
                            'data-alignment',
                            screenX < 200 ? 'left' : screenX > width - 200 ? 'right' : 'center',
                        );
                    } else {
                        ref.style.display = 'none';
                    }
                } else {
                    ref.style.display = 'none';
                }
            });

            animationId = requestAnimationFrame(updatePositions);
        };

        animationId = requestAnimationFrame(updatePositions);
        return () => cancelAnimationFrame(animationId);
    }, [clusters, engine, canvasRef]); // End Effect

    // Helper function to get the thumbnail URL for a photo.
    //
    // Synthetic photos (catalogue mode) carry their own `thumbnailUrl` from
    // hips2fits; we pass those through untouched.
    // POURQUOI : w_300 couvre le DPR 2 d'un popover de ~150 px. Le worker sert toutefois les
    // clés `mini/` sans les retraiter (limite CPU) : voir le rapport d'audit 2026-10.
    const getPhotoMiniUrl = (photo: Photo) =>
        photo.thumbnailUrl ??
        composeWorkerUrl(DEFAULT_IMAGE_WORKER_URL, `astrophotographies/mini/${photo.imagePath}`, {
            width: 300,
            quality: 70,
        });

    const getPhotoHref = (photo: Photo) => photo.href ?? `/astrophotographies/${photo.slug}`;

    return (
        <div className="pointer-events-none absolute inset-0 z-10" aria-label="Photo markers overlay">
            {clusters.map((cluster) => {
                const isSelected = cluster.photos.some((p) => p.id === selectedPhoto?.id);
                const isMulti = cluster.photos.length > 1;
                const representative = cluster.photos[0]; // Newest one
                const isHovered = hoveredClusterId === cluster.id;
                const placement = popoverPlacements[cluster.id]?.placement;
                const alignment = popoverPlacements[cluster.id]?.alignment;

                return (
                    <div
                        key={cluster.id}
                        ref={(el) => {
                            markerRefs.current[cluster.id] = el as HTMLButtonElement | null;
                        }}
                        data-marker-cluster={cluster.id}
                        className={`pointer-events-auto absolute transition-colors duration-200 ${isSelected ? 'z-50' : 'z-20'} ${isHovered ? 'z-60' : 'hover:z-60'} touch-action-none cursor-pointer touch-none`}
                        style={{
                            display: 'none',
                            top: 0,
                            left: 0,
                            touchAction: 'none',
                        }}
                        onMouseEnter={() => handleMouseEnter(cluster.id)}
                        onMouseLeave={handleMouseLeave}
                    >
                        {/* Marker Icon */}
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                // On touch devices, toggle popover visibility
                                // On desktop with mouse, this also fires but hover handles visibility
                                if (isHovered) {
                                    // If already showing, select the photo (useful for single photos)
                                    if (cluster.photos.length === 1) {
                                        // Navigate directly on single photo click
                                        window.location.href = getPhotoHref(representative);
                                    } else {
                                        // For clusters, keep popover open to let user choose
                                        onPhotoSelect(representative);
                                    }
                                } else {
                                    // Show the popover AND select to center
                                    handleMouseEnter(cluster.id);
                                    onPhotoSelect(representative);
                                }
                            }}
                            onTouchStart={(e) => {
                                // Prevent hover simulation on touch
                                e.stopPropagation();
                            }}
                            aria-label={`Voir ${representative.title}`}
                            className="block"
                        >
                            <div
                                className={`shadow-glow-gold relative flex h-5 w-5 items-center justify-center rounded-full border border-mp-accent bg-mp-bg-secondary text-mp-accent transition-all duration-200 hover:scale-125 hover:bg-mp-accent hover:text-black`}
                            >
                                {isMulti ? <Layers size={10} /> : <Camera size={10} strokeWidth={2} />}

                                {/* Count Badge for Cluster */}
                                {isMulti && (
                                    <div className="absolute -top-2 -right-2 rounded-full border border-black/50 bg-mp-astro-red px-1 text-[9px] font-bold text-white shadow-xs">
                                        {cluster.photos.length}
                                    </div>
                                )}
                            </div>
                        </button>

                        {/* POPOVER Bubble - Uses hover state with delay */}
                        <div
                            className={`absolute bottom-full left-1/2 z-70 mb-3 -translate-x-1/2 transition-opacity duration-200 ${isHovered ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
                            onMouseEnter={() => handleMouseEnter(cluster.id)}
                            onMouseLeave={handleMouseLeave}
                            data-placement={placement || 'top'}
                            data-alignment={alignment || 'center'}
                            style={{
                                // Position adjustments based on data attributes
                                ...(placement === 'bottom' && {
                                    bottom: 'auto',
                                    top: '100%',
                                    marginTop: '0.75rem',
                                    marginBottom: 0,
                                }),
                                ...(alignment === 'left' && {
                                    left: 0,
                                    transform: 'translateX(0)',
                                }),
                                ...(alignment === 'right' && {
                                    left: 'auto',
                                    right: 0,
                                    transform: 'translateX(0)',
                                }),
                            }}
                        >
                            <div className="grid max-w-[90vw] min-w-[300px] grid-cols-2 gap-2 sm:max-w-md">
                                {cluster.photos.map((photo) => {
                                    // Get R2 mini URL for this photo
                                    const pUrl = getPhotoMiniUrl(photo);

                                    return (
                                        <a
                                            key={photo.id}
                                            href={getPhotoHref(photo)}
                                            className="relative flex w-full flex-col gap-2 rounded-lg border border-mp-border-light bg-mp-glass-solid p-2 shadow-xl backdrop-blur-md transition-all duration-200 hover:scale-105 hover:border-mp-accent"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            {/* Thumbnail */}
                                            <div className="relative aspect-video w-full overflow-hidden rounded-md bg-mp-bg-secondary">
                                                <img
                                                    src={pUrl}
                                                    alt={photo.title}
                                                    className="h-full w-full object-cover"
                                                    loading="lazy"
                                                />
                                            </div>
                                            {/* Title */}
                                            <div className="text-center">
                                                <h4 className="line-clamp-2 text-[10px] leading-tight font-bold text-white">
                                                    {photo.title}
                                                </h4>
                                                <span className="mt-0.5 block text-[9px] text-gray-400">
                                                    {[photo.year || null, photo.constellation]
                                                        .filter(Boolean)
                                                        .join(' · ')}
                                                </span>
                                            </div>
                                        </a>
                                    );
                                })}
                            </div>

                            {/* Arrow - Centered on the container */}
                            <div
                                className="absolute left-1/2 h-4 w-4 -translate-x-1/2 overflow-hidden"
                                style={{
                                    ...(placement === 'top' && {
                                        bottom: '-8px',
                                    }),
                                    ...(placement === 'bottom' && {
                                        top: '-8px',
                                    }),
                                    ...(alignment === 'left' && {
                                        left: '1rem',
                                        transform: 'translateX(0)',
                                    }),
                                    ...(alignment === 'right' && {
                                        left: 'auto',
                                        right: '1rem',
                                    }),
                                }}
                            >
                                <div
                                    className="mx-auto h-2 w-2 border-r border-b border-mp-border-light bg-mp-glass-solid"
                                    style={{
                                        transform: placement === 'bottom' ? 'rotate(225deg)' : 'rotate(45deg)',
                                        marginTop: placement === 'bottom' ? '12px' : '-5px',
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default PhotoMarkers;
