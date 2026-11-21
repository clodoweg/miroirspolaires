import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Maximize, Minimize, Camera, Library } from 'lucide-react';
import type { Photo } from '../../lib/photos';
import PhotoList from './PhotoList';
import StellariumWrapper from './StellariumWrapper';
import StatsFilterBar from '../UI/StatsFilterBar';
import type { FilterConfig } from '@/types/filters';
import { hips2fitsUrl } from '@/lib/objects/hips2fits-url';

/** Build a transient `Photo` for an object resolved by the explorer API. Used
 *  when the typed identifier (e.g. faint NGC galaxy) falls outside the local
 *  catalogue cap — we still want a marker on the map. */
function synthesiseResolvedPhoto(query: string, name: string, ra: number, dec: number): Photo {
    return {
        id: -1,
        slug: query,
        title: name,
        type: '',
        constellation: '',
        observatories: [],
        locations: '',
        telescope: '',
        camera: '',
        mount: '',
        integrationTime: '',
        integrationSeconds: 0,
        uploaded: '',
        year: 0,
        ra: String(ra),
        dec: String(dec),
        raVal: ra,
        decVal: dec,
        description: '',
        objectsInField: [],
        astrobinUrl: '',
        acquisitionDetails: [],
        filters: [],
        filterString: '',
        imagePath: '',
        version: 'resolved',
        thumbnailUrl: hips2fitsUrl({ ra, dec, sizePx: 200 }),
        href: `/objets?q=${encodeURIComponent(query)}`,
    };
}

type MapMode = 'photos' | 'catalogue';

interface StellariumMapContainerProps {
    /** Personal astrophoto entries. */
    photos: Photo[];
    /** Catalogue entries (Messier, NGC, …). When provided, a mode toggle is shown. */
    cataloguePhotos?: Photo[];
    filterConfig: FilterConfig[];
    /** Filter config used in catalogue mode. */
    catalogueFilterConfig?: FilterConfig[];
}

function readInitialMode(): MapMode {
    if (typeof window === 'undefined') return 'catalogue';
    const m = new URLSearchParams(window.location.search).get('mode');
    return m === 'photos' ? 'photos' : 'catalogue';
}

