/**
 * Generic list view for catalogue-shaped entries (table + grid + toolbar).
 *
 * Used by both the catalogue viewer (paginated, server-side sort) and the
 * recommendations viewer (client-side, with extra columns for peak month etc.).
 */

import { useCallback, useEffect, useState, useMemo, type ReactNode } from 'react';
import { Loader2, LayoutGrid, LayoutList, ChevronDown, ChevronUp, Telescope } from 'lucide-react';
import type { CatalogueEntry } from '@/lib/catalogues/fetch';
import { getConstellationName } from '@/lib/constellations';
import { typeLabel, categorize } from '@/lib/catalogues/classify';
import { hips2fitsUrl } from '@/lib/objects/hips2fits-url';
import { formatRa, formatDec, formatMonthYear } from '@/lib/format';
import Panel from '@/components/UI/Panel';
import ObjectFilterBar from '@/components/Filters/ObjectFilterBar';
import SortIcon from '@/components/UI/SortIcon';

export interface ListColumn<T> {
    key: string;
    header: ReactNode;
    align?: 'left' | 'right' | 'center';
    render: (entry: T) => ReactNode;
    /** If provided, the column is sortable (client-side or server-side). */
    sortKey?: string;
    /** Client-side comparator (used when no `onSortChange` callback is set on the parent). */
    compare?: (a: T, b: T) => number;
    hideOnMobile?: boolean;
    cellClassName?: string;
    headerClassName?: string;
    /** Title attribute on cell (tooltip). */
    cellTitle?: (entry: T) => string | undefined;
}

export type SortState = { col: string; dir: 'asc' | 'desc' } | null;

interface Props<T extends CatalogueEntry & { catalogue?: string }> {
    entries: T[];
    columns: ListColumn<T>[];
    total?: number | null;
    loading?: boolean;
    error?: string | null;
    /** Search query state (controlled). */
    query?: string;
    onQueryChange?: (q: string) => void;
    searchPlaceholder?: string;
    /** Server-driven sort state. When omitted, sort is managed client-side via `compare`. */
    sort?: SortState;
    onSortChange?: (s: SortState) => void;
    /** Default sort state when sort is un-controlled. */
    defaultSort?: SortState;
    /** Pagination control (server-driven). */
    hasMore?: boolean;
    onLoadMore?: () => void;
    pageSize?: number;
    /** Optional row click handler — falls back to `/objets?q=…` link. */
    onRowClick?: (entry: T) => void;
    /** Optional elements rendered at the start of the toolbar before search. */
    toolbarLeft?: ReactNode;
    /** Extra elements rendered in the toolbar before the view toggle. */
    toolbarExtras?: ReactNode;
    /** Optional content rendered between the toolbar and the count line/table. */
    topContent?: ReactNode;
    /** Custom subtitle for grid card (defaults to commonName/category). */
    gridSubtitle?: (entry: T) => ReactNode;
    /** Initial view; auto-switches with viewport unless user overrides. */
    autoView?: boolean;
    /** Controlled view mode ('grid' | 'table'). */
    view?: 'grid' | 'table';
    onViewChange?: (view: 'grid' | 'table') => void;
    /** Hide the default view mode toggle button in EntryListView toolbar. */
    hideViewToggle?: boolean;
}

