/**
 * @file VariableStarsViewer.tsx
 * @description Outil interactif de planification des observations d'étoiles variables.
 * Ce composant calcule la hauteur locale de chaque cible variable, évalue son
 * observabilité par rapport à la nuit astronomique, et détermine sa compatibilité instrumentale.
 * Chaque ligne se déplie sur une fiche explicative et une simulation SVG animée
 * des mécanismes physiques sous-jacents (éclipses, pulsations, sursauts de novae).
 *
 * Responsabilité principale :
 * - Porter l'état des filtres, du tri, de la pagination et des réglages utilisateur.
 * - Charger le catalogue paginé depuis /api/variable-stars et analyser chaque cible.
 * - Assembler la barre de filtres, la synthèse d'équipement et la grille de résultats.
 *
 * Les calculs purs sont dans `src/lib/objects/variable-stars.ts` ; les sous-composants
 * (filtres, ligne, détail, simulateur) dans `./variable-stars/`.
 */

import { useState, useMemo, useEffect, useCallback } from 'react';
import { AlertTriangle } from 'lucide-react';
import { UserSettingsModal } from '@/components/Settings/UserSettingsBar';
import { ObservabilityModal } from '@/components/UI/ObservabilityModal';
import { useUserSettings } from '@/lib/settings/useUserSettings';
import { findTelescope } from '@/lib/equipment/catalog';
import { getObservatoryOffsetHours } from '@/lib/objects/observation';
import { getConstellationName } from '@/lib/constellations';
import Panel from '@/components/UI/Panel';
import ObjectFilterBar, { type ActiveFilterChip } from '@/components/Filters/ObjectFilterBar';
import AstronomicalLoader from './AstronomicalLoader';
import { getLimitMagnitude, getLimitMagnitudePhoto } from '@/lib/astro/instrument';
import { foldAccents } from '@/utils/normalize';
import {
    analyseVariableStar,
    filterVariableStars,
    getActiveFilterChips,
    nextVariableStarSort,
    sortVariableStars,
    type AnalysedVariableStar,
    type CompatibilityFilter,
    type VariableStar,
    type VariableStarSort,
    type VariableStarSortColumn,
    type VariableStarType,
    type VisibilityFilter,
} from '@/lib/objects/variable-stars';
import { useVariableStarSuggestions } from './variable-stars/useVariableStarSuggestions';
import VariableStarsAdvancedFilters from './variable-stars/VariableStarsAdvancedFilters';
import EquipmentSynthesis from './variable-stars/EquipmentSynthesis';
import VariableStarsTableHeader from './variable-stars/VariableStarsTableHeader';
import VariableStarRow from './variable-stars/VariableStarRow';

/**
 * Composant principal de la page d'observation des Étoiles Variables.
 *
 * @returns L'interface utilisateur React pour l'outil de planification.
 */
