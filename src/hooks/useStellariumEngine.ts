/**
 * Stellarium Engine Hook
 *
 * Manages the lifecycle of the Stellarium Web Engine: script loading,
 * WASM initialization, default configuration, and cleanup.
 * Handles React strict-mode double-mount safely.
 */
import { useState, useEffect, useRef, type RefObject } from 'react';

export type EngineStatus = 'loading' | 'ready' | 'error';

/**
 * Initializes and manages the Stellarium Web Engine lifecycle.
 * @param canvasRef - Ref to the canvas element for rendering
 * @returns Object with engineInstance, status ('loading' | 'ready' | 'error'), and errorMessage
 */
export function useStellariumEngine(canvasRef: RefObject<HTMLCanvasElement | null>) {
    const [status, setStatus] = useState<EngineStatus>('loading');
    const [errorMessage, setErrorMessage] = useState<string>('');
    const [engineInstance, setEngineInstance] = useState<any>(null);

    const initializing = useRef(false);
    const engineRef = useRef<any>(null); // Ref to hold engine for cleanup closure

    useEffect(() => {
        let mounted = true;

        const init = async () => {
            // Guard: Prevent double-init
            if (initializing.current) return;
            initializing.current = true;

            try {
                // 1. Load Script if needed (Robust Check)
                if (!(window as any).StelWebEngine) {
                    const scriptId = 'stellarium-script';
                    if (!document.getElementById(scriptId)) {
                        await new Promise<void>((resolve, reject) => {
                            const script = document.createElement('script');
                            script.id = scriptId;
                            script.src = '/js/stellarium-web-engine.js';
                            script.async = true;
                            script.onload = () => resolve();
                            script.onerror = () => reject(new Error('Échec du chargement du script Stellarium.'));
                            document.body.appendChild(script);
                        });
                    } else {
                        // Script exists but maybe not ready? Wait for global
                        let attempts = 0;
                        while (!(window as any).StelWebEngine && attempts < 20) {
                            await new Promise((r) => setTimeout(r, 100));
                            attempts++;
                        }
                    }
                }

                if (!mounted) return;

                // 2. Initialize Engine
                const StelWebEngine = (window as any).StelWebEngine;

                // Double check canvas ref availability (wait a bit if needed?)
                if (!canvasRef.current) {
                    // Slight retry incase of mounting race
                    await new Promise((r) => setTimeout(r, 100));
                    if (!canvasRef.current) {
                        throw new Error('Canvas introuvable.');
                    }
                }

                if (!StelWebEngine) {
                    throw new Error('Moteur Stellarium non disponible.');
                }

                // WARNING: Monkey-patch addEventListener to force passive:false for Stellarium
                // interaction events (wheel, touchmove, touchstart). Without this, the engine
                // cannot call preventDefault() and scroll/zoom conflicts with the browser.
                const targets = [window, document, canvasRef.current].filter(Boolean);

                targets.forEach((target) => {
                    if (!(target as any)._patchedAddEventListener) {
                        const originalAddEventListener = target!.addEventListener;

                        target!.addEventListener = function (
                            type: string,
                            listener: EventListenerOrEventListenerObject,
                            options?: boolean | AddEventListenerOptions,
                        ) {
                            let newOptions = options;
                            let newListener = listener;

                            // Only intercept interaction events
                            if (type === 'wheel' || type === 'touchmove' || type === 'touchstart') {
                                // A. Force passive: false
                                if (typeof options === 'boolean') {
                                    newOptions = { capture: options, passive: false };
                                } else if (typeof options === 'object') {
                                    newOptions = { ...options, passive: false };
                                } else {
                                    newOptions = { passive: false };
                                }

                                // B. Wrap Listener to silence non-cancelable warnings
                                if (typeof listener === 'function') {
                                    newListener = function (this: any, e: any) {
                                        // If event is not cancelable, stub preventDefault to avoid warning
                                        if (e && e.cancelable === false) {
                                            const originalPD = e.preventDefault;
                                            e.preventDefault = function () {}; // No-op
                                            const res = listener.call(this, e);
                                            e.preventDefault = originalPD;
                                            return res;
                                        }
                                        return listener.call(this, e);
                                    };
                                }
                                // Ideally handle EventListenerObject too, but engine likely uses functions.
                            }
                            return originalAddEventListener.call(this, type, newListener, newOptions);
                        };
                        (target as any)._patchedAddEventListener = true;
                    }
                });

                const instance = await StelWebEngine({
                    canvas: canvasRef.current,
                    wasmFile: '/js/stellarium-web-engine.wasm',
                    lang: 'fr',
                });

                if (!mounted) return;

                // 3. Configure Defaults
                configureEngineDefaults(instance);

                setEngineInstance(instance);
                engineRef.current = instance;
                setStatus('ready');
            } catch (err: any) {
                if (mounted) {
                    console.error('Stellarium Init Error:', err);
                    setStatus('error');
                    setErrorMessage(err.message || "Erreur d'initialisation.");
                }
            } finally {
                // We intentionally leave initializing.current = true after the first run.
                // React Strict Mode double-invokes effects; resetting to false here would
                // allow a second init() call to race against the first, corrupting the
                // Stellarium WASM context. The ref acts as a one-shot guard for the
                // entire lifetime of the component mount.
            }
        };

        // POURQUOI : Un délai de 400 ms laisse au navigateur le temps d'effectuer son
        // premier paint complet (LCP) et de traiter les tâches prioritaires (CSS, layout)
        // avant que l'initialisation WASM ne bloque le thread principal.
        // Valeur choisie pour passer sous le seuil TBT de 200ms de Lighthouse.
        const timer = setTimeout(() => {
            init();
        }, 400);

        return () => {
            mounted = false;
            clearTimeout(timer);
            // Cleanup Engine Instance to prevent OOM
            if (engineRef.current) {
                try {
                    const inst = engineRef.current;
                    if (typeof inst.destroy === 'function') {
                        inst.destroy();
                    } else if (typeof inst.delete === 'function') {
                        inst.delete();
                    }
                } catch (e) {
                    console.warn('Error destroying engine:', e);
                }
                engineRef.current = null;
                initializing.current = false; // Allow re-init if component mounts again
            }
        };
    }, []); // Empty deps to run only on mount/unmount

    return { engineInstance, status, errorMessage };
}

