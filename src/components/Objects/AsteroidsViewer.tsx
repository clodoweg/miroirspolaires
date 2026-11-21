/**
 * @file AsteroidsViewer.tsx
 * @description Outil interactif de planification des observations d'astéroïdes (PHAs).
 * Il charge le catalogue depuis `/api/asteroids`, calcule les positions célestes
 * en temps réel pour l'observateur et propose une simulation orbitale SVG.
 *
 * Responsabilité principale :
 * - Gérer l'état des filtres, du tri et de la pagination des astéroïdes.
 * - Assembler les briques communes aux petits corps (`small-bodies/`) et propres aux astéroïdes (`asteroids/`).
 * La propagation képlérienne depuis l'époque et la magnitude H-G de l'IAU vivent dans
 * `src/lib/objects/orbits.ts`, le filtrage et le tri dans `src/lib/objects/small-bodies.ts`.
 */

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { UserSettingsModal } from '@/components/Settings/UserSettingsBar';
import { ObservabilityModal } from '@/components/UI/ObservabilityModal';
import ObjectFilterBar, { type ActiveFilterChip } from '@/components/Filters/ObjectFilterBar';
import CustomSelect from '@/components/UI/CustomSelect';
import AstronomicalLoader from './AstronomicalLoader';
import { useUserSettings } from '@/lib/settings/useUserSettings';
import { getConstellationName } from '@/lib/constellations';
import { calculateAsteroidScore } from '@/lib/objects/scoring';
import { julianDate } from '@/lib/astro/time';
import { sunEcliptic } from '@/lib/astro/sun';
import { calculateAsteroidPosition } from '@/lib/objects/orbits';
import {
    COMPATIBILITY_FILTER_OPTIONS,
    VISIBILITY_FILTER_OPTIONS,
    classifyAsteroid,
    commonSortValue,
    filterByQuickToggles,
    filterByRange,
    filterBySelects,
    filterByText,
    isNearEarthAsteroid,
    matchesAsteroidTypeFilter,
    nextSortState,
    observeSmallBody,
    optionLabel,
    sortSmallBodies,
    type AsteroidTypeFilter,
    type CompatibilityFilter,
    type SortState,
    type VisibilityFilter,
} from '@/lib/objects/small-bodies';
import {
    useAutoExpandFromQuery,
    useCatalogue,
    useInitialQuery,
    useInstrumentLimits,
    useObservatoryDateLabel,
} from './small-bodies/hooks';
import { RangeFilterList, buildRangeChips, emptyRangeValues } from './small-bodies/RangeFilters';
import InstrumentSynthesis from './small-bodies/InstrumentSynthesis';
import { CatalogueError, LoadMoreButton, ResultCount } from './small-bodies/CatalogueStatus';
import { SMALL_BODY_TABLE_CLASS, SmallBodyTableHeader } from './small-bodies/SmallBodyTable';
import AsteroidRow from './asteroids/AsteroidRow';
import {
    ASTEROID_COLUMNS,
    ASTEROID_RANGE_CHIPS,
    ASTEROID_RANGE_FIELDS,
    ASTEROID_TYPE_CHIP_LABELS,
    ASTEROID_TYPE_OPTIONS,
    type Asteroid,
    type AsteroidQuickFilter,
    type AsteroidRangeKey,
    type AsteroidSortColumn,
    type CalculatedAsteroid,
} from './asteroids/asteroidConfig';

const PAGE_SIZE = 100;

/**
 * Clé de tri d'un astéroïde pour une colonne.
 *
 * @param a - Astéroïde calculé.
 * @param col - Colonne triée.
 * @returns La valeur comparée.
 */
function asteroidSortValue(a: CalculatedAsteroid, col: AsteroidSortColumn): number | string | undefined {
    if (col === 'type') return classifyAsteroid(a);
    if (col === 'a') return a.a;
    if (col === 'e') return a.e;
    return commonSortValue(a, col);
}