export default function VariableStarsViewer() {
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
    const [stars, setStars] = useState<VariableStar[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [dataError, setDataError] = useState<string | null>(null);
    const [query, setQuery] = useState(() => {
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            return params.get('q') || '';
        }
        return '';
    });
    const { suggestions, handleSearchInputChange } = useVariableStarSuggestions();

    const [expandedStarId, setExpandedStarId] = useState<string | null>(null);
    const [filterType, setFilterType] = useState<'all' | VariableStarType>('all');
    const [filterVisibleCeSoir, setFilterVisibleCeSoir] = useState(false);
    const [filterObservable, setFilterObservable] = useState(false);

    const [page, setPage] = useState(1);
    const [totalStars, setTotalStars] = useState(0);
    const [isFetching, setIsFetching] = useState(false);

    const [showAdvanced, setShowAdvanced] = useState(false);
    const [minMag, setMinMag] = useState('');
    const [maxMag, setMaxMag] = useState('');
    const [minAmplitude, setMinAmplitude] = useState('');
    const [maxAmplitude, setMaxAmplitude] = useState('');
    const [minPeriod, setMinPeriod] = useState('');
    const [maxPeriod, setMaxPeriod] = useState('');
    const [minScore, setMinScore] = useState('');
    const [maxScore, setMaxScore] = useState('');
    const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>('all');
    const [compatibilityFilter, setCompatibilityFilter] = useState<CompatibilityFilter>('all');
    const [constellationFilter, setConstellationFilter] = useState('all');

    const [sort, setSort] = useState<VariableStarSort>({ col: 'score', dir: 'desc' });

    const [analysedStars, setAnalysedStars] = useState<AnalysedVariableStar[]>([]);
    const [isCalculating, setIsCalculating] = useState(true);

    const constellationOptions = useMemo(() => {
        const set = new Set<string>();
        analysedStars.forEach((s) => {
            if (s.constellation) set.add(s.constellation);
        });
        const list = Array.from(set)
            .map((code) => ({
                value: code,
                label: getConstellationName(code),
            }))
            .sort((a, b) => a.label.localeCompare(b.label));
        return [{ value: 'all', label: 'Toutes' }, ...list];
    }, [analysedStars]);

    // POURQUOI: Calcule de manière réactive les chips de filtres actifs pour alimenter l'interface générique.
    const activeFilters = useMemo<ActiveFilterChip[]>(
        () =>
            getActiveFilterChips({
                filterType,
                minMag,
                maxMag,
                minAmplitude,
                maxAmplitude,
                minPeriod,
                maxPeriod,
                minScore,
                maxScore,
                visibilityFilter,
                compatibilityFilter,
                constellationFilter,
            }),
        [
            filterType,
            minMag,
            maxMag,
            minAmplitude,
            maxAmplitude,
            minPeriod,
            maxPeriod,
            minScore,
            maxScore,
            visibilityFilter,
            compatibilityFilter,
            constellationFilter,
        ],
    );

    // POURQUOI: Permet de supprimer individuellement un filtre actif depuis sa chip.
    const handleClearFilter = useCallback((key: string) => {
        if (key === 'filterType') setFilterType('all');
        else if (key === 'visibilityFilter') setVisibilityFilter('all');
        else if (key === 'compatibilityFilter') setCompatibilityFilter('all');
        else if (key === 'constellationFilter') setConstellationFilter('all');
        else if (key === 'minMag') setMinMag('');
        else if (key === 'maxMag') setMaxMag('');
        else if (key === 'minAmplitude') setMinAmplitude('');
        else if (key === 'maxAmplitude') setMaxAmplitude('');
        else if (key === 'minPeriod') setMinPeriod('');
        else if (key === 'maxPeriod') setMaxPeriod('');
        else if (key === 'minScore') setMinScore('');
        else if (key === 'maxScore') setMaxScore('');
        else if (key === 'filterVisibleCeSoir') setFilterVisibleCeSoir(false);
        else if (key === 'filterObservable') setFilterObservable(false);
    }, []);

    // POURQUOI: Réinitialise l'ensemble des filtres (recherche, types, visibilité, et filtres avancés).
    const handleResetFilters = useCallback(() => {
        setQuery('');
        setFilterType('all');
        setVisibilityFilter('all');
        setCompatibilityFilter('all');
        setConstellationFilter('all');
        setMinMag('');
        setMaxMag('');
        setMinAmplitude('');
        setMaxAmplitude('');
        setMinPeriod('');
        setMaxPeriod('');
        setMinScore('');
        setMaxScore('');
        setFilterVisibleCeSoir(false);
        setFilterObservable(false);
    }, []);

    // Diamètre de l'instrument (Aperture) résolu
    const aperture = useMemo(() => {
        const tel = findTelescope(camera.telescopeId);
        if (tel?.apertureMm) return tel.apertureMm;
        const focal = camera.focalLengthMm * (camera.focalMultiplier ?? 1);
        // Fallback empirique si pas d'instrument sélectionné (D = F / 6)
        return Math.max(20, Math.min(2000, Math.round(focal / 6)));
    }, [camera]);

    // Magnitude limite visuelle théorique
    const limitMag = useMemo(() => getLimitMagnitude(aperture), [aperture]);

    // Magnitude limite photométrique : prend en compte l'échelle de plaque de la caméra.
    // POURQUOI: Un pixel plus petit (longue focale) dilue le fond de ciel → meilleur SNR sur les étoiles faibles.
    // Calculée systématiquement (caméra par défaut ou personnalisée).
    const limitMagPhoto = useMemo(() => {
        const effectiveFocal = camera.focalLengthMm * (camera.focalMultiplier ?? 1);
        return getLimitMagnitudePhoto(aperture, camera.pixelSizeUm, effectiveFocal);
    }, [aperture, camera]);

    const [retryNonce, setRetryNonce] = useState(0);

    // WARNING: cet effet doit rester déclaré avant celui du chargement : React exécute les effets
    // dans l'ordre de déclaration, et la remise à la page 1 doit précéder la nouvelle requête.
    // Réinitialiser la page et vider la liste lors d'un changement de filtre
    useEffect(() => {
        setPage(1);
        setStars([]);
    }, [
        query,
        filterType,
        minMag,
        maxMag,
        minAmplitude,
        sort,
        filterVisibleCeSoir,
        filterObservable,
        location.lat,
        location.lon,
        date,
        aperture,
    ]);

    // Chargement des données depuis l'API paginée
    useEffect(() => {
        // POURQUOI : annuler la requête précédente, sinon une réponse arrivée après un changement
        // de filtre (page 1) pouvait écraser ou compléter à tort la nouvelle liste.
        const controller = new AbortController();
        setIsFetching(true);
        setDataError(null);

        const params = new URLSearchParams({
            page: String(page),
            limit: '100',
            search: query,
            type: filterType,
            minMag,
            maxMag,
            minAmplitude,
            sortCol: sort?.col || 'name',
            sortDir: sort?.dir || 'asc',
            lat: String(location.lat),
            lon: String(location.lon),
            date: date.toISOString(),
            filterVisibleCeSoir: String(filterVisibleCeSoir),
            filterObservable: String(filterObservable),
            aperture: String(aperture),
            limitMagPhoto: String(limitMagPhoto),
        });

        fetch(`/api/variable-stars?${params.toString()}`, { signal: controller.signal })
            .then((res) => {
                if (!res.ok) throw new Error(`Erreur HTTP : ${res.status}`);
                return res.json();
            })
            .then((data: { stars: VariableStar[]; total: number; isExact?: boolean }) => {
                if (page === 1) {
                    setStars(data.stars);
                } else {
                    setStars((prev) => {
                        const existingIds = new Set(prev.map((s) => s.id));
                        const newStars = data.stars.filter((s) => !existingIds.has(s.id));
                        return [...prev, ...newStars];
                    });
                }
                setTotalStars(data.total);
                setIsLoadingData(false);
                setIsFetching(false);
            })
            .catch((err) => {
                if (controller.signal.aborted) return;
                console.error('Erreur chargement étoiles:', err);
                setDataError("Impossible de charger le catalogue d'étoiles variables.");
                setIsLoadingData(false);
                setIsFetching(false);
            });
        return () => controller.abort();
    }, [
        retryNonce,
        page,
        query,
        filterType,
        minMag,
        maxMag,
        minAmplitude,
        sort,
        location.lat,
        location.lon,
        date,
        filterVisibleCeSoir,
        filterObservable,
        aperture,
    ]);

    // POURQUOI : Déplie automatiquement la première étoile variable correspondante
    // à la recherche de l'URL (q) pour améliorer la navigation directe depuis la recherche.
    useEffect(() => {
        if (query && stars.length > 0) {
            const cleanQuery = foldAccents(query).replace(/\s+/g, '').trim();
            const match = stars.find(
                (s) =>
                    (s.name && foldAccents(s.name).replace(/\s+/g, '').trim() === cleanQuery) ||
                    s.id.toLowerCase().replace(/\s+/g, '').trim() === cleanQuery,
            );
            if (match) {
                setExpandedStarId(match.id);
            }
        }
    }, [query, stars]);

    // Évaluation différée (50 ms) de l'observabilité, de la compatibilité et du score de chaque cible
    useEffect(() => {
        if (stars.length === 0) {
            setIsCalculating(false);
            return;
        }
        setIsCalculating(true);
        const timer = setTimeout(() => {
            setAnalysedStars(stars.map((star) => analyseVariableStar(star, location, date, limitMag, limitMagPhoto)));
            setIsCalculating(false);
        }, 50);

        return () => clearTimeout(timer);
    }, [stars, location, date, limitMag, limitMagPhoto]);

    // Application des filtres et de la recherche textuelle
    const filteredStars = useMemo(
        () =>
            filterVariableStars(analysedStars, {
                query,
                filterType,
                filterVisibleCeSoir,
                filterObservable,
                minMag,
                maxMag,
                minAmplitude,
                maxAmplitude,
                minPeriod,
                maxPeriod,
                minScore,
                maxScore,
                visibilityFilter,
                compatibilityFilter,
                constellationFilter,
            }),
        [
            analysedStars,
            query,
            filterType,
            filterVisibleCeSoir,
            filterObservable,
            minMag,
            maxMag,
            minAmplitude,
            maxAmplitude,
            minPeriod,
            maxPeriod,
            minScore,
            maxScore,
            visibilityFilter,
            compatibilityFilter,
            constellationFilter,
        ],
    );

    // Comme nous paginons côté serveur, displayedStars contient directement les étoiles chargées et triées.
    const displayedStars = useMemo(() => sortVariableStars(filteredStars, sort), [filteredStars, sort]);

    const toggleSort = (key: VariableStarSortColumn) => setSort(nextVariableStarSort(sort, key));

    return (
        <div className="space-y-8">
            {/* Section filtres et recherche */}
            <ObjectFilterBar
                query={query}
                onQueryChange={setQuery}
                suggestions={suggestions}
                onSearchInputChange={handleSearchInputChange}
                searchPlaceholder="Rechercher une étoile, constellation, type de variable..."
                isLoading={isFetching || isCalculating}
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
                <VariableStarsAdvancedFilters
                    filterType={filterType}
                    onFilterTypeChange={setFilterType}
                    visibilityFilter={visibilityFilter}
                    onVisibilityFilterChange={setVisibilityFilter}
                    compatibilityFilter={compatibilityFilter}
                    onCompatibilityFilterChange={setCompatibilityFilter}
                    constellationFilter={constellationFilter}
                    onConstellationFilterChange={setConstellationFilter}
                    constellationOptions={constellationOptions}
                    minMag={minMag}
                    maxMag={maxMag}
                    onMinMagChange={setMinMag}
                    onMaxMagChange={setMaxMag}
                    minAmplitude={minAmplitude}
                    maxAmplitude={maxAmplitude}
                    onMinAmplitudeChange={setMinAmplitude}
                    onMaxAmplitudeChange={setMaxAmplitude}
                    minPeriod={minPeriod}
                    maxPeriod={maxPeriod}
                    onMinPeriodChange={setMinPeriod}
                    onMaxPeriodChange={setMaxPeriod}
                    minScore={minScore}
                    maxScore={maxScore}
                    onMinScoreChange={setMinScore}
                    onMaxScoreChange={setMaxScore}
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

            {/* Modale de Synthèse d'Équipement */}
            <ObservabilityModal
                isOpen={isSynthModalOpen}
                onClose={() => setIsSynthModalOpen(false)}
                title="Bilan d'observabilité de votre équipement"
            >
                <EquipmentSynthesis
                    aperture={aperture}
                    limitMag={limitMag}
                    limitMagPhoto={limitMagPhoto}
                    camera={camera}
                />
            </ObservabilityModal>

            {/* Nombre d'étoiles filtrées */}
            {!isLoadingData && !isFetching && !isCalculating && !dataError && (
                <div className="font-sans text-sm text-mp-text-muted">
                    Affichage de{' '}
                    <span className="font-mono font-medium text-mp-text-primary">
                        {stars.length.toLocaleString('fr-FR')}
                    </span>{' '}
                    sur{' '}
                    <span className="font-mono font-medium text-mp-text-primary">
                        {(totalStars > 0 ? totalStars : stars.length).toLocaleString('fr-FR')}
                    </span>
                    .
                </div>
            )}

            {dataError ? (
                <div className="mx-auto space-y-4 flex max-w-lg flex-col items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/5 px-6 py-12 text-center">
                    <AlertTriangle className="h-8 w-8 text-red-400" />
                    <div className="space-y-1">
                        <h3 className="font-serif text-base font-light tracking-wide text-red-400">
                            Erreur de chargement
                        </h3>
                        <p className="text-xs leading-relaxed text-mp-text-muted">{dataError}</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            // POURQUOI : relance l'effet de chargement de l'API (l'ancien code lisait
                            // /data/variable_stars.json, supprimé : le bouton ne pouvait qu'échouer).
                            setIsLoadingData(true);
                            setRetryNonce((nonce) => nonce + 1);
                        }}
                        className="cursor-pointer rounded-lg border-0 bg-mp-accent px-4 py-2 text-xs font-semibold text-mp-ui-black uppercase transition-colors hover:bg-mp-accent/90"
                    >
                        Réessayer
                    </button>
                </div>
            ) : isLoadingData || isFetching ? (
                <AstronomicalLoader
                    title="Téléchargement du catalogue d'étoiles variables"
                    message="Téléchargement des données AAVSO, GCVS et éphémérides de variabilité..."
                    query={query ? query : undefined}
                />
            ) : isCalculating ? (
                <AstronomicalLoader
                    title="Calcul des éphémérides en cours"
                    message="Calcul des coordonnées célestes, des phases de variabilité et de l'observabilité locale..."
                    query={query ? query : undefined}
                />
            ) : stars.length === 0 ? (
                <Panel padding={8} className="text-center text-mp-text-muted">
                    {query?.trim()
                        ? 'Aucune étoile variable ne correspond à cette recherche.'
                        : "Aucune étoile variable ne correspond à ces critères d'observation ce soir."}
                </Panel>
            ) : (
                <div className="grid grid-cols-1 gap-y-3 md:grid-cols-[minmax(0,1fr)_max-content_max-content_max-content_max-content_max-content_max-content_max-content]">
                    {/* En-têtes de colonnes pour le tri (desktop uniquement) */}
                    <VariableStarsTableHeader sort={sort} onSort={toggleSort} />

                    {/* Grille/Liste des étoiles */}
                    {displayedStars.map((s) => {
                        const isExpanded = expandedStarId === s.id;
                        return (
                            <VariableStarRow
                                key={s.id}
                                star={s}
                                isExpanded={isExpanded}
                                onToggle={() => setExpandedStarId(isExpanded ? null : s.id)}
                                date={date}
                                location={location}
                                tzLabel={tzLabel}
                                formattedDate={formattedDate}
                                aperture={aperture}
                                limitMag={limitMag}
                                limitMagPhoto={limitMagPhoto}
                            />
                        );
                    })}

                    {/* Affiche un bouton pour charger des étoiles supplémentaires à partir de l'API paginée.
                         POURQUOI : totalStars = -1 signifie que le COUNT a expiré → on affiche le bouton
                         tant que le dernier lot était plein (100 étoiles = probablement plus à charger). */}
                    {(totalStars < 0 ? stars.length > 0 && stars.length % 100 === 0 : stars.length < totalStars) && (
                        <div className="flex justify-center pt-6">
                            <button
                                type="button"
                                onClick={() => setPage((prev) => prev + 1)}
                                disabled={isFetching}
                                className="cursor-pointer rounded-full border-0 bg-mp-accent px-6 py-2.5 font-sans text-xs font-medium tracking-uppercase text-mp-ui-black uppercase transition-colors hover:bg-mp-accent/90 disabled:opacity-50"
                            >
                                {isFetching
                                    ? 'Chargement...'
                                    : `Charger ${Math.min(100, totalStars > 0 ? totalStars - stars.length : 100)} de plus`}
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