export default function EntryListView<T extends CatalogueEntry & { catalogue?: string }>({
    entries,
    columns,
    total,
    loading,
    error,
    query,
    onQueryChange,
    searchPlaceholder = 'Filtrer (nom, type, constellation, description…)',
    sort: extSort,
    onSortChange,
    hasMore,
    onLoadMore,
    pageSize,
    onRowClick,
    toolbarLeft,
    toolbarExtras,
    topContent,
    gridSubtitle,
    autoView = true,
    defaultSort,
    view: extView,
    onViewChange,
    hideViewToggle = false,
}: Props<T>) {
    const [internalView, setInternalView] = useState<'grid' | 'table'>('table');
    const view = extView ?? internalView;
    const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);

    const hasRaDec = useMemo(() => columns.some((c) => c.key === 'ra' || c.key === 'dec'), [columns]);
    const isRec = useMemo(
        () => columns.some((c) => c.key === 'peakMonth' || c.key === 'peakAlt' || c.key === 'nightHoursAbove30'),
        [columns],
    );
    const isSimplified = useMemo(() => {
        return columns.length <= 3 && columns.every((c) => ['id', 'type', 'constellation'].includes(c.key));
    }, [columns]);
    const hasFullColumns = useMemo(() => {
        return (
            columns.some(
                (c) =>
                    c.key === 'bestMonth' ||
                    c.key === 'bestMonthMaxAlt' ||
                    c.key === 'peakMonth' ||
                    c.key === 'peakAlt',
            ) && columns.some((c) => c.key === 'mag')
        );
    }, [columns]);

    const suggestions = useMemo(() => {
        if (!entries || entries.length === 0) return [];
        const suggMap = new Map<string, string>();
        entries.forEach((e) => {
            const labelType = e.type ? typeLabel(categorize(e.type)) : 'Objet profond';
            if (e.id) suggMap.set(e.id, labelType);
            if (e.label && e.label !== e.id) suggMap.set(e.label, labelType);
            if (e.commonName) suggMap.set(e.commonName, labelType);
            if (e.constellation) {
                const constName = getConstellationName(e.constellation);
                if (constName !== e.constellation) {
                    suggMap.set(constName, 'Constellation');
                }
            }
        });
        return Array.from(suggMap.entries()).map(([value, label]) => ({ value, label }));
    }, [entries]);

    const handleSetView = useCallback(
        (next: 'grid' | 'table') => {
            if (onViewChange) {
                onViewChange(next);
            } else {
                setInternalView(next);
            }
        },
        [onViewChange],
    );

    useEffect(() => {
        if (!autoView || typeof window === 'undefined' || !window.matchMedia) return;
        const mq = window.matchMedia('(max-width: 1099px)');
        const onChange = (_e: MediaQueryListEvent | MediaQueryList) => {
            // view is user-controlled, no auto-switch on resize
        };
        mq.addEventListener('change', onChange);
        return () => mq.removeEventListener('change', onChange);
    }, [autoView]);

    // Local sort state when parent doesn't control it.
    const [localSort, setLocalSort] = useState<SortState>(defaultSort ?? null);
    const sort = onSortChange ? (extSort ?? null) : localSort;
    const setSort = onSortChange ?? setLocalSort;

    function toggleSort(key: string) {
        const prev = sort;
        let next: SortState;
        if (!prev || prev.col !== key) next = { col: key, dir: 'asc' };
        else if (prev.dir === 'asc') next = { col: key, dir: 'desc' };
        else next = null;
        setSort(next);
    }

    // Client-side sort if no upstream control.
    const displayedEntries = (() => {
        if (onSortChange) return entries;
        if (!localSort) return entries;
        const col = columns.find((c) => c.sortKey === localSort.col);
        if (!col?.compare) return entries;
        const sign = localSort.dir === 'desc' ? -1 : 1;
        return [...entries].sort((a, b) => sign * col.compare!(a, b));
    })();

    return (
        <div className="space-y-6">
            {/* Toolbar */}
            {(toolbarLeft || onQueryChange || toolbarExtras || !hideViewToggle) &&
                (onQueryChange ? (
                    <ObjectFilterBar
                        query={query ?? ''}
                        onQueryChange={onQueryChange}
                        suggestions={suggestions}
                        searchPlaceholder={searchPlaceholder}
                        isLoading={loading}
                        rightControls={
                            <div className="flex items-center gap-3">
                                {toolbarLeft}
                                {toolbarExtras}
                                {!hideViewToggle && (
                                    <div className="flex shrink-0 overflow-hidden rounded-lg border border-mp-border-light">
                                        <button
                                            type="button"
                                            onClick={() => handleSetView('grid')}
                                            className={`cursor-pointer px-3 py-2 transition-colors ${view === 'grid' ? 'bg-mp-accent font-semibold text-mp-ui-black' : 'bg-mp-bg text-mp-text-muted hover:text-mp-text-heading'}`}
                                            title="Vue vignettes"
                                        >
                                            <LayoutGrid className="h-4 w-4" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleSetView('table')}
                                            className={`cursor-pointer px-3 py-2 transition-colors ${view === 'table' ? 'bg-mp-accent font-semibold text-mp-ui-black' : 'bg-mp-bg text-mp-text-muted hover:text-mp-text-heading'}`}
                                            title="Vue tableau"
                                        >
                                            <LayoutList className="h-4 w-4" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        }
                    />
                ) : (
                    <div className="mb-6 flex flex-row flex-wrap items-center gap-3">
                        {toolbarLeft}
                        {toolbarExtras}
                        {!hideViewToggle && (
                            <div className="flex shrink-0 overflow-hidden rounded-lg border border-mp-border-light">
                                <button
                                    type="button"
                                    onClick={() => handleSetView('grid')}
                                    className={`cursor-pointer px-3 py-2 transition-colors ${view === 'grid' ? 'bg-mp-accent font-semibold text-mp-ui-black' : 'bg-mp-bg text-mp-text-muted hover:text-mp-text-heading'}`}
                                    title="Vue vignettes"
                                >
                                    <LayoutGrid className="h-4 w-4" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleSetView('table')}
                                    className={`cursor-pointer px-3 py-2 transition-colors ${view === 'table' ? 'bg-mp-accent font-semibold text-mp-ui-black' : 'bg-mp-bg text-mp-text-muted hover:text-mp-text-heading'}`}
                                    title="Vue tableau"
                                >
                                    <LayoutList className="h-4 w-4" />
                                </button>
                            </div>
                        )}
                    </div>
                ))}

            {topContent}

            {/* Count line */}
            <div className="flex items-baseline gap-3 text-sm text-mp-text-muted">
                {total != null ? (
                    <span>
                        Affichage de{' '}
                        <span className="font-mono font-medium text-mp-text-primary">
                            {displayedEntries.length.toLocaleString('fr-FR')}
                        </span>{' '}
                        sur{' '}
                        <span className="font-mono font-medium text-mp-text-primary">
                            {total.toLocaleString('fr-FR')}
                        </span>
                        .
                    </span>
                ) : (
                    <span>Chargement…</span>
                )}
                {loading && <Loader2 className="h-4 w-4 animate-spin text-mp-accent" />}
            </div>

            {error && (
                <Panel tone="danger" padding={4} className="text-sm text-mp-text-body">
                    {error}
                </Panel>
            )}

            {/* Grid view */}
            {view === 'grid' && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                    {displayedEntries.map((e) => (
                        <EntryCard key={cardKey(e)} entry={e} subtitle={gridSubtitle} onClick={onRowClick} />
                    ))}
                </div>
            )}

            {/* Table view */}
            {view === 'table' && displayedEntries.length > 0 && (
                <div
                    className="grid grid-cols-1 gap-y-3"
                    style={{
                        gridTemplateColumns: [
                            'max-content',
                            ...columns.map((_, i) => (i === 0 ? 'minmax(0, 1fr)' : 'max-content')),
                            'max-content',
                        ].join(' '),
                    }}
                >
                    {/* Table Header (hidden on mobile) */}
                    <div className="col-span-full hidden grid-cols-subgrid items-center gap-4 rounded-xl border border-mp-glass-border bg-mp-glass-solid/50 px-6 py-3 text-xs font-semibold tracking-wider text-mp-text-muted uppercase select-none md:grid">
                        <div>Aperçu</div>
                        {columns.map((col) => {
                            const hideClass = col.hideOnMobile ? 'hidden md:block' : '';
                            const alignClass =
                                col.align === 'right'
                                    ? 'text-right'
                                    : col.align === 'center'
                                      ? 'text-center'
                                      : 'text-left';
                            const justifyClass =
                                col.align === 'right'
                                    ? 'justify-end'
                                    : col.align === 'center'
                                      ? 'justify-center'
                                      : 'justify-start';
                            return (
                                <div
                                    key={col.key}
                                    className={`${alignClass} ${hideClass} ${col.headerClassName ?? ''} ${col.sortKey ? 'cursor-pointer whitespace-nowrap select-none hover:text-mp-text-primary' : ''}`}
                                    onClick={col.sortKey ? () => toggleSort(col.sortKey!) : undefined}
                                    role={col.sortKey ? 'button' : undefined}
                                    tabIndex={col.sortKey ? 0 : undefined}
                                    onKeyDown={
                                        col.sortKey
                                            ? (e) => {
                                                  if (e.key === 'Enter' || e.key === ' ') {
                                                      e.preventDefault();
                                                      toggleSort(col.sortKey!);
                                                  }
                                              }
                                            : undefined
                                    }
                                >
                                    {col.sortKey ? (
                                        <span className={`inline-flex w-full items-center gap-1 ${justifyClass}`}>
                                            {col.header}{' '}
                                            <SortIcon sortKey={col.sortKey} activeSort={sort} inactiveClassName="" />
                                        </span>
                                    ) : (
                                        col.header
                                    )}
                                </div>
                            );
                        })}
                        <div />
                    </div>

                    {/* Table Body (List of Collapsible Rows) */}
                    {displayedEntries.map((e) => {
                        const key = cardKey(e);
                        return (
                            <CollapsibleRow
                                key={key}
                                entry={e}
                                columns={columns}
                                isExpanded={expandedEntryId === key}
                                onToggle={() => setExpandedEntryId(expandedEntryId === key ? null : key)}
                                hasRaDec={hasRaDec}
                                isRec={isRec}
                                isSimplified={isSimplified}
                                hasFullColumns={hasFullColumns}
                            />
                        );
                    })}
                </div>
            )}

            {!loading && displayedEntries.length === 0 && !error && (
                <Panel padding={8} className="text-center text-mp-text-muted">
                    {query?.trim() ? 'Aucun objet ne correspond à cette recherche.' : 'Aucun objet à afficher.'}
                </Panel>
            )}

            {hasMore && onLoadMore && (
                <div className="flex justify-center pt-6">
                    <button
                        type="button"
                        onClick={onLoadMore}
                        disabled={loading}
                        className="flex cursor-pointer items-center justify-center gap-2 rounded-full border-0 bg-mp-accent px-6 py-2.5 font-sans text-xs font-medium tracking-uppercase text-mp-ui-black uppercase transition-colors hover:bg-mp-accent/90 disabled:opacity-50"
                    >
                        {loading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            `Charger ${Math.min(pageSize ?? 100, (total ?? 0) - displayedEntries.length)} de plus`
                        )}
                    </button>
                </div>
            )}
        </div>
    );
}