const StellariumMapContainer: React.FC<StellariumMapContainerProps> = ({
    photos,
    cataloguePhotos,
    filterConfig,
    catalogueFilterConfig,
}) => {
    const hasCatalogueMode = !!cataloguePhotos && !!catalogueFilterConfig;
    const [mode, setMode] = useState<MapMode>(() => (hasCatalogueMode ? readInitialMode() : 'photos'));

    // Active dataset depends on mode.
    const activePhotos = mode === 'catalogue' && cataloguePhotos ? cataloguePhotos : photos;
    const activeFilters = mode === 'catalogue' && catalogueFilterConfig ? catalogueFilterConfig : filterConfig;
    const [filteredPhotos, setFilteredPhotos] = useState<Photo[]>(activePhotos);
    /** Object resolved on Enter that isn't in the local dataset (faint catalogue
     *  entry). Injected into the rendered set so a marker shows up. */
    const [resolvedTarget, setResolvedTarget] = useState<Photo | null>(null);

    /** Marker rendering cap (catalogue mode only). Keeps the per-frame projection
     *  loop responsive — applied AFTER the user's filters so each subset
     *  (NGC, Nebulae, Constellation, …) always shows its own 500 brightest. */
    const DISPLAY_CAP = 500;
    const displayedPhotos = React.useMemo(() => {
        const capped =
            mode !== 'catalogue' || filteredPhotos.length <= DISPLAY_CAP
                ? filteredPhotos
                : [...filteredPhotos].sort((a, b) => (a.mag ?? 99) - (b.mag ?? 99)).slice(0, DISPLAY_CAP);
        // Inject the SIMBAD-resolved transient marker (if any) so the user can
        // see where their typed object lives even when it's outside the cap.
        // Dedupe by normalised slug AND by coordinate proximity (~0.05°) so a
        // user typing "NGC7000" doesn't get a synthetic marker on top of the
        // catalogue's "NGC 7000" entry.
        if (resolvedTarget) {
            const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();
            const targetSlug = norm(resolvedTarget.slug);
            const tRa = resolvedTarget.raVal;
            const tDec = resolvedTarget.decVal;
            const alreadyPresent = capped.some((p) => {
                if (norm(p.slug) === targetSlug) return true;
                if (tRa != null && tDec != null && p.raVal != null && p.decVal != null) {
                    return Math.abs(p.raVal - tRa) < 0.05 && Math.abs(p.decVal - tDec) < 0.05;
                }
                return false;
            });
            if (!alreadyPresent) return [resolvedTarget, ...capped];
        }
        return capped;
    }, [filteredPhotos, mode, resolvedTarget]);
    const isCapped = mode === 'catalogue' && filteredPhotos.length > DISPLAY_CAP;
    const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [initialFov, setInitialFov] = useState<number | undefined>(undefined);

    // Fullscreen logic
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);

    const toggleFullscreen = useCallback(() => {
        if (!document.fullscreenElement) {
            mapContainerRef.current?.requestFullscreen().catch((err) => {
                console.error(`Error attempting to enable fullscreen: ${err.message}`);
            });
        } else {
            document.exitFullscreen();
        }
    }, []);

    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    // Target center for smart filtering
    const [targetCenter, setTargetCenter] = useState<{ ra: number; dec: number; fov?: number } | null>(null);

    const handleFilteredPhotosChange = useCallback(
        (newPhotos: Photo[]) => {
            setFilteredPhotos(newPhotos);

            // Smart Centering Logic
            // Only trigger if we have results, and the result set has changed (filtering applied)
            // We check if newPhotos.length < photos.length to ensure we don't center when clearing filters (showing all)
            // BUT: User might want to center even if clearing filters? No, usually "Reset" means see all.
            // Also checks if we are narrowing down (or just changing filter).

            // Refined criteria:
            // 1. We have results.
            // 2. It is a subset of all photos (not full sky).
            // 3. (Optional) Check dispersion.

            if (newPhotos.length > 0 && newPhotos.length < activePhotos.length) {
                // 1. Single Object Case
                if (newPhotos.length === 1) {
                    const p = newPhotos[0];
                    if (p.raVal != null && p.decVal != null) {
                        setTargetCenter({ ra: p.raVal, dec: p.decVal });
                    }
                } else {
                    // 2. Cluster/Constellation Case
                    // Calculate Centroid (Handling RA wrapping)
                    // RA (0-2PI) circular mean:
                    let sinRaSum = 0;
                    let cosRaSum = 0;
                    let decSum = 0;
                    let validCount = 0;

                    newPhotos.forEach((p) => {
                        if (p.raVal != null && p.decVal != null) {
                            // Conversions for averaging:
                            // Convert RA (degrees) to Radians
                            const raRad = p.raVal * (Math.PI / 180);
                            sinRaSum += Math.sin(raRad);
                            cosRaSum += Math.cos(raRad);
                            decSum += p.decVal;

                            validCount++;
                        }
                    });

                    if (validCount > 0) {
                        const avgDec = decSum / validCount;
                        const avgSin = sinRaSum / validCount;
                        const avgCos = cosRaSum / validCount;
                        let avgRa = Math.atan2(avgSin, avgCos) * (180 / Math.PI);
                        if (avgRa < 0) avgRa += 360;

                        setTargetCenter({ ra: avgRa, dec: avgDec });
                    }
                }
            }

            // Also handle deselection if needed
            if (selectedPhoto && !newPhotos.find((p) => p.id === selectedPhoto.id)) {
                setSelectedPhoto(null);
            }
        },
        [selectedPhoto, activePhotos, filteredPhotos.length],
    );

    // Handler to select photo and auto-close sidebar (important for mobile)
    const handlePhotoSelect = useCallback((photo: Photo) => {
        setSelectedPhoto(photo);
        setIsSidebarOpen(false);
    }, []);

    // Handle initial selection via slug in URL
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const slug = urlParams.get('slug');
        if (slug) {
            const photo = activePhotos.find((p) => p.slug === slug);
            if (photo) {
                setSelectedPhoto(photo);
                setInitialFov(25); // Zoomed view for deep links
            }
        }
    }, [activePhotos]);

    // Close sidebar when clicking outside
    const sidebarRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent | TouchEvent) => {
            if (isSidebarOpen && sidebarRef.current && !sidebarRef.current.contains(event.target as Node)) {
                // Check if the click was on the toggle button (prevent immediate reopening)
                // The toggle button is outside the sidebar, but we handle its click separately.
                // However, since we are in capture phase or bubble phase?
                // Let's rely on standard bubbling. If click is on toggle button, it will toggle (open).
                // If it is already open, and we click toggle button, it might close then reopen?
                // Actually the toggle button is hidden when sidebar is open! (line 85)
                // Wait, line 85: {!isSidebarOpen && ( <button ... )}.
                // So the toggle button DOES NOT EXIST when sidebar is open.
                // So any click outside sidebar is safe to close it.
                setIsSidebarOpen(false);
            }
        };

        // Bind the event listener
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('touchstart', handleClickOutside);

        return () => {
            // Unbind the event listener on clean up
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('touchstart', handleClickOutside);
        };
    }, [isSidebarOpen]);

    const handleModeChange = useCallback((next: MapMode) => {
        setMode(next);
        // Reset selection / target between modes; the dataset just changed.
        setSelectedPhoto(null);
        setTargetCenter(null);
        setResolvedTarget(null);
        if (typeof window === 'undefined') return;
        const url = new URL(window.location.href);
        if (next === 'photos') url.searchParams.set('mode', 'photos');
        else url.searchParams.delete('mode');
        // Drop filters scoped to the previous mode so the new one starts clean.
        [
            'type',
            'constellation',
            'catalogue',
            'mag',
            'observatories',
            'locations',
            'telescope',
            'camera',
            'year',
        ].forEach((k) => url.searchParams.delete(k));
        window.history.replaceState({}, '', url.toString());
    }, []);

    /** Resolve the typed identifier via the object explorer API (SIMBAD-backed)
     *  and centre the map on it. Used as a fallback when the local dataset
     *  doesn't include the typed object (typical for faint NGC galaxies that
     *  fall below the per-catalogue brightness cap). */
    const handleSearchSubmit = useCallback(async (term: string): Promise<boolean> => {
        try {
            const res = await fetch(`/api/object/resolve?q=${encodeURIComponent(term)}`);
            if (!res.ok) return false;
            const data = (await res.json()) as {
                canonicalName?: string;
                coords?: { ra?: number; dec?: number };
            };
            const ra = data?.coords?.ra;
            const dec = data?.coords?.dec;
            if (typeof ra !== 'number' || typeof dec !== 'number') return false;
            const name = data.canonicalName?.trim() || term;
            setResolvedTarget(synthesiseResolvedPhoto(term, name, ra, dec));
            setTargetCenter({ ra, dec });
            return true;
        } catch {
            return false;
        }
    }, []);

    // POURQUOI : Résout et centre la carte du ciel sur l'objet spécifié dans l'URL (?search=...)
    // dès le chargement de la page pour les liens profonds.
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const search = urlParams.get('search');
        if (search) {
            handleSearchSubmit(search);
        }
    }, [handleSearchSubmit]);

    return (
        <div className="flex h-full w-full flex-col overflow-hidden">
            {/* POURQUOI : Utilisation des classes utilitaires Tailwind (bg-mp-ui-black, border-mp-border)
                plutôt que des styles inline statiques pour s'adapter dynamiquement aux variables CSS du thème sombre. */}
            {/* Filter Bar at the top - fixed height */}
            <div className="relative z-50 flex shrink-0 items-center gap-3 border-b border-mp-border bg-mp-ui-black px-4">
                <div className="min-w-0 flex-1">
                    {/* Re-mount the filter bar when mode changes so its URL-derived
                        state reflects the new filterConfig + defaultValues. */}
                    <StatsFilterBar
                        key={mode}
                        filters={activeFilters}
                        photos={activePhotos}
                        onFilteredPhotosChange={handleFilteredPhotosChange}
                        onSearchSubmit={handleSearchSubmit}
                        rightContent={
                            hasCatalogueMode ? (
                                <div className="flex shrink-0 overflow-hidden rounded-lg border border-mp-border-light">
                                    <button
                                        type="button"
                                        onClick={() => handleModeChange('catalogue')}
                                        title="Catalogues"
                                        className={`flex cursor-pointer items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors sm:text-sm ${
                                            mode === 'catalogue'
                                                ? 'bg-mp-accent font-semibold text-mp-ui-black'
                                                : 'bg-mp-bg text-mp-text-muted hover:text-mp-text-heading'
                                        }`}
                                    >
                                        <Library className="h-4 w-4" />
                                        <span className="hidden sm:inline">Catalogues</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleModeChange('photos')}
                                        title="Mes photos"
                                        className={`flex cursor-pointer items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors sm:text-sm ${
                                            mode === 'photos'
                                                ? 'bg-mp-accent font-semibold text-mp-ui-black'
                                                : 'bg-mp-bg text-mp-text-muted hover:text-mp-text-heading'
                                        }`}
                                    >
                                        <Camera className="h-4 w-4" />
                                        <span className="hidden sm:inline">Mes photos</span>
                                    </button>
                                </div>
                            ) : undefined
                        }
                    />
                </div>
            </div>

            {/* Main content area - fills remaining space */}
            <div ref={mapContainerRef} className="relative flex min-h-0 flex-1">
                {/* Toggle Button - always visible on left edge */}
                {!isSidebarOpen && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation(); // Prevent immediate close trigger if consistent
                            setIsSidebarOpen(true);
                        }}
                        className="absolute top-4 left-4 z-30 rounded-md border border-mp-accent/30 bg-mp-glass-solid p-2 text-mp-accent shadow-lg transition-colors hover:bg-mp-glass-hover"
                        title="Afficher la liste des objets"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <line x1="3" y1="12" x2="21" y2="12"></line>
                            <line x1="3" y1="6" x2="21" y2="6"></line>
                            <line x1="3" y1="18" x2="21" y2="18"></line>
                        </svg>
                    </button>
                )}

                {/* Fullscreen Button - visible on right edge */}
                <button
                    onClick={toggleFullscreen}
                    className="absolute top-4 right-4 z-30 rounded-md border border-mp-accent/30 bg-mp-glass-solid p-2 text-mp-accent shadow-lg transition-colors hover:bg-mp-glass-hover"
                    title={isFullscreen ? 'Quitter le plein écran' : 'Plein écran'}
                >
                    {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
                </button>

                {/* Sidebar Overlay */}
                <div
                    ref={sidebarRef}
                    className={`absolute z-floating h-full overflow-hidden border-r border-mp-border-light bg-mp-glass-solid backdrop-blur-md transition-all duration-300 ease-in-out ${isSidebarOpen ? 'w-80 translate-x-0' : 'w-0 -translate-x-full'} `}
                >
                    <div className={`flex h-full w-80 flex-col ${!isSidebarOpen && 'hidden'}`}>
                        {/* Close Button */}
                        <button
                            onClick={() => setIsSidebarOpen(false)}
                            className="absolute top-2 right-2 z-10 rounded-sm p-1.5 text-mp-text-muted transition-colors hover:text-mp-text-heading"
                            title="Fermer"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="18"
                                height="18"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                        {/* Photo List */}
                        <div className="min-h-0 flex-1 overflow-hidden">
                            <PhotoList
                                photos={displayedPhotos}
                                onSelectPhoto={handlePhotoSelect}
                                selectedPhotoId={selectedPhoto?.id || undefined}
                            />
                        </div>
                    </div>
                </div>

                {/* Main Map Area - always full width */}
                <div className="relative h-full w-full overflow-hidden rounded-xl bg-mp-ui-black">
                    <StellariumWrapper
                        selectedPhoto={selectedPhoto}
                        photos={displayedPhotos}
                        onPhotoSelect={setSelectedPhoto}
                        initialFov={initialFov}
                        targetCenter={targetCenter}
                    />
                    {isCapped && (
                        <div className="pointer-events-none absolute top-14 left-1/2 z-30 -translate-x-1/2 rounded-full border border-mp-accent/30 bg-mp-glass-solid px-3 py-1.5 text-xs text-mp-text-body shadow-lg backdrop-blur-md">
                            Affichage des {DISPLAY_CAP} plus brillants sur {filteredPhotos.length}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default StellariumMapContainer;
