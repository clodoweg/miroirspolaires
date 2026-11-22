import { useEffect, useMemo, useRef, useState } from 'react';
import { getActiveRoutes, type UpstreamRoute } from '@/config/upstream-routes';
import { effectiveFocalLengthMm, fovDegFor, type CameraSettings } from '@/lib/settings/userSettings';
import { AladinUnavailableError, loadFirstAladinRoute, pickReachableSkyRoute } from '@/lib/objects/aladin-routes';

interface Props {
    ra: number;
    dec: number;
    fovDeg: number;
    targetName?: string;
    camera?: CameraSettings;
}

/** Compute the four sky corners of a rotated rectangular sensor centred on
 *  (ra0, dec0) with the given on-sky width/height (deg) and rotation (deg).
 *  Uses a flat tangent-plane approximation — fine for amateur fields (≪ 10°). */
function computeFrameCorners(
    ra0: number,
    dec0: number,
    widthDeg: number,
    heightDeg: number,
    rotationDeg: number,
): [number, number][] {
    const cosDec = Math.cos((dec0 * Math.PI) / 180);
    const θ = (rotationDeg * Math.PI) / 180;
    const cos = Math.cos(θ);
    const sin = Math.sin(θ);
    const w = widthDeg / 2;
    const h = heightDeg / 2;
    // Local (a along long-axis, b along short-axis), corners in CCW order.
    const local: [number, number][] = [
        [-w, -h],
        [+w, -h],
        [+w, +h],
        [-w, +h],
    ];
    return local.map(([a, b]) => {
        const dx = a * cos - b * sin;
        const dy = a * sin + b * cos;
        const dec = dec0 + dy;
        const ra = ra0 + dx / Math.max(cosDec, 1e-6);
        return [ra, dec] as [number, number];
    });
}

declare global {
    interface Window {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        A?: any;
    }
}

// POURQUOI : Aladin ne publie pas de types. On reprend celui de `window.A`, déclaré plus haut.
type AladinApi = NonNullable<Window['A']>;

let aladinPromise: Promise<AladinApi> | null = null;

/** Charge la version « latest » du CDS : script classique qui expose `window.A`, avec sa feuille de style. */
function loadUmdScript(route: UpstreamRoute): Promise<AladinApi> {
    return new Promise((resolve, reject) => {
        if (window.A?.aladin) return resolve(window.A);
        if (!document.querySelector('link[data-aladin-css]')) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = route.baseUrl.replace(/\.js$/, '.css');
            link.dataset.aladinCss = 'true';
            document.head.appendChild(link);
        }
        const script = document.createElement('script');
        script.src = route.baseUrl;
        script.async = true;
        script.dataset.aladinJs = 'true';
        script.onload = () => (window.A ? resolve(window.A) : reject(new Error('window.A absent')));
        script.onerror = () => reject(new Error('script refusé'));
        document.head.appendChild(script);
    });
}

/**
 * URL absolue d'un module servi par ce site.
 *
 * WARNING: sécurité. Un import dynamique exécute le module avec les droits de la page : seule une URL du
 * même site est acceptée. Déclarée comme fonction d'échappement de la règle `no-unsanitized/method`
 * (`eslint.config.js`), qui refuse sinon tout `import()` d'une valeur calculée.
 *
 * @param path - Chemin ou URL du module.
 * @returns L'URL absolue (POURQUOI : en dev, Vite ajoute `?import` aux imports d'un chemin du site et refuse
 *   alors un fichier de `public/` ; il laisse passer une URL complète, servie telle quelle).
 * @throws Si l'URL n'est pas sur le même site.
 */
function toSameOriginModuleUrl(path: string): string {
    const url = new URL(path, window.location.href);
    if (url.origin !== window.location.origin) throw new Error(`Module hors du site refusé : ${url.origin}`);
    return url.href;
}

/** Charge une version en module ES (copie auto-hébergée). Ses styles sont inclus dans le module. */
async function loadEsmScript(route: UpstreamRoute): Promise<AladinApi> {
    const module = await import(/* @vite-ignore */ toSameOriginModuleUrl(route.baseUrl));
    window.A = module.default;
    return module.default;
}

/**
 * Charge Aladin depuis la première route active qui répond.
 *
 * POURQUOI : le CDS peut ne plus répondre du tout. Sans délai par route, le visualiseur resterait
 * sur « Chargement… » au lieu de passer à la copie auto-hébergée.
 */
function loadAladin(): Promise<AladinApi> {
    if (typeof window === 'undefined') return Promise.reject(new Error('No window'));
    if (window.A?.aladin) return Promise.resolve(window.A);
    if (aladinPromise) return aladinPromise;

    aladinPromise = loadFirstAladinRoute(getActiveRoutes('aladinScript'), (route) =>
        route.protocol === 'esm-script' ? loadEsmScript(route) : loadUmdScript(route),
    )
        .then(({ aladin }) => aladin)
        .catch((error) => {
            aladinPromise = null;
            throw error;
        });
    return aladinPromise;
}