export default function AsteroidsViewer() {
    // POURQUOI : identifiant stable pour associer chaque label de filtre à son premier champ (a11y).
    const filterId = useId();
    const { location, camera, isLocationCustom, isCameraCustom, setLocation, setCamera, resetLocation, resetCamera } =
        useUserSettings();

    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isSynthModalOpen, setIsSynthModalOpen] = useState(false);

    const [date, setDate] = useState<Date>(() => new Date());
    const formattedDate = useObservatoryDateLabel(location, date);

    const [query, setQuery] = useInitialQuery();
    const [expandedAsteroidId, setExpandedAsteroidId] = useState<string | null>(null);
    const [quickFilter, setQuickFilter] = useState<AsteroidQuickFilter>('all');
    const [filterVisibleCeSoir, setFilterVisibleCeSoir] = useState(false);
    const [filterObservable, setFilterObservable] = useState(false);
    const [displayLimit, setDisplayLimit] = useState(PAGE_SIZE);

    const [showAdvanced, setShowAdvanced] = useState(false);
    const [ranges, setRanges] = useState(() => emptyRangeValues(ASTEROID_RANGE_FIELDS));
    const [typeFilter, setTypeFilter] = useState<AsteroidTypeFilter>('all');
    const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>('all');
    const [compatibilityFilter, setCompatibilityFilter] = useState<CompatibilityFilter>('all');
    const [constellationFilter, setConstellationFilter] = useState('all');

    const [sort, setSort] = useState<SortState<AsteroidSortColumn> | null>({ col: 'score', dir: 'desc' });

    const setRange = useCallback((key: AsteroidRangeKey, value: string) => {
        setRanges((prev) => ({ ...prev, [key]: value }));
    }, []);

    // POURQUOI: Réinitialise la limite d'affichage à chaque changement de critères
    useEffect(() => {
        setDisplayLimit(PAGE_SIZE);
    }, [
        query,
        quickFilter,
        filterVisibleCeSoir,
        filterObservable,
        date,
        typeFilter,
        ranges,
        visibilityFilter,
        compatibilityFilter,
        constellationFilter,
        sort,
    ]);

    // Chargement du catalogue via API
    const {
        items: asteroids,
        isLoading: isLoadingData,
        error: dataError,
    } = useCatalogue<Asteroid>(
        '/api/asteroids',
        'Erreur chargement astéroïdes:',
        "Impossible de charger le catalogue d'éléments orbitaux des astéroïdes.",
    );

    useAutoExpandFromQuery(query, asteroids, setExpandedAsteroidId);

    const { aperture, limitMag, limitMagPhoto } = useInstrumentLimits(camera);

    const calculatedAsteroids = useMemo<CalculatedAsteroid[]>(() => {
        if (asteroids.length === 0) return [];
        const jd = julianDate(date);
        const sun = sunEcliptic(jd);

        return asteroids.map((a) => {
            const orbit = calculateAsteroidPosition(a, jd, sun);
            const observation = observeSmallBody(orbit, location, date, { limitMag, limitMagPhoto });
            const score = calculateAsteroidScore(
                observation.hoursVisible,
                orbit.apparentMag,
                isNearEarthAsteroid(a.a, a.e),
                observation.feasibility.label,
            );
            return { ...a, ...observation, orbit, score };
        });
    }, [asteroids, date, location, limitMag, limitMagPhoto]);

    const suggestions = useMemo(() => {
        const suggMap = new Map<string, string>();
        calculatedAsteroids.forEach((a) => {
            if (a.name) suggMap.set(a.name, 'Astéroïde');
            if (a.id) suggMap.set(a.id, 'Astéroïde');
            if (a.constellation) suggMap.set(getConstellationName(a.constellation), 'Constellation');
        });
        return Array.from(suggMap.entries()).map(([value, label]) => ({ value, label }));
    }, [calculatedAsteroids]);

    const constellationOptions = useMemo(() => {
        const set = new Set<string>();
        calculatedAsteroids.forEach((a) => {
            if (a.constellation) set.add(a.constellation);
        });
        const list = Array.from(set)
            .map((code) => ({
                value: code,
                label: getConstellationName(code),
            }))
            .sort((a, b) => a.label.localeCompare(b.label));
        return [{ value: 'all', label: 'Toutes' }, ...list];
    }, [calculatedAsteroids]);

    const activeFilters = useMemo<ActiveFilterChip[]>(() => {
        const chips: ActiveFilterChip[] = [];
        if (typeFilter !== 'all') {
            chips.push({ key: 'typeFilter', label: 'Type', value: optionLabel(ASTEROID_TYPE_CHIP_LABELS, typeFilter) });
        }
        if (visibilityFilter !== 'all') {
            chips.push({
                key: 'visibilityFilter',
                label: 'Visibilité',
                value: optionLabel(VISIBILITY_FILTER_OPTIONS, visibilityFilter),
            });
        }
        if (compatibilityFilter !== 'all') {
            chips.push({
                key: 'compatibilityFilter',
                label: 'Faisabilité',
                value: optionLabel(COMPATIBILITY_FILTER_OPTIONS, compatibilityFilter),
            });
        }
        if (constellationFilter !== 'all') {
            chips.push({
                key: 'constellationFilter',
                label: 'Constellation',
                value: getConstellationName(constellationFilter),
            });
        }
        return [...chips, ...buildRangeChips(ranges, ASTEROID_RANGE_CHIPS)];
    }, [typeFilter, ranges, visibilityFilter, compatibilityFilter, constellationFilter]);

    const handleClearFilter = useCallback(
        (key: string) => {
            if (key === 'typeFilter') setTypeFilter('all');
            else if (key === 'visibilityFilter') setVisibilityFilter('all');
            else if (key === 'compatibilityFilter') setCompatibilityFilter('all');
            else if (key === 'constellationFilter') setConstellationFilter('all');
            else if (key === 'filterVisibleCeSoir') setFilterVisibleCeSoir(false);
            else if (key === 'filterObservable') setFilterObservable(false);
            else if (key in ranges) setRange(key as AsteroidRangeKey, '');
        },
        [ranges, setRange],
    );

    const handleResetFilters = useCallback(() => {
        setQuery('');
        setTypeFilter('all');
        setVisibilityFilter('all');
        setCompatibilityFilter('all');
        setConstellationFilter('all');
        setRanges(emptyRangeValues(ASTEROID_RANGE_FIELDS));
        setQuickFilter('all');
        setFilterVisibleCeSoir(false);
        setFilterObservable(false);
    }, [setQuery]);

    // POURQUOI : toutes les dépendances sont listées ; l'ancienne liste en omettait plusieurs
    // (constellation, type, bornes), si bien que ces filtres ne s'appliquaient qu'au changement suivant.
    const filteredAsteroids = useMemo(() => {
        let result = filterByText(calculatedAsteroids, query, getConstellationName);

        if (quickFilter === 'nea') {
            result = result.filter((a) => isNearEarthAsteroid(a.a, a.e));
        } else if (quickFilter === 'distant') {
            result = result.filter((a) => a.a > 5.5);
        }

        result = filterByQuickToggles(result, filterVisibleCeSoir, filterObservable);

        if ((typeFilter as string) !== 'all' && (typeFilter as string) !== '') {
            result = result.filter((a) => matchesAsteroidTypeFilter(a, typeFilter));
        }

        result = filterByRange(result, ranges.minApparentMag, ranges.maxApparentMag, (a) => a.orbit.apparentMag);
        result = filterByRange(result, ranges.minInclination, ranges.maxInclination, (a) => a.inclination);
        result = filterByRange(result, ranges.minEccentricity, ranges.maxEccentricity, (a) => a.e);
        result = filterByRange(result, ranges.minSemiMajor, ranges.maxSemiMajor, (a) => a.a);
        result = filterByRange(result, ranges.minScore, ranges.maxScore, (a) => a.score ?? 0);
        result = filterBySelects(result, visibilityFilter, compatibilityFilter, constellationFilter);

        return sortSmallBodies(result, sort, asteroidSortValue);
    }, [
        calculatedAsteroids,
        query,
        quickFilter,
        filterVisibleCeSoir,
        filterObservable,
        typeFilter,
        ranges,
        visibilityFilter,
        compatibilityFilter,
        constellationFilter,
        sort,
    ]);

    const displayedAsteroids = useMemo(() => {
        return filteredAsteroids.slice(0, displayLimit);
    }, [filteredAsteroids, displayLimit]);

    const toggleSort = (col: AsteroidSortColumn) => {
        setSort((prev) => nextSortState(prev, col));
    };

    return (
        <div className="space-y-8">
            <ObjectFilterBar
                query={query}
                onQueryChange={setQuery}
                suggestions={suggestions}
                searchPlaceholder="Rechercher un astéroïde (ex: Icarus, Geographos, Apollo, Apophis)..."
                isLoading={isLoadingData}
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
                <CustomSelect
                    label="Type"
                    value={typeFilter}
                    onChange={(val) => setTypeFilter(val as AsteroidTypeFilter)}
                    options={ASTEROID_TYPE_OPTIONS}
                />
                <CustomSelect
                    label="Visibilité"
                    value={visibilityFilter}
                    onChange={(val) => setVisibilityFilter(val as VisibilityFilter)}
                    options={VISIBILITY_FILTER_OPTIONS}
                />
                <CustomSelect
                    label="Faisabilité"
                    value={compatibilityFilter}
                    onChange={(val) => setCompatibilityFilter(val as CompatibilityFilter)}
                    options={COMPATIBILITY_FILTER_OPTIONS}
                />
                <CustomSelect
                    label="Constellation"
                    value={constellationFilter}
                    onChange={(val) => setConstellationFilter(val)}
                    options={constellationOptions}
                />
                <RangeFilterList
                    idPrefix={filterId}
                    fields={ASTEROID_RANGE_FIELDS}
                    values={ranges}
                    onChange={setRange}
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
                <InstrumentSynthesis
                    aperture={aperture}
                    limitMag={limitMag}
                    limitMagPhoto={limitMagPhoto}
                    camera={camera}
                    methodTitle="Méthode de calcul & Éléments orbitaux"
                    methodDescription="Les éléments orbitaux sont propagés par résolution de l'équation de Kepler pour les orbites elliptiques à partir de l'époque MPC. Le calcul de la position géocentrique s'appuie sur l’anomalie excentrique E et le système de magnitude H, G adopté par l’IAU."
                />
            </ObservabilityModal>

            {!isLoadingData && !dataError && (
                <ResultCount displayed={displayedAsteroids.length} total={filteredAsteroids.length} />
            )}

            {dataError ? (
                <CatalogueError message={dataError} />
            ) : isLoadingData ? (
                <AstronomicalLoader
                    title="Téléchargement du catalogue d'astéroïdes"
                    message="Téléchargement de la base de données orbitale des astéroïdes géocroiseurs (PHAs et objets distants)..."
                    query={query ? query : undefined}
                />
            ) : (
                <div className={SMALL_BODY_TABLE_CLASS}>
                    <SmallBodyTableHeader columns={ASTEROID_COLUMNS} sort={sort} onSort={toggleSort} />

                    {displayedAsteroids.map((a) => {
                        const isExpanded = expandedAsteroidId === a.uniqueId;
                        return (
                            <AsteroidRow
                                key={a.uniqueId}
                                asteroid={a}
                                isExpanded={isExpanded}
                                onToggle={() => setExpandedAsteroidId(isExpanded ? null : a.uniqueId)}
                                limitMagPhoto={limitMagPhoto}
                                location={location}
                                date={date}
                                formattedDate={formattedDate}
                            />
                        );
                    })}

                    {filteredAsteroids.length > displayLimit && (
                        <LoadMoreButton
                            remaining={filteredAsteroids.length - displayLimit}
                            onLoadMore={() => setDisplayLimit((prev) => prev + PAGE_SIZE)}
                        />
                    )}
                </div>
            )}
        </div>
    );
}
