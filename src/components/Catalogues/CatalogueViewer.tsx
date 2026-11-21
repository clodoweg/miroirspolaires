/**
 * @file src/components/Catalogues/CatalogueViewer.tsx
 * @description Visionneuse de catalogue d'objets célestes avec filtrage avancé et calcul d'observabilité.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { LayoutGrid, LayoutList, Sparkles } from 'lucide-react';
import type { CatalogueEntry } from '@/lib/catalogues/fetch';
import type { CatalogueDef } from '@/lib/catalogues/registry';
import { useUserSettings } from '@/lib/settings/useUserSettings';
import { findTelescope } from '@/lib/equipment/catalog';
import { getConstellationName } from '@/lib/constellations';
import { categorize, typeLabel } from '@/lib/catalogues/classify';
import EntryListView, { defaultCatalogueColumns, type ListColumn } from './EntryListView';
import ObjectFilterBar, { type ActiveFilterChip } from '@/components/Filters/ObjectFilterBar';
import { FILTER_LABEL_CLASS, FILTER_INPUT_CLASS } from '@/components/Filters/constants';
import CustomSelect from '@/components/UI/CustomSelect';
import { UserSettingsModal } from '@/components/Settings/UserSettingsBar';
import { NO_AUTOFILL_PROPS } from '@/utils/constants';
import { foldAccents } from '@/utils/normalize';

interface Props {
    slug: string;
    catalogue: CatalogueDef;
    children?: ReactNode;
}

interface ApiResponse {
    catalogue: CatalogueDef;
    page: number;
    limit: number;
    total: number;
    entries: CatalogueEntry[];
}

export interface EvaluatedCatalogueEntry extends CatalogueEntry {
    feasibility: {
        status: 'gerable' | 'delicat' | 'inobservable' | 'hors_portee';
        label: string;
        color: string;
    };
    score: number;
}

const PAGE_SIZE = 100;

export default function CatalogueViewer({ slug, catalogue, children }: Props) {
    const { location, camera, isLocationCustom, isCameraCustom, setLocation, setCamera, resetLocation, resetCamera } =
        useUserSettings();

    const [date, setDate] = useState<Date>(() => new Date());
    const [query, setQuery] = useState('');
    const [rawEntries, setRawEntries] = useState<CatalogueEntry[]>([]);
    const [, setTotal] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [displayLimit, setDisplayLimit] = useState(100);
    const [viewMode, setViewMode] = useState<'grid' | 'table'>('table');

    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    // Filtres principaux & avancés
    const [typeFilter, setTypeFilter] = useState('all');
    const [visibilityFilter, setVisibilityFilter] = useState<'all' | 'parfaite' | 'observable' | 'basse' | 'invisible'>(
        'all',
    );
    const [compatibilityFilter, setCompatibilityFilter] = useState<
        'all' | 'gerable' | 'delicat' | 'inobservable' | 'hors_portee'
    >('all');
    const [constellationFilter, setConstellationFilter] = useState('all');

    const [minMag, setMinMag] = useState('');
    const [maxMag, setMaxMag] = useState('');
    const [minSize, setMinSize] = useState('');
    const [maxSize, setMaxSize] = useState('');
    const [minMaxAlt, setMinMaxAlt] = useState('');
    const [maxMaxAlt, setMaxMaxAlt] = useState('');
    const [minScore, setMinScore] = useState('');
    const [maxScore, setMaxScore] = useState('');

    const abortRef = useRef<AbortController | null>(null);

    // Chargement initial des objets du catalogue depuis l'API
    useEffect(() => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        setLoading(true);
        setError(null);

        const params = new URLSearchParams({
            page: '1',
            limit: '2000',
            sort: 'default',
            lat: String(location?.lat ?? 48.8566),
        });
        if (import.meta.env.DEV) params.set('_cb', String(Date.now()));

        fetch(`/api/catalogue/${slug}?${params.toString()}`, { signal: controller.signal })
            .then(async (res) => {
                const data = await res.json().catch(() => null);
                if (!res.ok) throw new Error(data?.error || `Erreur ${res.status}`);
                return data;
            })
            .then((data: ApiResponse) => {
                setTotal(data.total);
                setRawEntries(data.entries);
                setLoading(false);
            })
            .catch((e) => {
                if ((e as Error).name === 'AbortError') return;
                setError((e as Error).message);
                setLoading(false);
            });
    }, [slug, location?.lat]);

    // Évaluation de la faisabilité et calcul du score pour chaque objet
    const evaluatedEntries = useMemo<EvaluatedCatalogueEntry[]>(() => {
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

        return rawEntries.map((e) => {
            const maxAlt = e.bestMonthMaxAlt ?? 0;

            let feasibility: EvaluatedCatalogueEntry['feasibility'] = {
                label: 'Gérable',
                color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
                status: 'gerable',
            };

            if (maxAlt < 15) {
                feasibility = {
                    label: 'Inobservable',
                    color: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
                    status: 'inobservable',
                };
            } else if (typeof e.mag === 'number' && e.mag > limitMagPhoto) {
                feasibility = {
                    label: 'Setup insuffisant',
                    color: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
                    status: 'hors_portee',
                };
            } else if (maxAlt < 30 || (typeof e.mag === 'number' && e.mag > limitMagPhoto - 1.5)) {
                feasibility = {
                    label: 'Délicat',
                    color: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
                    status: 'delicat',
                };
            }

            const magCoeff = typeof e.mag === 'number' ? Math.max(0, 1 - (e.mag - 4) / 12) : 0.5;
            const altCoeff = Math.max(0, Math.min(1, (maxAlt - 15) / 60));
            const feasibilityCoeff =
                feasibility.status === 'gerable'
                    ? 1.0
                    : feasibility.status === 'delicat'
                      ? 0.7
                      : feasibility.status === 'hors_portee'
                        ? 0.3
                        : 0.0;
            const score = Math.round(Math.max(0, Math.min(100, magCoeff * 40 + altCoeff * 40 + feasibilityCoeff * 20)));

            return {
                ...e,
                feasibility,
                score,
            };
        });
    }, [rawEntries, camera]);

    const availableTypes = useMemo(() => {
        const set = new Set<string>();
        evaluatedEntries.forEach((it) => {
            const cat = categorize(it.type);
            if (cat) set.add(cat);
        });
        const order: Record<string, number> = { Nébuleuse: 1, Galaxie: 2, Amas: 3, Étoile: 4, Autre: 5 };
        const sortedCats = Array.from(set).sort((a, b) => (order[a] ?? 99) - (order[b] ?? 99));
        return [{ value: 'all', label: 'Tous' }, ...sortedCats.map((cat) => ({ value: cat, label: cat }))];
    }, [evaluatedEntries]);

    const availableConstellations = useMemo(() => {
        const set = new Set<string>();
        evaluatedEntries.forEach((it) => {
            if (it.constellation) set.add(it.constellation);
        });
        const list = Array.from(set)
            .map((c) => ({
                value: c,
                label: getConstellationName(c) || c,
            }))
            .sort((a, b) => (a.label || '').localeCompare(b.label || '', 'fr'));
        return [{ value: 'all', label: 'Toutes' }, ...list];
    }, [evaluatedEntries]);

    const filteredEntries = useMemo(() => {
        const qClean = foldAccents(query).trim();

        return evaluatedEntries.filter((e) => {
            if (qClean) {
                const constName = e.constellation ? getConstellationName(e.constellation) : '';
                const constNameClean = foldAccents(constName);
                const haystack = foldAccents(
                    `${e.id} ${e.label} ${e.commonName ?? ''} ${typeLabel(e.type)} ${categorize(e.type)} ${e.constellation ?? ''} ${constNameClean} ${e.description ?? ''}`,
                );
                if (!haystack.includes(qClean)) return false;
            }

            if (typeFilter !== 'all' && typeFilter !== '') {
                const cat = categorize(e.type);
                const detailed = typeLabel(e.type);
                if (typeFilter !== cat && typeFilter !== detailed && typeFilter !== e.type) return false;
            }

            if ((visibilityFilter as string) !== 'all' && (visibilityFilter as string) !== '') {
                const maxAlt = e.bestMonthMaxAlt ?? 0;
                if (visibilityFilter === 'parfaite' && maxAlt < 60) return false;
                if (visibilityFilter === 'observable' && maxAlt < 30) return false;
                if (visibilityFilter === 'basse' && (maxAlt >= 30 || maxAlt < 15)) return false;
                if (visibilityFilter === 'invisible' && maxAlt >= 15) return false;
            }

            if ((compatibilityFilter as string) !== 'all' && (compatibilityFilter as string) !== '') {
                if (e.feasibility.status !== compatibilityFilter) return false;
            }

            if (constellationFilter !== 'all' && constellationFilter !== '') {
                if (e.constellation !== constellationFilter) return false;
            }

            if (minMag !== '') {
                const limit = parseFloat(minMag);
                if (!isNaN(limit) && (typeof e.mag !== 'number' || e.mag < limit)) return false;
            }
            if (maxMag !== '') {
                const limit = parseFloat(maxMag);
                if (!isNaN(limit) && (typeof e.mag !== 'number' || e.mag > limit)) return false;
            }

            if (minSize !== '') {
                const limit = parseFloat(minSize);
                if (!isNaN(limit) && (typeof e.sizeArcmin !== 'number' || e.sizeArcmin < limit)) return false;
            }
            if (maxSize !== '') {
                const limit = parseFloat(maxSize);
                if (!isNaN(limit) && (typeof e.sizeArcmin !== 'number' || e.sizeArcmin > limit)) return false;
            }

            if (minMaxAlt !== '') {
                const limit = parseFloat(minMaxAlt);
                if (!isNaN(limit) && (e.bestMonthMaxAlt ?? 0) < limit) return false;
            }
            if (maxMaxAlt !== '') {
                const limit = parseFloat(maxMaxAlt);
                if (!isNaN(limit) && (e.bestMonthMaxAlt ?? 0) > limit) return false;
            }

            if (minScore !== '') {
                const limit = parseFloat(minScore);
                if (!isNaN(limit) && e.score < limit) return false;
            }
            if (maxScore !== '') {
                const limit = parseFloat(maxScore);
                if (!isNaN(limit) && e.score > limit) return false;
            }

            return true;
        });
    }, [
        evaluatedEntries,
        query,
        typeFilter,
        visibilityFilter,
        compatibilityFilter,
        constellationFilter,
        minMag,
        maxMag,
        minSize,
        maxSize,
        minMaxAlt,
        maxMaxAlt,
        minScore,
        maxScore,
    ]);

    useEffect(() => {
        setDisplayLimit(100);
    }, [
        query,
        typeFilter,
        visibilityFilter,
        compatibilityFilter,
        constellationFilter,
        minMag,
        maxMag,
        minSize,
        maxSize,
        minMaxAlt,
        maxMaxAlt,
        minScore,
        maxScore,
    ]);

    const displayedEntries = useMemo(() => {
        return filteredEntries.slice(0, displayLimit);
    }, [filteredEntries, displayLimit]);

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

        if (minMag) chips.push({ key: 'minMag', label: 'Mag Min', value: minMag });
        if (maxMag) chips.push({ key: 'maxMag', label: 'Mag Max', value: maxMag });
        if (minSize) chips.push({ key: 'minSize', label: 'Taille Min', value: `${minSize}′` });
        if (maxSize) chips.push({ key: 'maxSize', label: 'Taille Max', value: `${maxSize}′` });
        if (minMaxAlt) chips.push({ key: 'minMaxAlt', label: 'Hauteur Min', value: `${minMaxAlt}°` });
        if (maxMaxAlt) chips.push({ key: 'maxMaxAlt', label: 'Hauteur Max', value: `${maxMaxAlt}°` });
        if (minScore) chips.push({ key: 'minScore', label: 'Score Min', value: minScore });
        if (maxScore) chips.push({ key: 'maxScore', label: 'Score Max', value: maxScore });

        return chips;
    }, [
        typeFilter,
        visibilityFilter,
        compatibilityFilter,
        constellationFilter,
        minMag,
        maxMag,
        minSize,
        maxSize,
        minMaxAlt,
        maxMaxAlt,
        minScore,
        maxScore,
    ]);

    const handleClearFilterChip = useCallback((key: string) => {
        if (key === 'typeFilter') setTypeFilter('all');
        else if (key === 'visibilityFilter') setVisibilityFilter('all');
        else if (key === 'compatibilityFilter') setCompatibilityFilter('all');
        else if (key === 'constellationFilter') setConstellationFilter('all');
        else if (key === 'minMag') setMinMag('');
        else if (key === 'maxMag') setMaxMag('');
        else if (key === 'minSize') setMinSize('');
        else if (key === 'maxSize') setMaxSize('');
        else if (key === 'minMaxAlt') setMinMaxAlt('');
        else if (key === 'maxMaxAlt') setMaxMaxAlt('');
        else if (key === 'minScore') setMinScore('');
        else if (key === 'maxScore') setMaxScore('');
    }, []);

    const handleResetFilters = useCallback(() => {
        setQuery('');
        setTypeFilter('all');
        setVisibilityFilter('all');
        setCompatibilityFilter('all');
        setConstellationFilter('all');
        setMinMag('');
        setMaxMag('');
        setMinSize('');
        setMaxSize('');
        setMinMaxAlt('');
        setMaxMaxAlt('');
        setMinScore('');
        setMaxScore('');
    }, []);

    const columns = useMemo<ListColumn<EvaluatedCatalogueEntry>[]>(() => {
        const base = defaultCatalogueColumns<EvaluatedCatalogueEntry>();

        const feasibilityCol: ListColumn<EvaluatedCatalogueEntry> = {
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

        const scoreCol: ListColumn<EvaluatedCatalogueEntry> = {
            key: 'score',
            header: 'Score',
            align: 'right',
            sortKey: 'score',
            compare: (a, b) => (a.score ?? 0) - (b.score ?? 0),
            cellClassName: 'font-mono font-bold whitespace-nowrap text-mp-accent text-right',
            render: (e) => (
                <span
                    title="Score d'observabilité (0-100) basé sur l'altitude maximale au zénith (>30°), la taille apparente de l'objet et la période de visibilité."
                    className="inline-flex cursor-help items-center justify-end gap-1 rounded-full border border-mp-accent/20 bg-mp-accent/10 px-2 py-0.5 font-mono text-xs font-bold text-mp-accent"
                >
                    <Sparkles className="h-3 w-3" />
                    {e.score ?? 0}
                </span>
            ),
        };

        const filteredBase = base.filter((c) =>
            ['id', 'type', 'mag', 'size', 'bestMonth', 'bestMonthMaxAlt'].includes(c.key),
        );

        return [...filteredBase, feasibilityCol, scoreCol];
    }, []);

    return (
        <div className="space-y-8">
            <ObjectFilterBar
                query={query}
                onQueryChange={setQuery}
                searchPlaceholder={`Filtrer le catalogue ${catalogue.shortName} (nom, type, constellation, description…)`}
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
                            className={`cursor-pointer px-3 py-2 transition-colors ${viewMode === 'grid' ? 'bg-mp-accent font-semibold text-mp-ui-black' : 'bg-mp-bg text-mp-text-muted hover:text-mp-text-heading'}`}
                            title="Vue vignettes"
                        >
                            <LayoutGrid className="h-4 w-4" />
                        </button>
                        <button
                            type="button"
                            onClick={() => setViewMode('table')}
                            className={`cursor-pointer px-3 py-2 transition-colors ${viewMode === 'table' ? 'bg-mp-accent font-semibold text-mp-ui-black' : 'bg-mp-bg text-mp-text-muted hover:text-mp-text-heading'}`}
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

                {/* Magnitude */}
                <div className="flex flex-col gap-1">
                    <label htmlFor="catalogue-filter-mag-min" className={FILTER_LABEL_CLASS}>
                        Magnitude (min-max)
                    </label>
                    <div className="flex items-center gap-2">
                        <input
                            id="catalogue-filter-mag-min"
                            type="number"
                            {...NO_AUTOFILL_PROPS}
                            step="0.5"
                            placeholder="Min"
                            value={minMag}
                            onChange={(e) => setMinMag(e.target.value)}
                            className={FILTER_INPUT_CLASS}
                        />
                        <span className="text-mp-text-muted/30">-</span>
                        <input
                            type="number"
                            {...NO_AUTOFILL_PROPS}
                            step="0.5"
                            placeholder="Max"
                            value={maxMag}
                            onChange={(e) => setMaxMag(e.target.value)}
                            className={FILTER_INPUT_CLASS}
                        />
                    </div>
                </div>

                {/* Taille apparente */}
                <div className="flex flex-col gap-1">
                    <label htmlFor="catalogue-filter-size-min" className={FILTER_LABEL_CLASS}>
                        Taille apparente (′ min-max)
                    </label>
                    <div className="flex items-center gap-2">
                        <input
                            id="catalogue-filter-size-min"
                            type="number"
                            {...NO_AUTOFILL_PROPS}
                            step="1"
                            placeholder="Min"
                            value={minSize}
                            onChange={(e) => setMinSize(e.target.value)}
                            className={FILTER_INPUT_CLASS}
                        />
                        <span className="text-mp-text-muted/30">-</span>
                        <input
                            type="number"
                            {...NO_AUTOFILL_PROPS}
                            step="5"
                            placeholder="Max"
                            value={maxSize}
                            onChange={(e) => setMaxSize(e.target.value)}
                            className={FILTER_INPUT_CLASS}
                        />
                    </div>
                </div>

                {/* Hauteur Max */}
                <div className="flex flex-col gap-1">
                    <label htmlFor="catalogue-filter-maxalt-min" className={FILTER_LABEL_CLASS}>
                        Hauteur Max (° min-max)
                    </label>
                    <div className="flex items-center gap-2">
                        <input
                            id="catalogue-filter-maxalt-min"
                            type="number"
                            {...NO_AUTOFILL_PROPS}
                            placeholder="Min"
                            value={minMaxAlt}
                            onChange={(e) => setMinMaxAlt(e.target.value)}
                            className={FILTER_INPUT_CLASS}
                        />
                        <span className="text-mp-text-muted/30">-</span>
                        <input
                            type="number"
                            {...NO_AUTOFILL_PROPS}
                            placeholder="Max"
                            value={maxMaxAlt}
                            onChange={(e) => setMaxMaxAlt(e.target.value)}
                            className={FILTER_INPUT_CLASS}
                        />
                    </div>
                </div>

                {/* Score */}
                <div className="flex flex-col gap-1">
                    <label htmlFor="catalogue-filter-score-min" className={FILTER_LABEL_CLASS}>
                        Score (0-100 min-max)
                    </label>
                    <div className="flex items-center gap-2">
                        <input
                            id="catalogue-filter-score-min"
                            type="number"
                            {...NO_AUTOFILL_PROPS}
                            min="0"
                            max="100"
                            placeholder="Min"
                            value={minScore}
                            onChange={(e) => setMinScore(e.target.value)}
                            className={FILTER_INPUT_CLASS}
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
                            className={FILTER_INPUT_CLASS}
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

            <EntryListView<EvaluatedCatalogueEntry>
                entries={displayedEntries}
                columns={columns}
                defaultSort={{ col: 'score', dir: 'desc' }}
                total={filteredEntries.length}
                hasMore={displayedEntries.length < filteredEntries.length}
                onLoadMore={() => setDisplayLimit((prev) => prev + 100)}
                pageSize={PAGE_SIZE}
                loading={loading}
                error={error}
                topContent={children}
                view={viewMode}
                onViewChange={setViewMode}
                hideViewToggle
            />
        </div>
    );
}