function configureEngineDefaults(instance: any) {
    const core = instance.core || instance;
    const baseUrl = '/data/';

    try {
        // Data Sources
        if (core.stars) {
            core.stars.addDataSource({ url: '/data/stars' });
            core.stars.labels_visible = true;
            core.stars.hints_visible = true;
            core.stars.labels_amount = 1; // Scale from 0 to 1, 0.5 for good density
            if (typeof core.stars.v !== 'undefined') core.stars.v++;
        }
        if (core.skycultures) core.skycultures.addDataSource({ url: baseUrl + 'skycultures/western', key: 'western' });
        if (core.dsos) core.dsos.addDataSource({ url: '/data/dso' });
        if (core.milkyway) core.milkyway.addDataSource({ url: baseUrl + 'surveys/milkyway' });

        // Visibility Settings
        if (core.atmosphere) core.atmosphere.visible = false;
        if (core.planets) core.planets.visible = false;
        if (core.solarSystem) core.solarSystem.visible = false;
        // Disable landscape (singular - may be legacy)
        if (core.landscape) {
            core.landscape.visible = false;
            core.landscape.opacity = 0;
        }

        // Disable landscapes (plural - confirmed working in browser debug)
        if (core.landscapes) {
            core.landscapes.visible = false;
            core.landscapes.fog_visible = false;
        }

        // Hide Cardinal Points (N, S, E, W)
        if (core.cardinals) {
            core.cardinals.visible = false;
        }

        // Force Mount Frame: Equatorial (1) to prevent horizon clipping?
        core.mount_frame = 1;

        // Force Projection: Stereographic (1) - Standard for Sky Maps & Matches Markers
        //core.projection = 1;

        // Initial Observer Setup (45N, South View)
        if (core.observer) {
            core.observer.latitude = 45;
            core.observer.longitude = 0;
            core.observer.yaw = Math.PI; // South
            core.observer.pitch = Math.PI / 4; // 45 deg Up
        }

        // Freeze Time (Autumn Equinox 2025)
        const fixedDate = '2025-09-23T00:00:00Z';
        if (core.setDate) {
            core.setDate(fixedDate);
            if (core.setRealTime) core.setRealTime();
            if (typeof core.timeRate !== 'undefined') core.timeRate = 0;
        }

        // FOV - Standardize to 100 degrees for main map
        if (core.fov !== undefined) {
            const fovDeg = 100;
            core.fov = fovDeg * (Math.PI / 180);
        }

        // Ensure Constellations are Visible
        if (core.constellations) {
            core.constellations.lines_visible = true;
            core.constellations.labels_visible = true;
            core.constellations.labels_amount = 1.0; // Max density for constellation names
            core.constellations.bounds_visible = false; // Hidden by default on main map
            core.constellations.show_only_pointed = false; // Show ALL
            core.constellations.images_visible = true; // Show constellation artwork
        }

        // Enable Equatorial Grid
        if (core.lines) {
            if (core.lines.equatorial) core.lines.equatorial.visible = true;
        }
        // Force update?
        if (core.update) core.update();

        // Debug Globals
        (window as any).activeInstance = instance;
        (window as any).core = core;
    } catch (err) {
        console.error('Error configuring engine:', err);
    }
}
