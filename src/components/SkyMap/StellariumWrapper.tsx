import React, { useRef, useState, useEffect } from 'react';
import type { Photo } from '../../lib/photos';
import { AlertTriangle, Settings, X } from 'lucide-react';

// Sub-components
import StellariumControls from './StellariumControls';
import StellariumNavigationControls from './StellariumNavigationControls';
import PhotoMarkers from './PhotoMarkers';
import { CrosshairReticle } from './CrosshairReticle';

// Custom Hooks (Refactoring: Logic Extraction)
import { useStellariumEngine } from '../../hooks/useStellariumEngine';
import { useSkyNavigation } from '../../hooks/useSkyNavigation';
import { useCameraInfo } from '../../hooks/useCameraInfo';

interface StellariumWrapperProps {
    selectedPhoto: Photo | null;
    photos: Photo[];
    onPhotoSelect?: (photo: Photo | null) => void;
    initialFov?: number; // FOV in degrees
    targetCenter?: { ra: number; dec: number; fov?: number } | null;
}

/** Sous-ensemble du `core` du moteur Stellarium utilisé pour régler le champ. */
interface StellariumFovCore {
    core?: StellariumFovCore;
    fov?: number;
    update?: () => void;
}

/**
 * Applique un champ de vision (en degrés) au moteur s'il expose `fov`.
 * POURQUOI : fonction hors composant, car le compilateur React interdit de modifier
 * directement dans un effet l'instance du moteur renvoyée par un hook.
 *
 * @param engineInstance - Instance du moteur Stellarium (ou son `core`).
 * @param fovDeg - Champ de vision en degrés.
 */
function applyFovDegrees(engineInstance: StellariumFovCore, fovDeg: number): void {
    const core = engineInstance.core || engineInstance;
    if (core.fov !== undefined) {
        core.fov = fovDeg * (Math.PI / 180);
        if (core.update) core.update();
    }
}

/**
 * StellariumWrapper
 *
 * Main container for the Stellarium Web Engine interaction.
 * Refactored to use "Single Responsibility" hooks.
 */