function cardKey(e: CatalogueEntry & { catalogue?: string }) {
    return e.catalogue ? `${e.catalogue}:${e.id}` : e.id;
}

function defaultExplorerHref(entry: CatalogueEntry) {
    return `/objets?q=${encodeURIComponent(entry.id)}`;
}

interface VisualPreviewProps {
    entry: CatalogueEntry;
}

/** Délai au-delà duquel l'aperçu est déclaré indisponible. */
const PREVIEW_TIMEOUT_MS = 20_000;

/**
 * Affiche l'image d'aperçu grand champ du CDS/DSS2 pour un objet donné.
 * Gère l'indicateur de chargement et le cas d'erreur de chargement de l'image.
 *
 * @param props - Propriétés du composant.
 * @returns Le composant visuel de l'image.
 */
function VisualPreviewImage({ entry }: VisualPreviewProps) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const largeUrl = hips2fitsUrl({
        ra: entry.ra,
        dec: entry.dec,
        sizeArcmin: entry.sizeArcmin,
        sizePx: 400,
        // POURQUOI : une seule image, chargée quand on déplie la fiche. SkyView tient cette charge, pas les listes.
        allowSkyView: true,
    });

    // POURQUOI : SkyView répond en 3 à 5 s, mais peut aussi ne jamais répondre. Sans délai, le chargement
    // tournerait sans fin au lieu d'afficher « Aperçu non disponible ».
    useEffect(() => {
        if (!loading) return;
        const timer = window.setTimeout(() => setError(true), PREVIEW_TIMEOUT_MS);
        return () => window.clearTimeout(timer);
    }, [loading]);

    // POURQUOI : une image déjà en cache peut finir de charger avant que React n'attache `onLoad`.
    const markLoadedIfComplete = useCallback((image: HTMLImageElement | null) => {
        if (image?.complete && image.naturalWidth > 0) setLoading(false);
    }, []);

    return (
        <>
            {loading && !error && (
                <div className="absolute inset-0 flex items-center justify-center bg-mp-ui-black/40">
                    <Loader2 className="h-8 w-8 animate-spin text-mp-accent" />
                </div>
            )}
            {error ? (
                <div className="p-4 text-center">
                    <span className="text-sm text-mp-text-muted">Aperçu non disponible</span>
                </div>
            ) : (
                <img
                    ref={markLoadedIfComplete}
                    src={largeUrl}
                    alt={entry.label}
                    onLoad={() => setLoading(false)}
                    onError={() => {
                        setLoading(false);
                        setError(true);
                    }}
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
            )}
            <div className="pointer-events-none absolute right-2 bottom-2 rounded-sm bg-mp-ui-black/75 px-2.5 py-1 font-mono text-[10px] text-mp-text-muted">
                {entry.sizeArcmin ? `FOV: ~${(entry.sizeArcmin * 2.5).toFixed(0)}′` : 'DSS2 Color'}
            </div>
        </>
    );
}

