/**
 * @file ExoplanetViewer.tsx
 * @description Outil de planification et de simulation des transits d'exoplanètes.
 * Il calcule les éphémérides de transits locaux pour une date donnée à partir des
 * coordonnées de l'observateur, et évalue l'observabilité instrumentale (bruit photométrique)
 * en fonction du diamètre de l'instrument.
 *
 * Responsabilité principale :
 * - Porter l'état (réglages, date, recherche, filtres, tri, pagination, ligne dépliée)
 * - Charger le catalogue et lancer l'analyse de la nuit (`src/lib/objects/exoplanets.ts`)
 * - Assembler la barre de filtres, l'en-tête triable et les lignes (`./exoplanets/`)
 */

import { useState, useMemo, useEffect, useCallback } from 'react';
import { AlertTriangle } from 'lucide-react';
import UserSettingsBar, { UserSettingsModal } from '@/components/Settings/UserSettingsBar';
import { ObservabilityModal } from '@/components/UI/ObservabilityModal';
import { useUserSettings } from '@/lib/settings/useUserSettings';
import { findTelescope } from '@/lib/equipment/catalog';
import { getObservatoryOffsetHours } from '@/lib/objects/observation';
import { getConstellationName } from '@/lib/constellations';
import ObjectFilterBar from '@/components/Filters/ObjectFilterBar';
import AstronomicalLoader from './AstronomicalLoader';
import { foldAccents } from '@/utils/normalize';
import {
    analyseExoplanet,
    DEFAULT_EXOPLANET_FILTERS,
    DEFAULT_EXOPLANET_SORT,
    estimateApertureMm,
    filterExoplanets,
    getExoplanetFilterChips,
    nextExoplanetSort,
    sortExoplanets,
    type AnalysedExoplanet,
    type Exoplanet,
    type ExoplanetFilterCriteria,
    type ExoplanetSort,
    type ExoplanetSortColumn,
} from '@/lib/objects/exoplanets';
import ExoplanetFilterFields from './exoplanets/ExoplanetFilterFields';
import ExoplanetTableHeader from './exoplanets/ExoplanetTableHeader';
import ExoplanetRow from './exoplanets/ExoplanetRow';
import PhotometrySynthesis from './exoplanets/PhotometrySynthesis';

/** Taille d'une page de la liste (et du lot ajouté par « Charger plus »). */
const PAGE_SIZE = 100;

/**
 * Forme de comparaison exacte d'un nom pour l'ouverture par paramètre d'URL.
 *
 * @param value - Nom ou recherche.
 * @returns Le texte en minuscules, sans accents ni espaces.
 */
function compactName(value: string): string {
    return foldAccents(value).replace(/\s+/g, '').trim();
}