const StellariumWrapper: React.FC<StellariumWrapperProps> = ({
    selectedPhoto,
    photos,
    onPhotoSelect,
    initialFov,
    targetCenter,
}) => {
    // 1. References & State
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [showMobileControls, setShowMobileControls] = useState(false);

    // 2. Engine Logic (Hook: Init, Loading, Config)
    const { engineInstance, status, errorMessage } = useStellariumEngine(canvasRef);

    // 3. Navigation Logic (Hook: Pan, Zoom, Reset) - Force 'eq'
    const { handlePan, handleZoom, handleReset, handleResetSouth, handleResetCenter, handleGoTo } = useSkyNavigation(
        engineInstance,
        'eq',
    );

    // 4. Info Logic (Hook: Polling Stats)
    const cameraInfo = useCameraInfo(engineInstance);

    // 5. Selection Logic: Use handleGoTo for smooth/consistent centering
    useEffect(() => {
        if (engineInstance && status === 'ready' && selectedPhoto) {
            if (selectedPhoto.raVal != null && selectedPhoto.decVal != null) {
                handleGoTo(selectedPhoto.raVal, selectedPhoto.decVal);
            }
        }
    }, [engineInstance, status, selectedPhoto, handleGoTo]);

    // 5.1 Initial FOV Logic (For Deep Linking)
    useEffect(() => {
        if (engineInstance && status === 'ready' && initialFov) {
            const timer = setTimeout(() => {
                const core = engineInstance.core || engineInstance;
                if (core.fov !== undefined) {
                    core.fov = initialFov * (Math.PI / 180);
                    if (core.update) core.update();
                }
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [engineInstance, status, initialFov]);

    // 5.2 Target Center Logic (For Smart Filtering)
    useEffect(() => {
        if (engineInstance && status === 'ready' && targetCenter) {
            handleGoTo(targetCenter.ra, targetCenter.dec);
            if (typeof targetCenter.fov === 'number') {
                applyFovDegrees(engineInstance, targetCenter.fov);
            }
        }
    }, [engineInstance, status, targetCenter, handleGoTo]);

    // --- Interaction Handlers (Mouse Drag) ---
    // (Kept here as it binds UI events to Navigation logic)
    const isDragging = useRef(false);
    const lastMousePos = useRef({ x: 0, y: 0 });
    const totalDragDistance = useRef(0);

    const onMouseDown = (e: React.MouseEvent) => {
        if (e.target !== canvasRef.current) return;
        isDragging.current = true;
        totalDragDistance.current = 0;
        lastMousePos.current = { x: e.clientX, y: e.clientY };
        e.preventDefault();
    };

    const onMouseMove = (e: React.MouseEvent) => {
        if (!isDragging.current || !engineInstance) return;
        const dx = e.clientX - lastMousePos.current.x;
        const dy = e.clientY - lastMousePos.current.y;
        totalDragDistance.current += Math.abs(dx) + Math.abs(dy);

        if (dx === 0 && dy === 0) return;

        // Scale Logic
        const core = engineInstance.core || engineInstance;
        const fov = core.fov || 1.0;
        const width = canvasRef.current?.clientWidth || 1000;
        const scale = fov / width;

        // Apply Pan
        const dYaw = -dx * scale * 1.5;
        const dPitch = dy * scale * 1.5;
        handlePan(dYaw, dPitch);

        lastMousePos.current = { x: e.clientX, y: e.clientY };
    };

    const onMouseUp = () => {
        if (isDragging.current) {
            if (totalDragDistance.current < 5 && onPhotoSelect) {
                onPhotoSelect(null); // Click behavior
            }
            isDragging.current = false;
        }
    };

    // 6. Native Wheel Listener (Non-Passive for preventDefault)
    const wrapperRef = useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        const handleWheel = (e: WheelEvent) => {
            if (!engineInstance) return;

            // Prevent default page scroll & Stop propagation to Stellarium Canvas
            e.preventDefault();
            e.stopPropagation();

            // Zoom Logic
            const core = engineInstance.core || engineInstance;
            const currentFov = core.fov || 1.0; // radians

            // Scale factor
            const factor = 0.001;
            const dFov = e.deltaY * factor * currentFov;

            handleZoom(dFov);
        };

        const el = wrapperRef.current;
        if (el) {
            // Use Capture phase to intercept before Canvas receives it
            el.addEventListener('wheel', handleWheel, { passive: false, capture: true });
        }

        return () => {
            if (el) {
                el.removeEventListener('wheel', handleWheel, { capture: true }); // Must match options
            }
        };
    }, [engineInstance, handleZoom]);

    // --- RENDER ---

    if (status === 'error') {
        return <ErrorDisplay message={errorMessage} />;
    }

    return (
        <div
            ref={wrapperRef}
            // POURQUOI : conteneur de glisser-déposer à la souris uniquement ; la navigation clavier passe par les boutons de contrôle.
            role="presentation"
            className="touch-action-none relative h-full w-full cursor-grab touch-none overflow-hidden bg-mp-bg active:cursor-grabbing"
            style={{ touchAction: 'none' }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={() => (isDragging.current = false)}
        >
            {/* 1. Loader (Centered on Screen) */}
            {status === 'loading' && <LoadingOverlay />}

            {/* 2. WORLD CONTAINER (Shifted to align center to top 1/3) */}
            {/* Height 150%, Top -41.67% aligns center (75%) to 33.33% of screen */}
            <div className="pointer-events-none absolute top-[-41.67%] left-0 h-[150%] w-full">
                <canvas
                    ref={canvasRef}
                    className={`touch-action-none pointer-events-auto block h-full w-full touch-none transition-opacity duration-500 ${status === 'ready' ? 'opacity-100' : 'opacity-0'}`}
                    style={{ touchAction: 'none' }}
                    onContextMenu={(e) => e.preventDefault()}
                />

                {status === 'ready' && onPhotoSelect && (
                    /* Markers exist in the World Space */
                    <PhotoMarkers
                        photos={photos}
                        selectedPhoto={selectedPhoto}
                        onPhotoSelect={(photo) => {
                            onPhotoSelect(photo);
                            if (photo && photo.raVal != null && photo.decVal != null) {
                                handleGoTo(photo.raVal, photo.decVal);
                            }
                        }}
                        engine={engineInstance}
                        canvasRef={canvasRef}
                    />
                )}
            </div>

            {/* 3. SCREEN SPACE UI (Fixed to Screen) */}
            {status === 'ready' && (
                <>
                    {/* Controls - Bottom Center of Screen */}
                    <div
                        className="pointer-events-auto absolute bottom-32 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-3 safe-bottom"
                        // POURQUOI : empêche seulement le glisser de la carte de démarrer depuis les contrôles.
                        role="presentation"
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        {/* Mobile Toggle Button */}
                        <button
                            onClick={() => setShowMobileControls(!showMobileControls)}
                            className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-black/80 text-white shadow-2xl backdrop-blur-md transition-all duration-200 hover:bg-black/90 md:hidden"
                            title={showMobileControls ? 'Masquer les contrôles' : 'Afficher les contrôles'}
                        >
                            {showMobileControls ? <X size={24} /> : <Settings size={24} />}
                        </button>

                        <div
                            className={`flex w-max max-w-[90vw] flex-wrap items-center justify-center gap-4 overflow-y-auto p-2 ${showMobileControls ? 'flex' : 'hidden md:flex'}`}
                        >
                            <StellariumNavigationControls
                                engine={engineInstance}
                                className="static transform-none"
                                onPan={handlePan}
                                onZoom={handleZoom}
                                onReset={handleReset}
                                onResetSouth={handleResetSouth}
                                onResetCenter={handleResetCenter}
                            />
                            <StellariumControls engine={engineInstance} className="static transform-none" />
                        </div>
                    </div>

                    {/* HUD - Top 1/3 Reticle (Matches visual center) */}
                    <CrosshairReticle className="top-[33.33%] left-1/2 -translate-x-1/2 -translate-y-1/2" />
                    <CameraInfoHUD info={cameraInfo} />
                </>
            )}
        </div>
    );
};

// --- Sub-Components (Extracted for Readability) ---

const ErrorDisplay: React.FC<{ message: string }> = ({ message }) => (
    <div className="flex h-full w-full items-center justify-center bg-mp-glass-solid p-8">
        <div className="max-w-md rounded-xl border border-mp-astro-red/30 bg-mp-glass-bg p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3 text-red-400">
                <AlertTriangle className="h-8 w-8" />
                <h2 className="font-display text-xl font-bold">Erreur de chargement</h2>
            </div>
            <p className="mb-4 text-mp-text-body">{message}</p>
        </div>
    </div>
);

const LoadingOverlay = () => (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden bg-[#050a14]">
        {/* Starfield skeleton — generated with CSS to avoid JS overhead during loading */}
        <svg className="absolute inset-0 h-full w-full" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            {/* Static background star dots — positions chosen to mimic a realistic sky distribution */}
            {[
                [12, 8],
                [34, 22],
                [67, 11],
                [89, 45],
                [23, 67],
                [56, 34],
                [78, 89],
                [45, 56],
                [90, 23],
                [11, 78],
                [63, 41],
                [37, 88],
                [82, 14],
                [5, 52],
                [48, 72],
                [71, 31],
                [92, 61],
                [28, 18],
                [55, 83],
                [16, 44],
                [74, 9],
                [39, 65],
                [86, 37],
                [3, 91],
                [61, 27],
                [49, 6],
                [83, 74],
                [22, 49],
                [69, 95],
                [43, 18],
                [7, 38],
                [96, 82],
                [31, 57],
                [58, 13],
                [77, 68],
                [14, 85],
                [50, 41],
                [87, 24],
                [25, 77],
                [64, 53],
                [40, 3],
                [73, 92],
                [17, 29],
                [52, 46],
                [88, 71],
                [36, 15],
                [62, 38],
                [9, 64],
                [46, 87],
                [79, 20],
                [24, 73],
                [57, 47],
                [93, 33],
                [32, 81],
                [68, 6],
                [19, 58],
                [75, 26],
                [41, 94],
                [85, 51],
                [27, 39],
                [60, 16],
                [13, 70],
                [48, 43],
                [81, 97],
                [35, 25],
                [70, 62],
                [4, 48],
                [91, 79],
                [26, 11],
                [53, 84],
                [80, 30],
                [20, 55],
                [66, 42],
                [10, 91],
                [44, 67],
                [72, 19],
                [38, 78],
                [95, 8],
                [30, 35],
                [56, 96],
            ].map(([cx, cy], i) => (
                <circle
                    key={i}
                    cx={`${cx}%`}
                    cy={`${cy}%`}
                    r={i % 5 === 0 ? 1.5 : i % 3 === 0 ? 1.0 : 0.6}
                    fill="white"
                    opacity={0.15 + (i % 7) * 0.08}
                    style={{
                        animation: `pulse ${2 + (i % 4)}s ease-in-out ${(i % 8) * 0.3}s infinite alternate`,
                    }}
                />
            ))}
        </svg>

        {/* Milky Way gradient band */}
        <div
            className="absolute inset-0 opacity-10"
            style={{
                background:
                    'linear-gradient(120deg, transparent 20%, rgba(180,200,255,0.4) 45%, rgba(200,220,255,0.3) 55%, transparent 80%)',
            }}
        />

        {/* Loading indicator — bottom center, minimal */}
        <div className="absolute bottom-8 left-1/2 flex -translate-x-1/2 flex-col items-center gap-3">
            <div className="flex gap-1.5">
                {[0, 1, 2].map((i) => (
                    <div
                        key={i}
                        className="h-1.5 w-1.5 rounded-full bg-mp-accent/60"
                        style={{ animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite alternate` }}
                    />
                ))}
            </div>
            <span className="font-mono text-xs tracking-widest text-mp-text-muted/60 uppercase">
                Initialisation du moteur stellaire
            </span>
        </div>

        <style>{`
            @keyframes pulse {
                from { opacity: 0.1; }
                to   { opacity: 0.9; }
            }
        `}</style>
    </div>
);

// VignetteOverlay removed - user wants full map visibility without edge darkening

const CameraInfoHUD: React.FC<{ info: any }> = ({ info }) => {
    if (!info) return null;
    return (
        <div className="pointer-events-none absolute top-4 left-1/2 z-30 flex w-max max-w-[95vw] -translate-x-1/2 flex-col items-center gap-3">
            <div className="flex flex-wrap items-center justify-center gap-3 rounded-full border border-mp-border/50 bg-mp-ui-black/60 px-4 py-1.5 font-mono text-[10px] text-mp-text-muted shadow-lg backdrop-blur-sm">
                <InfoItem label="RA" value={info.ra} />
                <Separator />
                <InfoItem label="DEC" value={info.dec} />
                <Separator hiddenOnMobile />
                <InfoItem label="AZ" value={info.az + '°'} hiddenOnMobile />
                <Separator hiddenOnMobile />
                <InfoItem label="ALT" value={info.alt + '°'} hiddenOnMobile />
                <Separator />
                <InfoItem label="FOV" value={info.fov + '°'} />
            </div>
        </div>
    );
};

const InfoItem: React.FC<{ label: string; value: string; hiddenOnMobile?: boolean }> = ({
    label,
    value,
    hiddenOnMobile,
}) => (
    <div className={`flex items-center gap-1.5 ${hiddenOnMobile ? 'hidden md:flex' : ''}`}>
        <span>{label}</span>
        <span className="text-white">{value}</span>
    </div>
);

const Separator: React.FC<{ hiddenOnMobile?: boolean }> = ({ hiddenOnMobile }) => (
    <span className={`h-2.5 w-px bg-white/20 ${hiddenOnMobile ? 'hidden md:block' : ''}`} />
);

export default StellariumWrapper;