interface CollapsibleRowProps<T extends CatalogueEntry & { catalogue?: string }> {
    entry: T;
    columns: ListColumn<T>[];
    isExpanded: boolean;
    onToggle: () => void;
    hasRaDec: boolean;
    isRec: boolean;
    isSimplified: boolean;
    hasFullColumns: boolean;
}

/**
 * Ligne de tableau rétractable (accordéon) pour les objets célestes.
 * Se déploie pour afficher la fiche technique complète et l'image grand champ DSS2.
 *
 * @template T - Type de l'objet céleste.
 * @param props - Propriétés du composant.
 * @returns La ligne de grille accordéon.
 */
function CollapsibleRow<T extends CatalogueEntry & { catalogue?: string }>({
    entry,
    columns,
    isExpanded,
    onToggle,
    isRec,
}: CollapsibleRowProps<T>) {
    const [imgError, setImgError] = useState(false);
    const thumb = hips2fitsUrl({ ra: entry.ra, dec: entry.dec, sizeArcmin: entry.sizeArcmin, sizePx: 100 });

    return (
        <div className="row-container col-span-full grid grid-cols-1 overflow-hidden rounded-xl border border-mp-glass-border bg-mp-glass-bg transition-all duration-slow md:grid-cols-subgrid">
            {/* Ligne cliquable principale */}
            <button
                type="button"
                onClick={onToggle}
                className={`col-span-full grid w-full grid-cols-1 items-center gap-4 border-0 bg-transparent px-4 py-3.5 text-left transition-colors hover:bg-mp-glass-solid/40 md:grid-cols-subgrid md:px-6 md:py-4 ${
                    isExpanded ? 'border-b border-mp-glass-border bg-mp-glass-solid/50' : ''
                }`}
            >
                {/* Rendu mobile (< md) : Ligne 1 (Aperçu + Titre + Chevron), Ligne 2 (Type + Score / Colonnes non masquées) */}
                <div className="flex w-full flex-col gap-2 text-left md:hidden">
                    {/* Ligne 1: Aperçu + Titre + Chevron */}
                    <div className="flex w-full items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2.5">
                            {/* Aperçu thumbnail */}
                            <div className="flex h-7 w-12 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-mp-glass-border bg-mp-bg-secondary">
                                {imgError ? (
                                    <span className="text-[8px] text-mp-text-muted">—</span>
                                ) : (
                                    <img
                                        src={thumb}
                                        alt=""
                                        loading="lazy"
                                        decoding="async"
                                        onError={() => setImgError(true)}
                                        className="h-full w-full object-cover"
                                    />
                                )}
                            </div>

                            {/* Titre (Aperçu + Nom sur 1 ligne) */}
                            <div className="flex min-w-0 items-center gap-1.5">
                                <h3 className="truncate font-serif text-base text-mp-text-heading">{entry.label}</h3>
                                {entry.commonName && (
                                    <span className="truncate font-sans text-xs text-mp-accent">
                                        ({entry.commonName})
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Chevron */}
                        <div className="shrink-0 text-mp-text-muted">
                            {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                        </div>
                    </div>

                    {/* Ligne 2: Type + Score (colonnes non masquées sur mobile) */}
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                        {columns
                            .slice(1)
                            .filter((col) => !col.hideOnMobile)
                            .map((col) => (
                                <div key={col.key} className="whitespace-nowrap">
                                    {col.render(entry)}
                                </div>
                            ))}
                    </div>
                </div>

                {/* Rendu desktop (>= md) */}
                <div className="hidden h-9 w-16 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-mp-glass-border bg-mp-bg-secondary md:flex">
                    {imgError ? (
                        <span className="text-[8px] text-mp-text-muted">—</span>
                    ) : (
                        <img
                            src={thumb}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            onError={() => setImgError(true)}
                            className="h-full w-full object-cover"
                        />
                    )}
                </div>

                {/* Colonnes de données dynamiques desktop */}
                {columns.map((col, i) => {
                    const isMain = i === 0;
                    return (
                        <div
                            key={col.key}
                            className={`hidden md:block ${isMain ? 'min-w-0 font-serif text-base text-mp-text-heading' : 'font-sans text-xs whitespace-nowrap text-mp-text-muted'} ${col.align === 'right' ? 'text-right' : 'text-left'} ${col.cellClassName ?? ''}`}
                            title={col.cellTitle?.(entry)}
                        >
                            {col.render(entry)}
                        </div>
                    );
                })}

                {/* Bouton chevron desktop */}
                <div className="hidden shrink-0 items-center justify-end text-right md:flex">
                    {isExpanded ? (
                        <ChevronUp className="h-5 w-5 text-mp-text-muted" />
                    ) : (
                        <ChevronDown className="h-5 w-5 text-mp-text-muted" />
                    )}
                </div>
            </button>

            {/* Tiroir détaillé dépliant */}
            {isExpanded && (
                <div className="col-span-full space-y-6 bg-mp-bg-secondary/40 p-6">
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                        {/* Fiche technique */}
                        <div className="space-y-4">
                            <h4 className="border-b border-mp-glass-border pb-2 text-sm font-medium tracking-uppercase text-mp-text-secondary uppercase">
                                Fiche Technique & Coordonnées
                            </h4>

                            {entry.description && (
                                <p className="text-sm leading-relaxed text-mp-text-body italic">{entry.description}</p>
                            )}

                            <div className="grid grid-cols-2 gap-4 pt-2 text-sm">
                                <div>
                                    <span className="block text-mp-text-muted">Désignation :</span>
                                    <span className="font-mono font-medium text-mp-text-body">{entry.label}</span>
                                </div>
                                {entry.commonName && (
                                    <div>
                                        <span className="block text-mp-text-muted">Nom commun :</span>
                                        <span className="font-medium text-mp-text-body">{entry.commonName}</span>
                                    </div>
                                )}
                                <div>
                                    <span className="block text-mp-text-muted">Type d'objet :</span>
                                    <span className="font-medium text-mp-text-body">{typeLabel(entry.type)}</span>
                                </div>
                                {entry.constellation && (
                                    <div>
                                        <span className="block text-mp-text-muted">Constellation :</span>
                                        <span className="font-medium text-mp-text-body">
                                            {getConstellationName(entry.constellation)}
                                        </span>
                                    </div>
                                )}
                                <div>
                                    <span className="block text-mp-text-muted">Coordonnées célestes (J2000) :</span>
                                    <span className="font-mono text-xs font-medium text-mp-text-body">
                                        RA {formatRa(entry.ra)} · Dec {formatDec(entry.dec)}
                                    </span>
                                </div>
                                {typeof entry.mag === 'number' && (
                                    <div>
                                        <span className="block text-mp-text-muted">Magnitude apparente :</span>
                                        <span className="font-mono font-medium text-mp-text-body">
                                            m{entry.mag.toFixed(2)}
                                        </span>
                                    </div>
                                )}
                                {typeof entry.sizeArcmin === 'number' && entry.sizeArcmin > 0 && (
                                    <div>
                                        <span className="block text-mp-text-muted">Taille apparente :</span>
                                        <span className="font-mono font-medium text-mp-text-body">
                                            {entry.sizeArcmin.toFixed(1)}′
                                        </span>
                                    </div>
                                )}
                                {isRec ? (
                                    <>
                                        {(entry as any).peakMonthStart && (
                                            <div>
                                                <span className="block text-mp-text-muted">Pic d'observabilité :</span>
                                                <span className="font-mono font-medium text-mp-text-body">
                                                    {formatMonthYear(new Date((entry as any).peakMonthStart))}
                                                </span>
                                            </div>
                                        )}
                                        {typeof (entry as any).peakAltDeg === 'number' && (
                                            <div>
                                                <span className="block text-mp-text-muted">
                                                    Hauteur max culminante :
                                                </span>
                                                <span className="font-mono font-medium text-mp-text-body">
                                                    {(entry as any).peakAltDeg.toFixed(0)}°
                                                </span>
                                            </div>
                                        )}
                                        {typeof (entry as any).nightHoursAbove30 === 'number' && (
                                            <div>
                                                <span className="block text-mp-text-muted">
                                                    Temps de nuit &gt; 30° :
                                                </span>
                                                <span className="font-mono font-medium text-mp-text-body">
                                                    {(entry as any).nightHoursAbove30}h
                                                </span>
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <>
                                        {entry.bestMonthLabel && (
                                            <div>
                                                <span className="block text-mp-text-muted">Meilleure période :</span>
                                                <span className="font-medium text-mp-text-body">
                                                    {entry.bestMonthLabel}
                                                </span>
                                            </div>
                                        )}
                                        {typeof entry.bestMonthMaxAlt === 'number' && (
                                            <div>
                                                <span className="block text-mp-text-muted">
                                                    Altitude max culmination :
                                                </span>
                                                <span className="font-mono font-medium text-mp-text-body">
                                                    {entry.bestMonthMaxAlt.toFixed(0)}°
                                                </span>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>

                            {/* Actions */}
                            <div className="flex flex-wrap gap-3 pt-4">
                                <a
                                    href={defaultExplorerHref(entry)}
                                    className="inline-flex items-center gap-2 rounded-full border border-mp-accent bg-mp-accent/10 px-4 py-2 font-sans text-xs font-medium tracking-uppercase text-mp-accent uppercase no-underline transition-colors hover:bg-mp-accent hover:text-mp-ui-black"
                                >
                                    <Telescope className="h-3.5 w-3.5" strokeWidth={1.5} />
                                    Observer
                                </a>
                            </div>
                        </div>

                        {/* Image grand champ DSS2 */}
                        <div className="space-y-4">
                            <h4 className="border-b border-mp-glass-border pb-2 text-sm font-medium tracking-uppercase text-mp-text-secondary uppercase">
                                Aperçu Céleste (DSS2)
                            </h4>
                            <div className="group relative mx-auto flex aspect-square w-full max-w-[360px] items-center justify-center overflow-hidden rounded-xl border border-mp-glass-border bg-mp-bg-secondary">
                                <VisualPreviewImage entry={entry} />
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function EntryCard<T extends CatalogueEntry>({
    entry,
    subtitle,
    onClick,
}: {
    entry: T;
    subtitle?: (entry: T) => ReactNode;
    onClick?: (entry: T) => void;
}) {
    const [imgError, setImgError] = useState(false);
    const thumb = hips2fitsUrl({ ra: entry.ra, dec: entry.dec, sizeArcmin: entry.sizeArcmin });
    const sub: ReactNode = subtitle
        ? subtitle(entry)
        : entry.commonName && entry.commonName !== entry.label
          ? entry.commonName
          : categorize(entry.type);
    const handle = (e: React.MouseEvent) => {
        if (onClick) {
            e.preventDefault();
            onClick(entry);
        }
    };
    return (
        <a
            href={defaultExplorerHref(entry)}
            onClick={handle}
            title={[
                entry.label,
                entry.commonName,
                typeLabel(entry.type),
                entry.constellation && getConstellationName(entry.constellation),
            ]
                .filter(Boolean)
                .join(' · ')}
            className="group flex flex-col overflow-hidden rounded-xl border border-mp-glass-border bg-mp-glass-solid no-underline transition-colors hover:border-mp-accent"
        >
            <div className="aspect-square w-full overflow-hidden bg-mp-bg-secondary">
                {imgError ? (
                    <div className="flex h-full w-full items-center justify-center text-xs text-mp-text-muted">—</div>
                ) : (
                    <img
                        src={thumb}
                        alt={entry.label}
                        loading="lazy"
                        decoding="async"
                        onError={() => setImgError(true)}
                        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                )}
            </div>
            <div className="flex flex-col gap-0.5 px-2 py-1.5">
                <span className="truncate font-mono text-xs leading-tight text-mp-text-heading transition-colors group-hover:text-mp-accent">
                    {entry.label}
                </span>
                {sub && <span className="truncate text-xs leading-tight text-mp-text-muted">{sub}</span>}
                {entry.constellation && (
                    <span className="truncate text-xs leading-tight text-mp-text-secondary">
                        {getConstellationName(entry.constellation)}
                    </span>
                )}
                {typeof entry.mag === 'number' && (
                    <span className="font-mono text-xs leading-tight text-mp-text-muted">
                        m{entry.mag.toFixed(1)}
                        {typeof entry.sizeArcmin === 'number' && entry.sizeArcmin > 0 && (
                            <> · {entry.sizeArcmin.toFixed(1)}′</>
                        )}
                    </span>
                )}
            </div>
        </a>
    );
}

/** Standard column factory used by both the catalogue and recommendations viewers. */
export function defaultCatalogueColumns<T extends CatalogueEntry>(): ListColumn<T>[] {
    return [
        {
            key: 'id',
            header: 'ID',
            sortKey: 'id',
            compare: (a, b) => a.label.localeCompare(b.label, 'fr', { numeric: true }),
            cellClassName: 'font-mono text-mp-text-heading whitespace-nowrap',
            render: (e) => e.label,
        },
        {
            key: 'commonName',
            header: 'Nom commun',
            sortKey: 'commonName',
            compare: (a, b) => (a.commonName ?? '').localeCompare(b.commonName ?? '', 'fr'),
            cellClassName: 'text-mp-text-body max-w-[180px] truncate',
            cellTitle: (e) => e.commonName,
            hideOnMobile: true,
            render: (e) => e.commonName ?? '—',
        },
        {
            key: 'category',
            header: 'Catégorie',
            sortKey: 'category',
            compare: (a, b) => categorize(a.type).localeCompare(categorize(b.type), 'fr'),
            cellClassName: 'text-mp-text-muted whitespace-nowrap',
            hideOnMobile: true,
            render: (e) => categorize(e.type),
        },
        {
            key: 'type',
            header: 'Type',
            sortKey: 'type',
            compare: (a, b) => typeLabel(a.type).localeCompare(typeLabel(b.type), 'fr'),
            cellClassName: 'text-left max-w-[200px] whitespace-nowrap',
            cellTitle: (e) => e.type,
            render: (e) => {
                const cat = categorize(e.type);
                const colorClass =
                    cat === 'Nébuleuse'
                        ? 'border-rose-500/40 bg-rose-500/15 text-rose-400'
                        : cat === 'Galaxie'
                          ? 'border-purple-500/40 bg-purple-500/15 text-purple-400'
                          : cat === 'Amas'
                            ? 'border-amber-500/40 bg-amber-500/15 text-amber-400'
                            : cat === 'Étoile'
                              ? 'border-blue-500/40 bg-blue-500/15 text-blue-400'
                              : 'border-teal-500/40 bg-teal-500/15 text-teal-400';
                return (
                    <span
                        title={`Type : ${typeLabel(e.type)} (${categorize(e.type)})`}
                        className={`inline-block cursor-help rounded-sm border px-1.5 py-0.5 font-sans text-[9px] font-medium tracking-wider uppercase select-none ${colorClass}`}
                    >
                        {typeLabel(e.type)}
                    </span>
                );
            },
        },
        {
            key: 'constellation',
            header: 'Const.',
            sortKey: 'constellation',
            compare: (a, b) => (a.constellation ?? '').localeCompare(b.constellation ?? ''),
            cellClassName: 'text-mp-text-muted whitespace-nowrap',
            hideOnMobile: true,
            render: (e) => (e.constellation ? getConstellationName(e.constellation) : '—'),
        },
        {
            key: 'mag',
            header: 'Mag.',
            align: 'right',
            sortKey: 'mag',
            compare: (a, b) => (a.mag ?? 99) - (b.mag ?? 99),
            cellClassName: 'text-mp-text-muted font-mono whitespace-nowrap',
            hideOnMobile: true,
            render: (e) => (typeof e.mag === 'number' ? e.mag.toFixed(1) : '—'),
        },
        {
            key: 'size',
            header: 'Taille',
            align: 'right',
            sortKey: 'size',
            compare: (a, b) => (a.sizeArcmin ?? 0) - (b.sizeArcmin ?? 0),
            cellClassName: 'text-mp-text-muted font-mono whitespace-nowrap',
            hideOnMobile: true,
            render: (e) => (typeof e.sizeArcmin === 'number' && e.sizeArcmin > 0 ? `${e.sizeArcmin.toFixed(1)}′` : '—'),
        },
        {
            key: 'bestMonth',
            header: 'Mois',
            align: 'right',
            sortKey: 'bestMonth',
            compare: (a, b) => (a.bestMonthIndex ?? 99) - (b.bestMonthIndex ?? 99),
            cellClassName: 'text-mp-text-muted whitespace-nowrap',
            cellTitle: (e) =>
                typeof e.bestMonthMaxAlt === 'number' ? `Alt. max: ${e.bestMonthMaxAlt.toFixed(0)}°` : undefined,
            hideOnMobile: true,
            render: (e) => e.bestMonthLabel ?? '—',
        },
        {
            key: 'bestMonthMaxAlt',
            header: 'Hauteur',
            align: 'right',
            sortKey: 'bestMonthMaxAlt',
            compare: (a, b) => (a.bestMonthMaxAlt ?? 0) - (b.bestMonthMaxAlt ?? 0),
            cellClassName: 'text-mp-text-muted font-mono whitespace-nowrap',
            hideOnMobile: true,
            render: (e) => (typeof e.bestMonthMaxAlt === 'number' ? `${e.bestMonthMaxAlt.toFixed(0)}°` : '—'),
        },
        {
            key: 'ra',
            header: 'α',
            align: 'right',
            sortKey: 'ra',
            compare: (a, b) => a.ra - b.ra,
            cellClassName: 'text-mp-text-muted font-mono whitespace-nowrap',
            hideOnMobile: true,
            render: (e) => formatRa(e.ra),
        },
        {
            key: 'dec',
            header: 'δ',
            align: 'right',
            sortKey: 'dec',
            compare: (a, b) => a.dec - b.dec,
            cellClassName: 'text-mp-text-muted font-mono whitespace-nowrap',
            hideOnMobile: true,
            render: (e) => formatDec(e.dec),
        },
    ];
}
