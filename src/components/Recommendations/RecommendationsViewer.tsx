/**
 * @file src/components/Recommendations/RecommendationsViewer.tsx
 * @description Composant interactif pour la consultation et le filtrage des recommandations d'observation.
 *
 * POURQUOI : Présente à l'astronome amateur la liste calculée des cibles remarquables (score 0-100),
 * intégrée dans une barre d'outils et de filtrage unifiée (ObjectFilterBar), synchronisée avec
 * la localisation et le matériel de l'utilisateur.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, LayoutGrid, LayoutList } from 'lucide-react';
import { UserSettingsModal } from '@/components/Settings/UserSettingsBar';
import { ObservabilityModal } from '@/components/UI/ObservabilityModal';
import { useUserSettings } from '@/lib/settings/useUserSettings';
import type { ObsLocation } from '@/lib/objects/observation';
import type { Recommendation } from '@/lib/recommendations/score';
import EntryListView, { defaultCatalogueColumns, type ListColumn } from '@/components/Catalogues/EntryListView';
import { getConstellationName } from '@/lib/constellations';
import { formatMonthYear } from '@/lib/format';
import { typeLabel, categorize } from '@/lib/catalogues/classify';
import ObjectFilterBar, { type ActiveFilterChip } from '@/components/Filters/ObjectFilterBar';
import CustomSelect from '@/components/UI/CustomSelect';
import { findTelescope } from '@/lib/equipment/catalog';
import { NO_AUTOFILL_PROPS } from '@/utils/constants';
import { foldAccents } from '@/utils/normalize';
import { quantizeCoordinate, quantizeDateToHour } from '@/lib/recommendations/query';

interface ApiResponse {
    referenceMonthStart: string;
    items: Recommendation[];
    poolSize: number;
    location: ObsLocation;
}

interface InitialPayload {
    referenceMonthStart: string;
    items: Recommendation[];
    poolSize: number;
    location: ObsLocation;
}

interface Props {
    initialData?: InitialPayload | null;
    initialDate?: string;
}

const OFFSET_COLOR: Record<number, string> = {
    [-1]: 'text-mp-text-secondary',
    [0]: 'text-emerald-300',
    [1]: 'text-mp-accent',
};

export interface EvaluatedRecommendation extends Recommendation {
    feasibility: {
        status: 'gerable' | 'delicat' | 'inobservable' | 'hors_portee';
        label: string;
        color: string;
    };
}

export default function RecommendationsViewer({ initialData = null, initialDate }: Props) {
    const { location, camera, isLocationCustom, isCameraCustom, setLocation, setCamera, resetLocation, resetCamera } =
        useUserSettings();
    const [date, setDate] = useState<Date>(() => (initialDate ? new Date(initialDate) : new Date()));
    const [items, setItems] = useState<Recommendation[]>(initialData?.items ?? []);
    const [reference, setReference] = useState<Date | null>(
        initialData ? new Date(initialData.referenceMonthStart) : null,
    );
    const [poolSize, setPoolSize] = useState<number | null>(initialData?.poolSize ?? null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isSynthModalOpen, setIsSynthModalOpen] = useState(false);
    const [viewMode, setViewMode] = useState<'grid' | 'table'>('table');
    const [displayLimit, setDisplayLimit] = useState(100);

    // Filtres principaux & avancés
    const [typeFilter, setTypeFilter] = useState('all');
    const [visibilityFilter, setVisibilityFilter] = useState<'all' | 'parfaite' | 'observable' | 'basse' | 'invisible'>(
        'all',
    );
    const [compatibilityFilter, setCompatibilityFilter] = useState<
        'all' | 'gerable' | 'delicat' | 'inobservable' | 'hors_portee'
    >('all');
    const [constellationFilter, setConstellationFilter] = useState('all');
    const [catalogueFilter, setCatalogueFilter] = useState('all');

    const [minMag, setMinMag] = useState('');
    const [maxMag, setMaxMag] = useState('');
    const [minNightHours, setMinNightHours] = useState('');
    const [maxNightHours, setMaxNightHours] = useState('');
    const [minSize, setMinSize] = useState('');
    const [maxSize, setMaxSize] = useState('');
    const [minPeakAlt, setMinPeakAlt] = useState('');
    const [maxPeakAlt, setMaxPeakAlt] = useState('');
    const [minScore, setMinScore] = useState('');
    const [maxScore, setMaxScore] = useState('');

    const skipInitialFetch = useRef(!!initialData);

    const fetchRecs = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({
                // POURQUOI : valeurs quantifiées pour partager le cache CDN de la route entre visiteurs.
                lat: String(quantizeCoordinate(location?.lat ?? 48.8566)),
                lon: String(quantizeCoordinate(location?.lon ?? 2.3522)),
                name: location?.name ?? 'Paris',
                date: quantizeDateToHour(date).toISOString(),
            });
            if (import.meta.env.DEV) params.set('_cb', String(Date.now()));
            const res = await fetch(`/api/recommendations?${params.toString()}`);
            const payload: ApiResponse | { error: string } = await res.json();
            if (!res.ok) {
                setError(('error' in payload && payload.error) || `Erreur ${res.status}`);
                return;
            }
            const data = payload as ApiResponse;
            setItems(data.items);
            setReference(new Date(data.referenceMonthStart));
            setPoolSize(data.poolSize);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
        }
    }, [location, date]);

    useEffect(() => {
        if (skipInitialFetch.current) {
            skipInitialFetch.current = false;
            return;
        }
        fetchRecs();
    }, [fetchRecs]);

    // Évaluation de la faisabilité pour chaque recommandation selon le matériel
    const evaluatedItems = useMemo<EvaluatedRecommendation[]>(() => {
        const aperture = (() => {
            const tel = findTelescope(camera?.telescopeId);
            if (tel?.apertureMm) return tel.apertureMm;
            const focal = (camera?.focalLengthMm ?? 400) * (camera?.focalMultiplier ?? 1);
            return Math.max(20, Math.min(2000, Math.round(focal / 6)));
        })();

        const limitVisual = 2.7 + 5 * Math.log10(aperture);
        const effectiveFocal = (camera?.focalLengthMm ?? 400) * (camera?.focalMultiplier ?? 1);
        const fRatio = effectiveFocal / Math.max(1, aperture);
        const gainFratio = 5 * Math.log10(Math.max(1, 8.0 / fRatio));
        const limitMagPhoto = Math.min(24, Math.max(10, limitVisual + 3.0 + gainFratio));

        return items.map((rec) => {
            let feasibility: EvaluatedRecommendation['feasibility'] = {
                label: 'Gérable',
                color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
                status: 'gerable',
            };

            if (rec.peakAltDeg < 15 || (rec.nightHoursAbove30 ?? 0) === 0) {
                feasibility = {
                    label: 'Inobservable',
                    color: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
                    status: 'inobservable',
                };
            } else if (typeof rec.mag === 'number' && rec.mag > limitMagPhoto) {
                feasibility = {
                    label: 'Setup insuffisant',
                    color: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
                    status: 'hors_portee',
                };
            } else if (rec.peakAltDeg < 30 || (typeof rec.mag === 'number' && rec.mag > limitMagPhoto - 1.5)) {
                feasibility = {
                    label: 'Délicat',
                    color: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
                    status: 'delicat',
                };
            }

            return {
                ...rec,
                feasibility,
            };
        });
    }, [items, camera]);

    const availableTypes = useMemo(() => {
        const set = new Set<string>();
        items.forEach((it) => {
            const cat = categorize(it.type);
            if (cat) set.add(cat);
        });
        const order: Record<string, number> = { Nébuleuse: 1, Galaxie: 2, Amas: 3, Étoile: 4, Autre: 5 };
        const sortedCats = Array.from(set).sort((a, b) => (order[a] ?? 99) - (order[b] ?? 99));
        return [{ value: 'all', label: 'Tous' }, ...sortedCats.map((cat) => ({ value: cat, label: cat }))];
    }, [items]);

    const availableConstellations = useMemo(() => {
        const set = new Set<string>();
        items.forEach((it) => {
            if (it.constellation) set.add(it.constellation);
        });
        const list = Array.from(set)
            .map((c) => ({
                value: c,
                label: getConstellationName(c) || c,
            }))
            .sort((a, b) => (a.label || '').localeCompare(b.label || '', 'fr'));
        return [{ value: 'all', label: 'Toutes' }, ...list];
    }, [items]);

    const availableCatalogues = useMemo(() => {
        const set = new Set<string>();
        items.forEach((it) => {
            if (it.catalogue) set.add(it.catalogue);
        });
        const list = Array.from(set)
            .map((c) => ({
                value: c,
                label: c.toUpperCase(),
            }))
            .sort((a, b) => a.label.localeCompare(b.label));
        return [{ value: 'all', label: 'Tous' }, ...list];
    }, [items]);

    const filtered = useMemo(() => {
        const qClean = foldAccents(query).trim();

        return evaluatedItems.filter((it) => {
            if (qClean) {
                const constName = it.constellation ? getConstellationName(it.constellation) : '';
                const constNameClean = foldAccents(constName);
                const haystack = foldAccents(
                    `${it.id} ${it.label} ${it.commonName ?? ''} ${typeLabel(it.type)} ${categorize(it.type)} ${it.constellation ?? ''} ${constNameClean}`,
                );
                if (!haystack.includes(qClean)) return false;
            }

            if (typeFilter !== 'all' && typeFilter !== '') {
                const cat = categorize(it.type);
                const detailed = typeLabel(it.type);
                if (typeFilter !== cat && typeFilter !== detailed && typeFilter !== it.type) return false;
            }

            if (constellationFilter !== 'all' && constellationFilter !== '') {
                if (it.constellation !== constellationFilter) return false;
            }

            if (catalogueFilter !== 'all' && catalogueFilter !== '') {
                if (it.catalogue?.toLowerCase() !== catalogueFilter.toLowerCase()) return false;
            }

            if ((visibilityFilter as string) !== 'all' && (visibilityFilter as string) !== '') {
                if (visibilityFilter === 'parfaite' && it.peakAltDeg < 60) return false;
                if (visibilityFilter === 'observable' && it.peakAltDeg < 30) return false;
                if (visibilityFilter === 'basse' && (it.peakAltDeg >= 30 || it.peakAltDeg < 15)) return false;
                if (visibilityFilter === 'invisible' && it.peakAltDeg >= 15) return false;
            }

            if ((compatibilityFilter as string) !== 'all' && (compatibilityFilter as string) !== '') {
                if (it.feasibility.status !== compatibilityFilter) return false;
            }

            if (minMag !== '') {
                const limit = parseFloat(minMag);
                if (!isNaN(limit) && (typeof it.mag !== 'number' || it.mag < limit)) return false;
            }
            if (maxMag !== '') {
                const limit = parseFloat(maxMag);
                if (!isNaN(limit) && (typeof it.mag !== 'number' || it.mag > limit)) return false;
            }

            if (minNightHours !== '') {
                const limit = parseFloat(minNightHours);
                if (!isNaN(limit) && (it.nightHoursAbove30 ?? 0) < limit) return false;
            }
            if (maxNightHours !== '') {
                const limit = parseFloat(maxNightHours);
                if (!isNaN(limit) && (it.nightHoursAbove30 ?? 0) > limit) return false;
            }

            if (minSize !== '') {
                const limit = parseFloat(minSize);
                if (!isNaN(limit) && (typeof it.sizeArcmin !== 'number' || it.sizeArcmin < limit)) return false;
            }
            if (maxSize !== '') {
                const limit = parseFloat(maxSize);
                if (!isNaN(limit) && (typeof it.sizeArcmin !== 'number' || it.sizeArcmin > limit)) return false;
            }

            if (minPeakAlt !== '') {
                const limit = parseFloat(minPeakAlt);
                if (!isNaN(limit) && it.peakAltDeg < limit) return false;
            }
            if (maxPeakAlt !== '') {
                const limit = parseFloat(maxPeakAlt);
                if (!isNaN(limit) && it.peakAltDeg > limit) return false;
            }

            if (minScore !== '') {
                const limit = parseFloat(minScore);
                if (!isNaN(limit) && (it.score ?? 0) < limit) return false;
            }
            if (maxScore !== '') {
                const limit = parseFloat(maxScore);
                if (!isNaN(limit) && (it.score ?? 0) > limit) return false;
            }

            return true;
        });
    }, [
        evaluatedItems,
        query,
        typeFilter,
        constellationFilter,
        catalogueFilter,
        visibilityFilter,
        compatibilityFilter,
        minMag,
        maxMag,
        minNightHours,
        maxNightHours,
        minSize,
        maxSize,
        minPeakAlt,
        maxPeakAlt,
        minScore,
        maxScore,
    ]);

    useEffect(() => {
        setDisplayLimit(100);
    }, [
        query,
        typeFilter,
        constellationFilter,
        catalogueFilter,
        visibilityFilter,
        compatibilityFilter,
        minMag,
        maxMag,
        minNightHours,
        maxNightHours,
        minSize,
        maxSize,
        minPeakAlt,
        maxPeakAlt,
        minScore,
        maxScore,
    ]);

    const displayedRecommendations = useMemo(() => {
        return filtered.slice(0, displayLimit);
    }, [filtered, displayLimit]);

    const activeFilterChips = useMemo<ActiveFilterChip[]>(() => {
        const chips: ActiveFilterChip[] = [];
        if (typeFilter !== 'all') {
            chips.push({ key: 'typeFilter', label: 'Type', value: typeFilter });
        }
        if (visibilityFilter !== 'all') {
            const visibilityLabels: Record<string, string> = {
                parfaite: 'Parfaite (>60°)',
                observable: 'Observable (>30°)',
                basse: 'Très basse (<30°)',
                invisible: 'Invisible',
            };
            chips.push({
                key: 'visibilityFilter',
                label: 'Visibilité',
                value: visibilityLabels[visibilityFilter] || visibilityFilter,
            });
        }
        if (compatibilityFilter !== 'all') {
            const compatibilityLabels: Record<string, string> = {
                gerable: 'Gérable',
                delicat: 'Délicat',
                inobservable: 'Inobservable',
                hors_portee: 'Setup insuffisant',
            };
            chips.push({
                key: 'compatibilityFilter',
                label: 'Faisabilité',
                value: compatibilityLabels[compatibilityFilter] || compatibilityFilter,
            });
        }
        if (constellationFilter !== 'all') {
            chips.push({
                key: 'constellationFilter',
                label: 'Constellation',
                value: getConstellationName(constellationFilter),
            });
        }
        if (catalogueFilter !== 'all') {
            chips.push({ key: 'catalogueFilter', label: 'Catalogue', value: catalogueFilter.toUpperCase() });
        }

        if (minMag) chips.push({ key: 'minMag', label: 'Mag Min', value: minMag });
        if (maxMag) chips.push({ key: 'maxMag', label: 'Mag Max', value: maxMag });
        if (minNightHours) chips.push({ key: 'minNightHours', label: 'Nuit > 30° Min', value: `${minNightHours}h` });
        if (maxNightHours) chips.push({ key: 'maxNightHours', label: 'Nuit > 30° Max', value: `${maxNightHours}h` });
        if (minSize) chips.push({ key: 'minSize', label: 'Taille Min', value: `${minSize}′` });
        if (maxSize) chips.push({ key: 'maxSize', label: 'Taille Max', value: `${maxSize}′` });
        if (minPeakAlt) chips.push({ key: 'minPeakAlt', label: 'Hauteur Min', value: `${minPeakAlt}°` });
        if (maxPeakAlt) chips.push({ key: 'maxPeakAlt', label: 'Hauteur Max', value: `${maxPeakAlt}°` });
        if (minScore) chips.push({ key: 'minScore', label: 'Score Min', value: minScore });
        if (maxScore) chips.push({ key: 'maxScore', label: 'Score Max', value: maxScore });

        return chips;
    }, [
        typeFilter,
        visibilityFilter,
        compatibilityFilter,
        constellationFilter,
        catalogueFilter,
        minMag,
        maxMag,
        minNightHours,
        maxNightHours,
        minSize,
        maxSize,
        minPeakAlt,
        maxPeakAlt,
        minScore,
        maxScore,
    ]);

    const handleClearFilterChip = useCallback((key: string) => {
        if (key === 'typeFilter') setTypeFilter('all');
        else if (key === 'visibilityFilter') setVisibilityFilter('all');
        else if (key === 'compatibilityFilter') setCompatibilityFilter('all');
        else if (key === 'constellationFilter') setConstellationFilter('all');
        else if (key === 'catalogueFilter') setCatalogueFilter('all');
        else if (key === 'minMag') setMinMag('');
        else if (key === 'maxMag') setMaxMag('');
        else if (key === 'minNightHours') setMinNightHours('');
        else if (key === 'maxNightHours') setMaxNightHours('');
        else if (key === 'minSize') setMinSize('');
        else if (key === 'maxSize') setMaxSize('');
        else if (key === 'minPeakAlt') setMinPeakAlt('');
        else if (key === 'maxPeakAlt') setMaxPeakAlt('');
        else if (key === 'minScore') setMinScore('');
        else if (key === 'maxScore') setMaxScore('');
    }, []);

    const handleResetFilters = useCallback(() => {
        setQuery('');
        setTypeFilter('all');
        setVisibilityFilter('all');
        setCompatibilityFilter('all');
        setConstellationFilter('all');
        setCatalogueFilter('all');
        setMinMag('');
        setMaxMag('');
        setMinNightHours('');
        setMaxNightHours('');
        setMinSize('');
        setMaxSize('');
        setMinPeakAlt('');
        setMaxPeakAlt('');
        setMinScore('');
        setMaxScore('');
    }, []);

    const columns = useMemo<ListColumn<EvaluatedRecommendation>[]>(() => {
        const base = defaultCatalogueColumns<EvaluatedRecommendation>();

        const feasibilityCol: ListColumn<EvaluatedRecommendation> = {
            key: 'feasibility',
            header: 'Faisabilité',
            align: 'center',
            sortKey: 'feasibility',
            compare: (a, b) => {
                const feasibilityMap: Record<string, number> = {
                    gerable: 0,
                    delicat: 1,
                    inobservable: 2,
                    hors_portee: 3,
                };
                return (feasibilityMap[a.feasibility.status] ?? 4) - (feasibilityMap[b.feasibility.status] ?? 4);
            },
            cellClassName: 'text-center whitespace-nowrap',
            render: (e) => {
                const tooltip =
                    e.feasibility.status === 'gerable'
                        ? 'Gérable : Cible bien visible ce soir (hauteur > 30°) et parfaitement adaptée à votre matériel.'
                        : e.feasibility.status === 'delicat'
                          ? "Délicat : Cible basse (< 30°) ou proche de la limite d'ouverture / magnitude de votre instrument."
                          : e.feasibility.status === 'inobservable'
                            ? "Inobservable : Cible sous l'horizon ou n'atteignant pas une hauteur suffisante ce soir."
                            : 'Setup insuffisant : Magnitude trop faible pour le diamètre et le temps de pose de votre instrument.';
                return (
                    <span
                        title={tooltip}
                        className={`inline-block cursor-help rounded-sm border px-2 py-0.5 text-[11px] ${e.feasibility.color}`}
                    >
                        {e.feasibility.label}
                    </span>
                );
            },
        };

        const scoreCol: ListColumn<EvaluatedRecommendation> = {
            key: 'score',
            header: 'Score',
            align: 'right',
            sortKey: 'score',
            compare: (a, b) => (a.score ?? 0) - (b.score ?? 0),
            cellClassName: 'font-mono font-bold whitespace-nowrap text-mp-accent text-right',
            render: (e) => (
                <span
                    title="Score d'observabilité (0-100) basé sur l'altitude maximale au zénith (>30°), la durée utile nocturne, la taille apparente de l'objet et la période de visibilité optimale."
                    className="inline-flex cursor-help items-center justify-end gap-1 rounded-full border border-mp-accent/20 bg-mp-accent/10 px-2 py-0.5 font-mono text-xs font-bold text-mp-accent"
                >
                    <Sparkles className="h-3 w-3" />
                    {e.score ?? 0}
                </span>
            ),
        };

        const trailingCols: ListColumn<EvaluatedRecommendation>[] = [
            {
                key: 'peakMonth',
                header: 'Mois',
                align: 'left',
                sortKey: 'peakMonth',
                compare: (a, b) => new Date(a.peakMonthStart).getTime() - new Date(b.peakMonthStart).getTime(),
                cellClassName: 'whitespace-nowrap text-left',
                hideOnMobile: true,
                render: (e) => (
                    <span className={OFFSET_COLOR[e.peakOffset]}>{formatMonthYear(new Date(e.peakMonthStart))}</span>
                ),
            },
            {
                key: 'peakAlt',
                header: 'Hauteur',
                align: 'right',
                sortKey: 'peakAlt',
                compare: (a, b) => a.peakAltDeg - b.peakAltDeg,
                cellClassName: 'text-xs text-mp-text-muted font-sans whitespace-nowrap text-right',
                hideOnMobile: true,
                render: (e) => `${e.peakAltDeg.toFixed(0)}°`,
            },
            {
                key: 'nightHoursAbove30',
                header: 'Nuit > 30°',
                align: 'right',
                sortKey: 'nightHoursAbove30',
                compare: (a, b) => (a.nightHoursAbove30 ?? 0) - (b.nightHoursAbove30 ?? 0),
                cellClassName: 'text-xs text-mp-text-muted font-sans whitespace-nowrap text-right',
                hideOnMobile: true,
                render: (e) => (typeof e.nightHoursAbove30 === 'number' ? `${e.nightHoursAbove30}h` : '—'),
            },
        ];

        const filteredBase = base.filter(
            (c) =>
                !['bestMonth', 'bestMonthMaxAlt', 'ra', 'dec', 'commonName', 'category', 'constellation'].includes(
                    c.key,
                ),
        );

        return [...filteredBase, feasibilityCol, scoreCol, ...trailingCols];
    }, []);

    return (
        <div className="space-y-8">
            <ObjectFilterBar
                query={query}
                onQueryChange={setQuery}
                searchPlaceholder="Filtrer (nom, type, constellation, description…)"
                isLoading={loading}
                showAdvanced={isFilterOpen}
                onToggleAdvanced={() => setIsFilterOpen((prev) => !prev)}
                activeFilters={activeFilterChips}
                onClearFilter={handleClearFilterChip}
                onReset={handleResetFilters}
                onOpenSettings={() => setIsSettingsOpen(true)}
                isSettingsCustom={isLocationCustom || isCameraCustom}
                rightControls={
                    <div className="flex shrink-0 overflow-hidden rounded-lg border border-mp-border-light">
                        <button
                            type="button"
                            onClick={() => setViewMode('grid')}
                            className={`cursor-pointer px-3 py-2 transition-colors ${
                                viewMode === 'grid'
                                    ? 'bg-mp-accent font-semibold text-mp-ui-black'
                                    : 'bg-mp-bg text-mp-text-muted hover:text-mp-text-heading'
                            }`}
                            title="Vue vignettes"
                        >
                            <LayoutGrid className="h-4 w-4" />
                        </button>
                        <button
                            type="button"
                            onClick={() => setViewMode('table')}
                            className={`cursor-pointer px-3 py-2 transition-colors ${
                                viewMode === 'table'
                                    ? 'bg-mp-accent font-semibold text-mp-ui-black'
                                    : 'bg-mp-bg text-mp-text-muted hover:text-mp-text-heading'
                            }`}
                            title="Vue tableau"
                        >
                            <LayoutList className="h-4 w-4" />
                        </button>
                    </div>
                }
            >
                {/* 1. Type */}
                <CustomSelect
                    label="Type"
                    value={typeFilter}
                    onChange={(val) => setTypeFilter(val)}
                    options={availableTypes}
                />

                {/* 2. Visibilité */}
                <CustomSelect
                    label="Visibilité"
                    value={visibilityFilter}
                    onChange={(val) => setVisibilityFilter(val as any)}
                    options={[
                        { value: 'all', label: 'Tous' },
                        { value: 'parfaite', label: 'Parfaite (>60°)' },
                        { value: 'observable', label: 'Observable (>30°)' },
                        { value: 'basse', label: 'Très basse (<30°)' },
                        { value: 'invisible', label: 'Invisible' },
                    ]}
                />

                {/* 3. Faisabilité */}
                <CustomSelect
                    label="Faisabilité"
                    value={compatibilityFilter}
                    onChange={(val) => setCompatibilityFilter(val as any)}
                    options={[
                        { value: 'all', label: 'Tous' },
                        { value: 'gerable', label: 'Gérable' },
                        { value: 'delicat', label: 'Délicat' },
                        { value: 'inobservable', label: 'Inobservable' },
                        { value: 'hors_portee', label: 'Setup insuffisant' },
                    ]}
                />

                {/* 4. Constellation */}
                <CustomSelect
                    label="Constellation"
                    value={constellationFilter}
                    onChange={(val) => setConstellationFilter(val)}
                    options={availableConstellations}
                />

                {/* Catalogue */}
                <CustomSelect
                    label="Catalogue"
                    value={catalogueFilter}
                    onChange={(val) => setCatalogueFilter(val)}
                    options={availableCatalogues}
                />

                {/* Magnitude */}
                <div className="flex flex-col gap-1">
                    <label
                        htmlFor="reco-filter-mag-min"
                        className="meta-label mb-1 block text-xs font-medium text-mp-text-muted/70"
                    >
                        Magnitude (min-max)
                    </label>
                    <div className="flex items-center gap-2">
                        <input
                            id="reco-filter-mag-min"
                            type="number"
                            {...NO_AUTOFILL_PROPS}
                            step="0.5"
                            placeholder="Min"
                            value={minMag}
                            onChange={(e) => setMinMag(e.target.value)}
                            className="w-full rounded-lg border border-mp-border-light bg-mp-bg px-3 py-2 text-sm text-mp-text-heading transition-colors placeholder:text-mp-text-muted/40 focus:border-mp-accent focus:ring-1 focus:ring-mp-accent focus:outline-hidden"
                        />
                        <span className="text-mp-text-muted/30">-</span>
                        <input
                            type="number"
                            {...NO_AUTOFILL_PROPS}
                            step="0.5"
                            placeholder="Max"
                            value={maxMag}
                            onChange={(e) => setMaxMag(e.target.value)}
                            className="w-full rounded-lg border border-mp-border-light bg-mp-bg px-3 py-2 text-sm text-mp-text-heading transition-colors placeholder:text-mp-text-muted/40 focus:border-mp-accent focus:ring-1 focus:ring-mp-accent focus:outline-hidden"
                        />
                    </div>
                </div>

                {/* Nuit > 30° */}
                <div className="flex flex-col gap-1">
                    <label
                        htmlFor="reco-filter-night-min"
                        className="meta-label mb-1 block text-xs font-medium text-mp-text-muted/70"
                    >
                        Nuit &gt; 30° (heures min-max)
                    </label>
                    <div className="flex items-center gap-2">
                        <input
                            id="reco-filter-night-min"
                            type="number"
                            {...NO_AUTOFILL_PROPS}
                            step="0.5"
                            placeholder="Min"
                            value={minNightHours}
                            onChange={(e) => setMinNightHours(e.target.value)}
                            className="w-full rounded-lg border border-mp-border-light bg-mp-bg px-3 py-2 text-sm text-mp-text-heading transition-colors placeholder:text-mp-text-muted/40 focus:border-mp-accent focus:ring-1 focus:ring-mp-accent focus:outline-hidden"
                        />
                        <span className="text-mp-text-muted/30">-</span>
                        <input
                            type="number"
                            {...NO_AUTOFILL_PROPS}
                            step="0.5"
                            placeholder="Max"
                            value={maxNightHours}
                            onChange={(e) => setMaxNightHours(e.target.value)}
                            className="w-full rounded-lg border border-mp-border-light bg-mp-bg px-3 py-2 text-sm text-mp-text-heading transition-colors placeholder:text-mp-text-muted/40 focus:border-mp-accent focus:ring-1 focus:ring-mp-accent focus:outline-hidden"
                        />
                    </div>
                </div>

                {/* Taille apparente */}
                <div className="flex flex-col gap-1">
                    <label
                        htmlFor="reco-filter-size-min"
                        className="meta-label mb-1 block text-xs font-medium text-mp-text-muted/70"
                    >
                        Taille apparente (′ min-max)
                    </label>
                    <div className="flex items-center gap-2">
                        <input
                            id="reco-filter-size-min"
                            type="number"
                            {...NO_AUTOFILL_PROPS}
                            step="1"
                            placeholder="Min"
                            value={minSize}
                            onChange={(e) => setMinSize(e.target.value)}
                            className="w-full rounded-lg border border-mp-border-light bg-mp-bg px-3 py-2 text-sm text-mp-text-heading transition-colors placeholder:text-mp-text-muted/40 focus:border-mp-accent focus:ring-1 focus:ring-mp-accent focus:outline-hidden"
                        />
                        <span className="text-mp-text-muted/30">-</span>
                        <input
                            type="number"
                            {...NO_AUTOFILL_PROPS}
                            step="5"
                            placeholder="Max"
                            value={maxSize}
                            onChange={(e) => setMaxSize(e.target.value)}
                            className="w-full rounded-lg border border-mp-border-light bg-mp-bg px-3 py-2 text-sm text-mp-text-heading transition-colors placeholder:text-mp-text-muted/40 focus:border-mp-accent focus:ring-1 focus:ring-mp-accent focus:outline-hidden"
                        />
                    </div>
                </div>

                {/* Hauteur Max */}
                <div className="flex flex-col gap-1">
                    <label
                        htmlFor="reco-filter-peakalt-min"
                        className="meta-label mb-1 block text-xs font-medium text-mp-text-muted/70"
                    >
                        Hauteur Max (° min-max)
                    </label>
                    <div className="flex items-center gap-2">
                        <input
                            id="reco-filter-peakalt-min"
                            type="number"
                            {...NO_AUTOFILL_PROPS}
                            placeholder="Min"
                            value={minPeakAlt}
                            onChange={(e) => setMinPeakAlt(e.target.value)}
                            className="w-full rounded-lg border border-mp-border-light bg-mp-bg px-3 py-2 text-sm text-mp-text-heading transition-colors placeholder:text-mp-text-muted/40 focus:border-mp-accent focus:ring-1 focus:ring-mp-accent focus:outline-hidden"
                        />
                        <span className="text-mp-text-muted/30">-</span>
                        <input
                            type="number"
                            {...NO_AUTOFILL_PROPS}
                            placeholder="Max"
                            value={maxPeakAlt}
                            onChange={(e) => setMaxPeakAlt(e.target.value)}
                            className="w-full rounded-lg border border-mp-border-light bg-mp-bg px-3 py-2 text-sm text-mp-text-heading transition-colors placeholder:text-mp-text-muted/40 focus:border-mp-accent focus:ring-1 focus:ring-mp-accent focus:outline-hidden"
                        />
                    </div>
                </div>

                {/* Score */}
                <div className="flex flex-col gap-1">
                    <label
                        htmlFor="reco-filter-score-min"
                        className="meta-label mb-1 block text-xs font-medium text-mp-text-muted/70"
                    >
                        Score (0-100 min-max)
                    </label>
                    <div className="flex items-center gap-2">
                        <input
                            id="reco-filter-score-min"
                            type="number"
                            {...NO_AUTOFILL_PROPS}
                            min="0"
                            max="100"
                            placeholder="Min"
                            value={minScore}
                            onChange={(e) => setMinScore(e.target.value)}
                            className="w-full rounded-lg border border-mp-border-light bg-mp-bg px-3 py-2 text-sm text-mp-text-heading transition-colors placeholder:text-mp-text-muted/40 focus:border-mp-accent focus:ring-1 focus:ring-mp-accent focus:outline-hidden"
                        />
                        <span className="text-mp-text-muted/30">-</span>
                        <input
                            type="number"
                            {...NO_AUTOFILL_PROPS}
                            min="0"
                            max="100"
                            placeholder="Max"
                            value={maxScore}
                            onChange={(e) => setMaxScore(e.target.value)}
                            className="w-full rounded-lg border border-mp-border-light bg-mp-bg px-3 py-2 text-sm text-mp-text-heading transition-colors placeholder:text-mp-text-muted/40 focus:border-mp-accent focus:ring-1 focus:ring-mp-accent focus:outline-hidden"
                        />
                    </div>
                </div>
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

            {/* Modale de Synthèse d'Observabilité */}
            <ObservabilityModal
                isOpen={isSynthModalOpen}
                onClose={() => setIsSynthModalOpen(false)}
                title="Fenêtre d'observation & Synthèse"
            >
                {reference && (
                    <div className="space-y-4">
                        <div className="space-y-1 rounded-xl border border-mp-glass-border bg-mp-glass-bg p-3.5">
                            <span className="block text-xs text-mp-text-muted">Fenêtre d'observation optimale</span>
                            <p className="font-medium text-mp-text-body">
                                Objets dont la culmination en pleine nuit tombe entre{' '}
                                <span className="font-semibold text-mp-accent">
                                    {formatMonthYear(new Date(reference.getFullYear(), reference.getMonth() - 1, 1))}
                                </span>{' '}
                                et{' '}
                                <span className="font-semibold text-mp-accent">
                                    {formatMonthYear(new Date(reference.getFullYear(), reference.getMonth() + 1, 1))}
                                </span>
                                , depuis <span className="font-semibold text-mp-accent">{location.name}</span>.
                            </p>
                        </div>
                        {poolSize !== null && (
                            <div className="space-y-1 rounded-xl border border-mp-glass-border bg-mp-glass-bg p-3.5">
                                <span className="block text-xs text-mp-text-muted">Base de données & Critères</span>
                                <p className="text-xs leading-relaxed text-mp-text-muted">
                                    Pool analysé : {poolSize} objets issus de l'ensemble des catalogues du ciel profond
                                    (Messier, Caldwell, NGC, IC, Sharpless, Barnard, Arp, vdB, RCW, HCG, Cederblad, OCL,
                                    PN, Abell, GC…). Seuil minimum de hauteur locale : 30°.
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </ObservabilityModal>

            <EntryListView<EvaluatedRecommendation>
                entries={displayedRecommendations}
                columns={columns}
                defaultSort={{ col: 'score', dir: 'desc' }}
                total={filtered.length}
                hasMore={displayedRecommendations.length < filtered.length}
                onLoadMore={() => setDisplayLimit((prev) => prev + 100)}
                pageSize={100}
                loading={loading}
                error={error}
                view={viewMode}
                onViewChange={setViewMode}
                hideViewToggle
            />
        </div>
    );
}
