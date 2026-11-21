/**
 * @file CometsViewer.tsx
 * @description Outil interactif de planification des observations de comètes.
 * Il charge le catalogue depuis `/api/comets`, calcule les positions
 * célestes en temps réel pour l'observateur et propose une simulation orbitale SVG.
 *
 * Responsabilité principale :
 * - Gérer l'état des filtres, du tri et de la pagination des comètes.
 * - Assembler les briques communes aux petits corps (`small-bodies/`) et propres aux comètes (`comets/`).
 * Les calculs orbitaux vivent dans `src/lib/objects/orbits.ts`, le filtrage et le tri dans
 * `src/lib/objects/small-bodies.ts`.
 */

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { UserSettingsModal } from '@/components/Settings/UserSettingsBar';
import { ObservabilityModal } from '@/components/UI/ObservabilityModal';
import ObjectFilterBar, { type ActiveFilterChip } from '@/components/Filters/ObjectFilterBar';
import CustomSelect from '@/components/UI/CustomSelect';
import AstronomicalLoader from './AstronomicalLoader';
import { useUserSettings } from '@/lib/settings/useUserSettings';
import { getConstellationName } from '@/lib/constellations';
import { calculateCometScore } from '@/lib/objects/scoring';
import { julianDate } from '@/lib/astro/time';
import { sunEcliptic } from '@/lib/astro/sun';
import { calculateCometPosition } from '@/lib/objects/orbits';
import {
    COMPATIBILITY_FILTER_OPTIONS,
    VISIBILITY_FILTER_OPTIONS,
    commonSortValue,
    cometOrbitType,
    filterByQuickToggles,
    filterByRange,
    filterBySelects,
    filterByText,
    nextSortState,
    observeSmallBody,
    optionLabel,
    sortSmallBodies,
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
import CometRow from './comets/CometRow';
import {
    COMET_COLUMNS,
    COMET_RANGE_CHIPS,
    COMET_RANGE_FIELDS,
    COMET_TYPE_OPTIONS,
    type CalculatedComet,
    type Comet,
    type CometRangeKey,
    type CometSortColumn,
    type CometTypeFilter,
} from './comets/cometConfig';

const PAGE_SIZE = 100;

/**
 * Clé de tri d'une comète pour une colonne.
 *
 * @param c - Comète calculée.
 * @param col - Colonne triée.
 * @returns La valeur comparée.
 */
function cometSortValue(c: CalculatedComet, col: CometSortColumn): number | string | undefined {
    if (col === 'type') return cometOrbitType(c.e);
    if (col === 'r') return c.orbit.r;
    if (col === 'delta') return c.orbit.delta;
    return commonSortValue(c, col);
}

export default function CometsViewer() {
    // POURQUOI : identifiant stable pour associer chaque label de filtre à son premier champ (a11y).
    const filterId = useId();
    const { location, camera, isLocationCustom, isCameraCustom, setLocation, setCamera, resetLocation, resetCamera } =
        useUserSettings();

    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isSynthModalOpen, setIsSynthModalOpen] = useState(false);

    const [date, setDate] = useState<Date>(() => new Date());
    const formattedDate = useObservatoryDateLabel(location, date);
    const [query, setQuery] = useInitialQuery();
    const [expandedCometId, setExpandedCometId] = useState<string | null>(null);
    const [filterType, setFilterType] = useState<CometTypeFilter>('all');
    const [filterVisibleCeSoir, setFilterVisibleCeSoir] = useState(false);
    const [filterObservable, setFilterObservable] = useState(false);
    const [displayLimit, setDisplayLimit] = useState(PAGE_SIZE);

    const [showAdvanced, setShowAdvanced] = useState(false);
    const [ranges, setRanges] = useState(() => emptyRangeValues(COMET_RANGE_FIELDS));
    const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>('all');
    const [compatibilityFilter, setCompatibilityFilter] = useState<CompatibilityFilter>('all');
    const [constellationFilter, setConstellationFilter] = useState('all');

    const [sort, setSort] = useState<SortState<CometSortColumn> | null>({ col: 'score', dir: 'desc' });

    const setRange = useCallback((key: CometRangeKey, value: string) => {
        setRanges((prev) => ({ ...prev, [key]: value }));
    }, []);

    // POURQUOI: Réinitialise la limite d'affichage à chaque changement de critères
    useEffect(() => {
        setDisplayLimit(PAGE_SIZE);
    }, [
        query,
        filterType,
        filterVisibleCeSoir,
        filterObservable,
        date,
        ranges,
        visibilityFilter,
        compatibilityFilter,
        constellationFilter,
        sort,
    ]);

    const {
        items: comets,
        isLoading: isLoadingData,
        error: dataError,
    } = useCatalogue<Comet>(
        '/api/comets',
        'Erreur chargement comètes:',
        "Impossible de charger le catalogue d'éléments orbitaux des comètes.",
    );

    useAutoExpandFromQuery(query, comets, setExpandedCometId);

    const { aperture, limitMag, limitMagPhoto } = useInstrumentLimits(camera);

    // Calculs en temps réel pour toutes les comètes à la date donnée
    const calculatedComets = useMemo<CalculatedComet[]>(() => {
        if (comets.length === 0) return [];
        const jd = julianDate(date);
        const sun = sunEcliptic(jd);

        return comets.map((c) => {
            const orbit = calculateCometPosition(c, jd, sun);
            const observation = observeSmallBody(orbit, location, date, { limitMag, limitMagPhoto });
            const score = calculateCometScore(
                observation.hoursVisible,
                orbit.apparentMag,
                orbit.r,
                orbit.delta,
                observation.feasibility.label,
            );
            return { ...c, ...observation, orbit, score };
        });
    }, [comets, date, location, limitMag, limitMagPhoto]);

    const suggestions = useMemo(() => {
        const suggMap = new Map<string, string>();
        calculatedComets.forEach((c) => {
            if (c.name) suggMap.set(c.name, 'Comète');
            if (c.id) suggMap.set(c.id, 'Comète');
            if (c.constellation) suggMap.set(getConstellationName(c.constellation), 'Constellation');
        });
        return Array.from(suggMap.entries()).map(([value, label]) => ({ value, label }));
    }, [calculatedComets]);

    const constellationOptions = useMemo(() => {
        const set = new Set<string>();
        calculatedComets.forEach((c) => {
            if (c.constellation) set.add(c.constellation);
        });
        const list = Array.from(set)
            .map((code) => ({
                value: code,
                label: getConstellationName(code),
            }))
            .sort((a, b) => a.label.localeCompare(b.label));
        return [{ value: 'all', label: 'Toutes' }, ...list];
    }, [calculatedComets]);

    // Filtres actifs
    const activeFilters = useMemo<ActiveFilterChip[]>(() => {
        const chips: ActiveFilterChip[] = [];
        if (filterType !== 'all') {
            chips.push({ key: 'filterType', label: 'Type', value: optionLabel(COMET_TYPE_OPTIONS, filterType) });
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
        return [...chips, ...buildRangeChips(ranges, COMET_RANGE_CHIPS)];
    }, [filterType, ranges, visibilityFilter, compatibilityFilter, constellationFilter]);

    const handleClearFilter = useCallback(
        (key: string) => {
            if (key === 'filterType') setFilterType('all');
            else if (key === 'visibilityFilter') setVisibilityFilter('all');
            else if (key === 'compatibilityFilter') setCompatibilityFilter('all');
            else if (key === 'constellationFilter') setConstellationFilter('all');
            else if (key === 'filterVisibleCeSoir') setFilterVisibleCeSoir(false);
            else if (key === 'filterObservable') setFilterObservable(false);
            else if (key in ranges) setRange(key as CometRangeKey, '');
        },
        [ranges, setRange],
    );

    const handleResetFilters = useCallback(() => {
        setQuery('');
        setFilterType('all');
        setVisibilityFilter('all');
        setCompatibilityFilter('all');
        setConstellationFilter('all');
        setRanges(emptyRangeValues(COMET_RANGE_FIELDS));
        setFilterVisibleCeSoir(false);
        setFilterObservable(false);
    }, [setQuery]);

    // Filtrage et Tri des comètes
    // POURQUOI : toutes les dépendances sont listées ; l'ancienne liste en omettait plusieurs
    // (constellation, bornes), si bien que ces filtres ne s'appliquaient qu'au changement suivant.
    const filteredComets = useMemo(() => {
        let result = filterByText(calculatedComets, query, getConstellationName);

        // Filtre rapide de type d'orbite
        if (filterType === 'periodic') {
            result = result.filter((c) => c.e < 0.9);
        } else if (filterType === 'non_periodic') {
            result = result.filter((c) => c.e >= 0.9);
        }

        result = filterByQuickToggles(result, filterVisibleCeSoir, filterObservable);

        // Filtres avancés
        result = filterByRange(result, ranges.minApparentMag, ranges.maxApparentMag, (c) => c.orbit.apparentMag);
        result = filterByRange(result, ranges.minInclination, ranges.maxInclination, (c) => c.inclination);
        result = filterByRange(result, ranges.minPerihelion, ranges.maxPerihelion, (c) => c.q);
        result = filterByRange(result, ranges.minDelta, ranges.maxDelta, (c) => c.orbit.delta);
        result = filterByRange(result, ranges.minEccentricity, ranges.maxEccentricity, (c) => c.e);
        result = filterByRange(result, ranges.minScore, ranges.maxScore, (c) => c.score ?? 0);
        result = filterBySelects(result, visibilityFilter, compatibilityFilter, constellationFilter);

        return sortSmallBodies(result, sort, cometSortValue);
    }, [
        calculatedComets,
        query,
        filterType,
        filterVisibleCeSoir,
        filterObservable,
        ranges,
        visibilityFilter,
        compatibilityFilter,
        constellationFilter,
        sort,
    ]);

    const displayedComets = useMemo(() => {
        return filteredComets.slice(0, displayLimit);
    }, [filteredComets, displayLimit]);

    const toggleSort = (col: CometSortColumn) => {
        setSort((prev) => nextSortState(prev, col));
    };

    return (
        <div className="space-y-8">
            <ObjectFilterBar
                query={query}
                onQueryChange={setQuery}
                suggestions={suggestions}
                searchPlaceholder="Rechercher une comète (ex: Tempel, Hale-Bopp, 10P)..."
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
                    value={filterType}
                    onChange={(val) => setFilterType(val as CometTypeFilter)}
                    options={COMET_TYPE_OPTIONS}
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
                <RangeFilterList idPrefix={filterId} fields={COMET_RANGE_FIELDS} values={ranges} onChange={setRange} />
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
                    methodTitle="Méthode de calcul & Magnitude cométaire"
                    methodDescription="Les éléments orbitaux analytiques (Kepler & Barker) propagent les positions héliocentriques vers le plan J2000.0. La magnitude apparente est estimée selon la formule du Minor Planet Center : m = H + 5 log₁₀(Δ) + 2.5 k log₁₀(r)."
                />
            </ObservabilityModal>

            {!isLoadingData && !dataError && (
                <ResultCount displayed={displayedComets.length} total={filteredComets.length} />
            )}

            {dataError ? (
                <CatalogueError message={dataError} />
            ) : isLoadingData ? (
                <AstronomicalLoader
                    title="Téléchargement du catalogue de comètes"
                    message="Téléchargement des éléments orbitaux et calcul des magnitudes visuelles..."
                    query={query ? query : undefined}
                />
            ) : (
                <div className={SMALL_BODY_TABLE_CLASS}>
                    <SmallBodyTableHeader columns={COMET_COLUMNS} sort={sort} onSort={toggleSort} />

                    {displayedComets.map((c) => {
                        const isExpanded = expandedCometId === c.uniqueId;
                        return (
                            <CometRow
                                key={c.uniqueId}
                                comet={c}
                                isExpanded={isExpanded}
                                onToggle={() => setExpandedCometId(isExpanded ? null : c.uniqueId)}
                                limitMagPhoto={limitMagPhoto}
                                location={location}
                                date={date}
                                formattedDate={formattedDate}
                            />
                        );
                    })}

                    {filteredComets.length > displayLimit && (
                        <LoadMoreButton
                            remaining={filteredComets.length - displayLimit}
                            onLoadMore={() => setDisplayLimit((prev) => prev + PAGE_SIZE)}
                        />
                    )}
                </div>
            )}
        </div>
    );
}