export default function AladinViewer({ ra, dec, fovDeg, targetName, camera }: Props) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const aladinRef = useRef<any>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const frameOverlayRef = useRef<any>(null);
    const [error, setError] = useState<string | null>(null);
    const [ready, setReady] = useState(false);

    /** When a camera is set, frame the viewport so the sensor rectangle covers
     *  ~2/3 of the Aladin view (viewport FOV = 1.5× the larger sensor side).
     *  Falls back to the caller-provided fovDeg when no camera is configured
     *  or the sensor dimensions can't be derived. */
    const effectiveFovDeg = useMemo(() => {
        if (!camera) return fovDeg;
        const focal = effectiveFocalLengthMm(camera);
        const widthDeg = fovDegFor(camera.sensorWidthMm, focal);
        const heightDeg = fovDegFor(camera.sensorHeightMm, focal);
        const max = Math.max(widthDeg, heightDeg);
        return max > 0 ? max * 1.5 : fovDeg;
    }, [camera, fovDeg]);

    useEffect(() => {
        let cancelled = false;
        Promise.all([loadAladin(), pickReachableSkyRoute(getActiveRoutes('hipsSky'))])
            .then(async ([A, skyRoute]) => {
                await A.init;
                return { A, skyRoute };
            })
            .then(({ A, skyRoute }) => {
                if (cancelled || !containerRef.current) return;
                aladinRef.current = A.aladin(containerRef.current, {
                    target: `${ra} ${dec}`,
                    fov: effectiveFovDeg,
                    // POURQUOI une URL directe : l'entrée par défaut du registre d'Aladin renvoie vers IRSA, qui
                    // n'envoie pas d'en-têtes CORS et casse le chargement des tuiles.
                    survey: skyRoute.baseUrl,
                    cooFrame: 'ICRSd',
                    showReticle: true,
                    showZoomControl: true,
                    showLayersControl: true,
                    showFullscreenControl: true,
                    showGotoControl: false,
                    // POURQUOI : le pointeur interroge SIMBAD à Strasbourg en dur. Si le fond du CDS ne répond pas,
                    // le CDS est très probablement en panne et le pointeur échouerait à chaque clic.
                    showSimbadPointerControl: skyRoute.id === 'cds',
                    // POURQUOI : sinon Aladin envoie au démarrage des statistiques d'usage (URL de la page
                    // comprise) à alasky.unistra.fr, hôte absent de `connect-src` : requête bloquée par la CSP
                    // et erreur « Failed to fetch » dans la console.
                    log: false,
                });
                setReady(true);
            })
            .catch((e) =>
                setError(
                    e instanceof AladinUnavailableError
                        ? e.message
                        : 'le visualiseur n’a pas pu démarrer dans ce navigateur.',
                ),
            );
        return () => {
            cancelled = true;
        };
        // We deliberately initialise once; coordinate updates handled below.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Re-center when target changes.
    useEffect(() => {
        if (!ready || !aladinRef.current) return;
        try {
            aladinRef.current.gotoRaDec(ra, dec);
            aladinRef.current.setFov(effectiveFovDeg);
        } catch {
            // noop
        }
    }, [ra, dec, effectiveFovDeg, ready]);

    // (Re)draw the camera framing rectangle whenever target or camera change.
    useEffect(() => {
        if (!ready || !aladinRef.current || !camera || !window.A) return;
        const A = window.A;
        const focal = effectiveFocalLengthMm(camera);
        const widthDeg = fovDegFor(camera.sensorWidthMm, focal);
        const heightDeg = fovDegFor(camera.sensorHeightMm, focal);
        if (widthDeg <= 0 || heightDeg <= 0) return;

        const corners = computeFrameCorners(ra, dec, widthDeg, heightDeg, camera.rotationDeg);
        // Close the polygon explicitly for the polyline renderer.
        const path = [...corners, corners[0]];

        try {
            if (frameOverlayRef.current) {
                aladinRef.current.removeOverlay?.(frameOverlayRef.current);
                frameOverlayRef.current = null;
            }
            const overlay = A.graphicOverlay({
                name: 'Cadrage caméra',
                color: '#facc15',
                lineWidth: 2,
            });
            aladinRef.current.addOverlay(overlay);
            overlay.add(A.polyline(path));
            frameOverlayRef.current = overlay;
        } catch {
            // Aladin Lite may throw before the WebGL context is ready — ignore.
        }
    }, [
        ready,
        ra,
        dec,
        camera?.sensorWidthMm,
        camera?.sensorHeightMm,
        camera?.focalLengthMm,
        camera?.focalMultiplier,
        camera?.rotationDeg,
    ]);

    if (error) {
        return (
            <div
                role="status"
                className="flex aspect-video w-full flex-col items-center justify-center gap-1 rounded-lg border border-mp-glass-border bg-mp-glass-solid p-4 text-center text-sm text-mp-text-muted"
            >
                <p className="text-mp-text-primary">Visualiseur du ciel indisponible pour le moment</p>
                <p>Cause : {error}</p>
                <p>Les autres informations de la page restent valables. Réessayez plus tard.</p>
            </div>
        );
    }

    return (
        <div className="relative w-full">
            <div
                ref={containerRef}
                className="aspect-video w-full overflow-hidden rounded-lg border border-mp-glass-border bg-black"
                aria-label={targetName ? `Visualiseur Aladin Lite centré sur ${targetName}` : 'Visualiseur Aladin Lite'}
            />
            {!ready && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-mp-text-muted">
                    Chargement d'Aladin Lite…
                </div>
            )}
        </div>
    );
}