export default function ExoplanetViewer() {
    const { location, camera, isLocationCustom, isCameraCustom, setLocation, setCamera, resetLocation, resetCamera } =
        useUserSettings();

    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isSynthModalOpen, setIsSynthModalOpen] = useState(false);

    const [date, setDate] = useState<Date>(() => new Date());
    const tzOffset = useMemo(() => getObservatoryOffsetHours(location, date), [location, date]);
    const tzLabel = `UTC${tzOffset >= 0 ? '+' : ''}${tzOffset}`;
    const formattedDate = useMemo(() => {
        const localMs = date.getTime() + tzOffset * 3600000;
        const localDate = new Date(localMs);
        return localDate.toLocaleDateString('fr-FR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            timeZone: 'UTC',
        });
    }, [date, tzOffset]);

    const [query, setQuery] = useState(() => {
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            return params.get('q') || '';
        }
        return '';
    });
    const [expandedPlanetId, setExpandedPlanetId] = useState<string | null>(null);
    const [filters, setFilters] = useState<ExoplanetFilterCriteria>(DEFAULT_EXOPLANET_FILTERS);
    const [displayLimit, setDisplayLimit] = useState(PAGE_SIZE);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [sort, setSort] = useState<ExoplanetSort | null>(DEFAULT_EXOPLANET_SORT);

    const [analysedPlanets, setAnalysedPlanets] = useState<AnalysedExoplanet[]>([]);
    const [isCalculating, setIsCalculating] = useState(true);

    const setFilter = useCallback(
        <Key extends keyof ExoplanetFilterCriteria>(key: Key, value: ExoplanetFilterCriteria[Key]) => {
            setFilters((previous) => ({ ...previous, [key]: value }));
        },
        [],
    );

    const constellationOptions = useMemo(() => {
        const set = new Set<string>();
        analysedPlanets.forEach((p) => {
            if (p.constellation) set.add(p.constellation);
        });
        const list = Array.from(set)
            .map((code) => ({
                value: code,
                label: getConstellationName(code),
            }))
            .sort((a, b) => a.label.localeCompare(b.label));
        return [{ value: 'all', label: 'Toutes' }, ...list];
    }, [analysedPlanets]);

    // POURQUOI: Calcule de manière réactive les chips de filtres actifs pour alimenter l'interface générique.
    const activeFilters = useMemo(() => getExoplanetFilterChips(filters), [filters]);

    // POURQUOI: Permet de supprimer individuellement un filtre actif depuis sa chip.
    const handleClearFilter = useCallback((key: string) => {
        if (key in DEFAULT_EXOPLANET_FILTERS) {
            const filterKey = key as keyof ExoplanetFilterCriteria;
            setFilters((previous) => ({ ...previous, [filterKey]: DEFAULT_EXOPLANET_FILTERS[filterKey] }));
        }
    }, []);

    // POURQUOI: Réinitialise l'ensemble des filtres (recherche, observation, et filtres avancés).
    const handleResetFilters = useCallback(() => {
        setQuery('');
        setFilters(DEFAULT_EXOPLANET_FILTERS);
    }, []);

    // POURQUOI: Réinitialiser la limite d'affichage à chaque changement de critères de recherche,
    // de filtre d'observabilité ou de date d'observation afin de conserver d'excellentes performances.
    // Seuls les critères historiques déclenchent la remise à zéro (pas maxDepth, score ni constellation).
    useEffect(() => {
        setDisplayLimit(PAGE_SIZE);
    }, [
        query,
        filters.filterVisibleCeSoir,
        filters.filterObservable,
        filters.exoplanetCategory,
        date,
        filters.minMag,
        filters.maxMag,
        filters.minDepth,
        filters.transitFilter,
        filters.difficultyFilter,
        sort,
    ]);

    const [planets, setPlanets] = useState<Exoplanet[]>([]);
    const suggestions = useMemo(() => {
        const suggMap = new Map<string, string>();
        planets.forEach((p) => {
            if (p.name) suggMap.set(p.name, 'Exoplanète');
            if (p.commonName) suggMap.set(p.commonName, 'Exoplanète');
            if (p.starName) suggMap.set(p.starName, 'Étoile hôte');
            if (p.constellation) suggMap.set(getConstellationName(p.constellation), 'Constellation');
        });
        return Array.from(suggMap.entries()).map(([value, label]) => ({ value, label }));
    }, [planets]);
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [dataError, setDataError] = useState<string | null>(null);

    // Chargement asynchrone des exoplanètes depuis l'API
    useEffect(() => {
        setIsLoadingData(true);
        setDataError(null);
        fetch('/api/exoplanets')
            .then((res) => {
                if (!res.ok) throw new Error(`Erreur HTTP : ${res.status}`);
                return res.json();
            })
            .then((data: Exoplanet[]) => {
                setPlanets(data);
                setIsLoadingData(false);
            })
            .catch((err) => {
                console.error('Erreur chargement exoplanètes:', err);
                setDataError("Impossible de charger le catalogue d'exoplanètes.");
                setIsLoadingData(false);
            });
    }, []);

    // POURQUOI : Déplie l'exoplanète sélectionnée par paramètre d'URL (q) et ajuste
    // le filtre de catégorie (confirmée/candidate) pour s'assurer que la cible soit affichée.
    useEffect(() => {
        if (query && planets.length > 0) {
            const cleanQuery = compactName(query);
            const match = planets.find(
                (p) =>
                    (p.name && compactName(p.name) === cleanQuery) ||
                    (p.commonName && compactName(p.commonName) === cleanQuery) ||
                    p.id.toLowerCase().replace(/\s+/g, '').trim() === cleanQuery,
            );
            if (match) {
                setExpandedPlanetId(match.id);
                setFilter('exoplanetCategory', match.isCandidate ? 'candidates' : 'confirmed');
            }
        }
    }, [query, planets, setFilter]);

    // Calcul du diamètre de l'instrument (Aperture) à partir des réglages utilisateur
    const aperture = useMemo(
        () =>
            estimateApertureMm(
                findTelescope(camera.telescopeId)?.apertureMm,
                camera.focalLengthMm,
                camera.focalMultiplier,
            ),
        [camera],
    );

    // POURQUOI: Analyse chaque planète pour la date courante de manière asynchrone via un
    // setTimeout pour laisser au navigateur le temps de peindre le premier état et afficher
    // l'animation de chargement cosmique sans figer l'interface.
    useEffect(() => {
        setIsCalculating(true);
        const timer = setTimeout(() => {
            setAnalysedPlanets(planets.map((p) => analyseExoplanet(p, date, location, aperture)));
            setIsCalculating(false);
        }, 50);

        return () => clearTimeout(timer);
    }, [planets, date, location, aperture]);

    const filteredPlanets = useMemo(
        () => filterExoplanets(analysedPlanets, query, filters),
        [analysedPlanets, query, filters],
    );

    // POURQUOI : Date.now() est impur pendant le rendu ; l'instant de référence du tri
    // (transits à venir) est figé au montage.
    const [sortReferenceMs] = useState(() => Date.now());

    const sortedPlanets = useMemo(
        () => sortExoplanets(filteredPlanets, sort, sortReferenceMs),
        [filteredPlanets, sort, sortReferenceMs],
    );

    // POURQUOI: Pour éviter de saturer le DOM avec plus de 2600 éléments interactifs lourds
    // (contenant des animations et des graphiques SVG), nous affichons un sous-ensemble paginé.
    const displayedPlanets = useMemo(() => sortedPlanets.slice(0, displayLimit), [sortedPlanets, displayLimit]);

    const toggleSort = useCallback((key: ExoplanetSortColumn) => {
        setSort((current) => nextExoplanetSort(current, key));
    }, []);

    const togglePlanet = useCallback((planetId: string) => {
        setExpandedPlanetId((current) => (current === planetId ? null : planetId));
    }, []);

    if (dataError) {
        return (
            <div className="space-y-8">
                <UserSettingsBar
                    location={location}
                    camera={camera}
                    isLocationCustom={isLocationCustom}
                    isCameraCustom={isCameraCustom}
                    onLocationChange={setLocation}
                    onCameraChange={setCamera}
                    onResetLocation={resetLocation}
                    onResetCamera={resetCamera}
                    date={date}
                    onDateChange={setDate}
                />
                <div className="space-y-4 flex flex-col items-center justify-center px-6 py-20">
                    <AlertTriangle className="h-12 w-12 text-red-500" />
                    <p className="text-mp-text-secondary">{dataError}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Barre d'outils et de filtres */}
            <ObjectFilterBar
                query={query}
                onQueryChange={setQuery}
                suggestions={suggestions}
                searchPlaceholder="Rechercher une exoplanète, étoile, constellation..."
                isLoading={isLoadingData || isCalculating}
                showAdvanced={showAdvanced}
                onToggleAdvanced={() => setShowAdvanced(!showAdvanced)}
                activeFilters={activeFilters}
                onClearFilter={handleClearFilter}
                onReset={handleResetFilters}
                onOpenSettings={() => setIsSettingsOpen(true)}
                isSettingsCustom={isLocationCustom || isCameraCustom}
                onOpenSynth={() => setIsSynthModalOpen(true)}
                synthTitle="Synthèse"
            >
                <ExoplanetFilterFields
                    filters={filters}
                    onChange={setFilter}
                    constellationOptions={constellationOptions}
                />
            </ObjectFilterBar>

            <UserSettingsModal
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
                location={location}
                camera={camera}
                isLocationCustom={isLocationCustom}
                isCameraCustom={isCameraCustom}
                onLocationChange={setLocation}
                onCameraChange={setCamera}
                onResetLocation={resetLocation}
                onResetCamera={resetCamera}
                date={date}
                onDateChange={setDate}
            />

            {/* Modale de Synthèse Photométrique */}
            <ObservabilityModal
                isOpen={isSynthModalOpen}
                onClose={() => setIsSynthModalOpen(false)}
                title="Synthèse de votre configuration photométrique"
            >
                <PhotometrySynthesis aperture={aperture} />
            </ObservabilityModal>

            {/* Compteur d'éléments */}
            {!isLoadingData && !isCalculating && (
                <div className="font-sans text-sm text-mp-text-muted">
                    Affichage de{' '}
                    <span className="font-mono font-medium text-mp-text-primary">
                        {displayedPlanets.length.toLocaleString('fr-FR')}
                    </span>{' '}
                    sur{' '}
                    <span className="font-mono font-medium text-mp-text-primary">
                        {filteredPlanets.length.toLocaleString('fr-FR')}
                    </span>
                    .
                </div>
            )}

            {isLoadingData ? (
                <AstronomicalLoader
                    title="Chargement du catalogue d'exoplanètes"
                    message="Téléchargement des données de la NASA Exoplanet Archive et des éphémérides de transit..."
                    query={query ? query : undefined}
                />
            ) : isCalculating ? (
                <AstronomicalLoader
                    title="Calcul des éphémérides en cours"
                    message="Nous calculons les transits locaux, la hauteur des cibles et le rapport signal/bruit photométrique pour les exoplanètes..."
                    query={query ? query : undefined}
                />
            ) : (
                <div className="grid grid-cols-1 gap-y-3 md:grid-cols-[minmax(0,1fr)_max-content_max-content_max-content_max-content_max-content_max-content_max-content]">
                    {/* En-têtes de colonnes pour le tri (desktop uniquement) */}
                    <ExoplanetTableHeader sort={sort} onToggleSort={toggleSort} tzLabel={tzLabel} />

                    {/* Liste des exoplanètes */}
                    {displayedPlanets.map((p) => (
                        <ExoplanetRow
                            key={p.id}
                            planet={p}
                            isExpanded={expandedPlanetId === p.id}
                            onToggle={togglePlanet}
                            aperture={aperture}
                            location={location}
                            date={date}
                            tzLabel={tzLabel}
                            formattedDate={formattedDate}
                        />
                    ))}

                    {/* POURQUOI: Affiche un bouton pour charger une page supplémentaire si la liste filtrée dépasse la limite courante, évitant le gel du navigateur. */}
                    {filteredPlanets.length > displayLimit && (
                        <div className="flex justify-center pt-6">
                            <button
                                type="button"
                                onClick={() => setDisplayLimit((prev) => prev + PAGE_SIZE)}
                                className="cursor-pointer rounded-full border-0 bg-mp-accent px-6 py-2.5 font-sans text-xs font-medium tracking-uppercase text-mp-ui-black uppercase transition-colors hover:bg-mp-accent/90"
                            >
                                Charger {Math.min(PAGE_SIZE, filteredPlanets.length - displayLimit)} de plus
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
