import { useCallback, useEffect, useId, useState } from 'react';
import {
    Search,
    Filter,
    BookOpen,
    Database,
    Globe,
    Image,
    FileText,
    FileCode,
    AlertCircle,
    RefreshCw,
    ExternalLink,
    Edit,
    X,
} from 'lucide-react';
import AdminProviders from './AdminProviders';
import AstroAnnotationCell from './AstroAnnotationCell';
import ClaudeCodeNotice from './ClaudeCodeNotice';
import { useToast } from './Toast';
import { WEB_IMAGES_CHANGED_EVENT } from './WebImagesReminder';
import {
    ANNOTATION_FILTERS,
    matchesAnnotationFilter,
    type AnnotationAttempt,
    type AnnotationFilter,
    type AnnotationInfo,
} from '@/lib/admin/annotation-source';

interface CsvPhoto {
    ID: string;
    Title: string;
    Uploaded: string;
    Type: string;
    Constellation: string;
    Url: string;
    year: string;
    hasRaw: boolean;
    hasMini: boolean;
    hasAlt: boolean;
    hasWiki: boolean;
    hasDetails: boolean;
    hasSeo: boolean;
    hasAnnotation: boolean;
    altText?: string;
    wikiDesc?: string;
    wikiSource?: string;
    techDetails?: {
        discovery: string | null;
        object_type: string | null;
        dimensions_ly: number | null;
        distance_ly: number | null;
        apparent_dimensions: string | null;
        apparent_magnitude: number | null;
        apparent_radius: number | null;
        source_url: string | null;
    };
    seoDesc?: string;
    rawPath?: string;
    miniPath?: string;
    annotationPath?: string;
    annotation?: AnnotationInfo;
    annotationRun?: AnnotationAttempt;
    annotationRunCount?: number;
    draft?: boolean;
}

function isAnnotationFilter(value: string): value is AnnotationFilter {
    return value in ANNOTATION_FILTERS;
}

export default function AstroPhotosPanel() {
    return (
        <AdminProviders>
            <AstroPhotosPanelInner />
        </AdminProviders>
    );
}

function AstroPhotosPanelInner() {
    const toast = useToast();
    const [photos, setPhotos] = useState<CsvPhoto[]>([]);
    const [loading, setLoading] = useState(false);

    // Selected photo for editing modal
    const [selectedPhoto, setSelectedPhoto] = useState<CsvPhoto | null>(null);

    // Filter states
    const [search, setSearch] = useState('');
    // POURQUOI : la liste « À faire » du tableau de bord ouvre la vue déjà filtrée (`?filtre=missing-wiki`).
    const [statusFilter, setStatusFilter] = useState(() =>
        typeof window === 'undefined' ? 'all' : (new URLSearchParams(window.location.search).get('filtre') ?? 'all'),
    );

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/astrophotos/recent?limit=all');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            setPhotos((await res.json()) as CsvPhoto[]);
        } catch (e) {
            toast.error(String((e as Error).message ?? e), { title: 'Erreur de chargement' });
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        void load();
        // POURQUOI : l'import (page « Importer ») signale ses fins d'exécution par cet événement.
        const reload = () => void load();
        window.addEventListener(WEB_IMAGES_CHANGED_EVENT, reload);
        return () => window.removeEventListener(WEB_IMAGES_CHANGED_EVENT, reload);
    }, [load]);

    // Calculate metadata statistics
    const totalCount = photos.length;
    const rawCount = photos.filter((p) => p.hasRaw).length;
    const miniCount = photos.filter((p) => p.hasMini).length;
    const altCount = photos.filter((p) => p.hasAlt).length;
    const wikiCount = photos.filter((p) => p.hasWiki).length;
    const detailsCount = photos.filter((p) => p.hasDetails).length;
    const seoCount = photos.filter((p) => p.hasSeo).length;
    const annotationCount = photos.filter((p) => p.hasAnnotation).length;
    const annotationFilterCounts = Object.fromEntries(
        (Object.keys(ANNOTATION_FILTERS) as AnnotationFilter[]).map((filter) => [
            filter,
            photos.filter((p) => matchesAnnotationFilter(p, filter)).length,
        ]),
    ) as Record<AnnotationFilter, number>;
    const miroirsAnnotationCount = annotationFilterCounts['annotation-miroirs'];

    // Filtered data calculation
    const filteredPhotos = photos.filter((p) => {
        // Search filter
        const query = search.toLowerCase().trim();
        const matchesSearch =
            !query ||
            p.ID.includes(query) ||
            p.Title.toLowerCase().includes(query) ||
            p.Type.toLowerCase().includes(query) ||
            p.Constellation.toLowerCase().includes(query);

        if (!matchesSearch) return false;

        // Status filters
        if (statusFilter === 'missing-raw') return !p.hasRaw;
        if (statusFilter === 'missing-mini') return !p.hasMini;
        if (statusFilter === 'missing-annotation') return !p.hasAnnotation;
        if (statusFilter === 'missing-alt') return !p.hasAlt;
        if (statusFilter === 'missing-wiki') return !p.hasWiki;
        if (statusFilter === 'missing-details') return !p.hasDetails;
        if (statusFilter === 'missing-seo') return !p.hasSeo;
        if (isAnnotationFilter(statusFilter)) return matchesAnnotationFilter(p, statusFilter);

        return true;
    });

    const handleStatClick = (filterType: string) => {
        setStatusFilter((prev) => (prev === filterType ? 'all' : filterType));
    };

    return (
        <div className="flex flex-col gap-5 pb-12">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="font-serif text-xl font-bold text-mp-text-heading">Gestion Astrophotographies</h1>
                    <p className="mt-0.5 text-xs text-mp-text-muted">
                        Pilotez le catalogue astronomique, modifiez les fiches de métadonnées et suivez la complétude du
                        site.
                    </p>
                </div>
                <a
                    href="/admin/astrophotos/importer"
                    className="flex min-h-touch items-center gap-1.5 rounded-md border border-mp-accent bg-mp-accent px-4 py-2 text-xs font-semibold text-mp-ui-black shadow-md shadow-mp-accent/10 hover:opacity-90"
                >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    Importer depuis AstroBin
                </a>
            </div>

            {/* Coverage Statistics Cards Grid */}
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-9">
                <PipelineStat
                    label="Entrées CSV"
                    value={totalCount}
                    total={totalCount}
                    icon={FileCode}
                    active={statusFilter === 'all'}
                    onClick={() => setStatusFilter('all')}
                />
                <PipelineStat
                    label="Raws présents"
                    value={rawCount}
                    total={totalCount}
                    icon={Image}
                    active={statusFilter === 'missing-raw'}
                    onClick={() => handleStatClick('missing-raw')}
                    accentColor="emerald"
                />
                <PipelineStat
                    label="Minis générés"
                    value={miniCount}
                    total={totalCount}
                    icon={Image}
                    active={statusFilter === 'missing-mini'}
                    onClick={() => handleStatClick('missing-mini')}
                    accentColor="emerald"
                />
                <PipelineStat
                    label="Annotations"
                    value={annotationCount}
                    total={totalCount}
                    icon={FileCode}
                    active={statusFilter === 'missing-annotation'}
                    onClick={() => handleStatClick('missing-annotation')}
                    accentColor="emerald"
                />
                <PipelineStat
                    label="Calques Miroirs"
                    value={miroirsAnnotationCount}
                    total={totalCount}
                    icon={FileCode}
                    active={statusFilter === 'annotation-not-miroirs'}
                    onClick={() => handleStatClick('annotation-not-miroirs')}
                    accentColor="emerald"
                />
                <PipelineStat
                    label="Alts saisis"
                    value={altCount}
                    total={totalCount}
                    icon={FileText}
                    active={statusFilter === 'missing-alt'}
                    onClick={() => handleStatClick('missing-alt')}
                    accentColor="emerald"
                />
                <PipelineStat
                    label="Wikis reliés"
                    value={wikiCount}
                    total={totalCount}
                    icon={BookOpen}
                    active={statusFilter === 'missing-wiki'}
                    onClick={() => handleStatClick('missing-wiki')}
                    accentColor="emerald"
                />
                <PipelineStat
                    label="Fiches tech."
                    value={detailsCount}
                    total={totalCount}
                    icon={Database}
                    active={statusFilter === 'missing-details'}
                    onClick={() => handleStatClick('missing-details')}
                    accentColor="emerald"
                />
                <PipelineStat
                    label="Descr. SEO"
                    value={seoCount}
                    total={totalCount}
                    icon={Globe}
                    active={statusFilter === 'missing-seo'}
                    onClick={() => handleStatClick('missing-seo')}
                    accentColor="emerald"
                />
            </section>

            {!loading && seoCount < totalCount && (
                <ClaudeCodeNotice
                    message={`${totalCount - seoCount} photo(s) sans description SEO`}
                    commands={['/generate-seo astro']}
                />
            )}

            {/* Central Controls: Search & Fast Filter dropdown */}
            <div className="flex flex-col items-stretch justify-between gap-3 rounded-xl border border-mp-glass-border bg-mp-glass-solid/20 p-3.5 sm:flex-row sm:items-center">
                <div className="relative max-w-lg flex-1">
                    <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-mp-text-muted" />
                    <input
                        type="text"
                        placeholder="Rechercher par titre, ID, constellation, type..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="admin-input w-full border-mp-glass-border bg-mp-ui-black/40 pl-9 text-xs focus:border-mp-accent"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <Filter className="h-3.5 w-3.5 shrink-0 text-mp-text-muted" />
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="admin-input min-w-[200px] border-mp-glass-border bg-mp-ui-black/40 text-xs"
                    >
                        <option value="all">Tout afficher ({totalCount})</option>
                        <option value="missing-raw">⚠️ Raws manquants ({totalCount - rawCount})</option>
                        <option value="missing-mini">🖼️ Minis manquants ({totalCount - miniCount})</option>
                        <option value="missing-annotation">
                            🎨 Annotations manquantes ({totalCount - annotationCount})
                        </option>
                        {(Object.keys(ANNOTATION_FILTERS) as AnnotationFilter[]).map((filter) => (
                            <option key={filter} value={filter}>
                                🎨 {ANNOTATION_FILTERS[filter]} ({annotationFilterCounts[filter]})
                            </option>
                        ))}
                        <option value="missing-alt">✍️ Alts manquants ({totalCount - altCount})</option>
                        <option value="missing-wiki">🌐 Wikis manquants ({totalCount - wikiCount})</option>
                        <option value="missing-details">
                            🔧 Fiches tech. manquantes ({totalCount - detailsCount})
                        </option>
                        <option value="missing-seo">🔍 SEO manquants ({totalCount - seoCount})</option>
                    </select>
                </div>
            </div>

            <section className="overflow-hidden rounded-xl border border-mp-glass-border bg-mp-glass-solid/40 shadow-lg">
                <header className="flex items-center justify-between border-b border-mp-glass-border bg-mp-glass-solid/60 px-4 py-3">
                    <h2 className="flex items-center gap-2 font-mono text-[11px] tracking-wider text-mp-text-secondary uppercase">
                        <span>Catalogue d'Astrophotographies</span>
                        <span className="h-1.5 w-1.5 rounded-full bg-mp-text-muted" />
                        <span className="text-mp-accent">
                            {filteredPhotos.length} / {photos.length} photos
                        </span>
                    </h2>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={load}
                            disabled={loading}
                            className="flex items-center gap-1.5 rounded-md border border-mp-glass-border px-3 py-1.5 text-xs text-mp-text-secondary transition-colors hover:border-mp-accent hover:text-mp-accent disabled:opacity-50"
                        >
                            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
                            {loading ? 'Rechargement…' : 'Rafraîchir'}
                        </button>
                    </div>
                </header>
                <div className="scrollbar-thin overflow-x-auto">
                    <table className="w-full border-collapse text-left text-xs">
                        <thead className="bg-mp-glass-solid/20 text-[10px] tracking-wider text-mp-text-muted uppercase">
                            <tr className="border-b border-mp-glass-border">
                                <th className="px-4 py-3">ID</th>
                                <th className="px-4 py-3">Titre</th>
                                <th className="px-4 py-3">Type</th>
                                <th className="px-4 py-3">Constellation</th>
                                <th className="px-4 py-3">Téléversé</th>
                                <th className="px-3 py-3 text-center">Raw</th>
                                <th className="px-3 py-3 text-center">Mini</th>
                                <th className="px-3 py-3">Annotation</th>
                                <th className="px-3 py-3 text-center">Alt</th>
                                <th className="px-3 py-3 text-center">Wiki</th>
                                <th className="px-3 py-3 text-center">Tech</th>
                                <th className="px-3 py-3 text-center">SEO</th>
                                <th className="px-4 py-3 pr-6 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-mp-glass-border/40">
                            {filteredPhotos.map((p) => (
                                <tr key={p.ID} className="transition-colors hover:bg-mp-accent/5">
                                    <td className="px-4 py-2.5 font-mono text-mp-text-muted">{p.ID}</td>
                                    <td
                                        className="max-w-xs cursor-pointer truncate px-4 py-2.5 font-semibold text-mp-text-primary transition-colors hover:text-mp-accent"
                                        title="Cliquez pour éditer"
                                        onClick={() => setSelectedPhoto(p)}
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className="truncate">{p.Title}</span>
                                            {p.draft && (
                                                <span className="inline-flex shrink-0 items-center rounded-full border border-yellow-500/30 bg-yellow-500/10 px-1.5 py-0.5 text-[9px] font-medium text-yellow-500">
                                                    Brouillon
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td
                                        className="max-w-[120px] truncate px-4 py-2.5 text-mp-text-secondary"
                                        title={p.Type}
                                    >
                                        {p.Type}
                                    </td>
                                    <td className="px-4 py-2.5 text-mp-text-secondary">{p.Constellation}</td>
                                    <td className="px-4 py-2.5 font-mono text-mp-text-muted">
                                        {p.Uploaded.slice(0, 10)}
                                    </td>
                                    <td className="px-3 py-2.5 text-center">
                                        <StatusDot ok={p.hasRaw} title={p.rawPath} label="RAW" />
                                    </td>
                                    <td className="px-3 py-2.5 text-center">
                                        <StatusDot ok={p.hasMini} title={p.miniPath} label="Mini" />
                                    </td>
                                    <td className="px-3 py-2.5">
                                        <AstroAnnotationCell
                                            hasAnnotation={p.hasAnnotation}
                                            annotation={p.annotation}
                                            annotationRun={p.annotationRun}
                                            annotationRunCount={p.annotationRunCount}
                                            annotationPath={p.annotationPath}
                                        />
                                    </td>
                                    <td className="px-3 py-2.5 text-center">
                                        <StatusDot ok={p.hasAlt} label="Alt text" />
                                    </td>
                                    <td className="px-3 py-2.5 text-center">
                                        <StatusDot ok={p.hasWiki} label="Wikipédia" />
                                    </td>
                                    <td className="px-3 py-2.5 text-center">
                                        <StatusDot ok={p.hasDetails} label="Fiche technique" />
                                    </td>
                                    <td className="px-3 py-2.5 text-center">
                                        <StatusDot ok={p.hasSeo} label="Description SEO" />
                                    </td>
                                    <td className="px-4 py-2.5 pr-6">
                                        <div className="flex items-center justify-end gap-3.5">
                                            <button
                                                type="button"
                                                onClick={() => setSelectedPhoto(p)}
                                                className="inline-flex items-center gap-1 text-xs font-semibold text-mp-accent transition-colors hover:text-mp-accent-hover"
                                                title="Éditer les métadonnées"
                                            >
                                                <Edit className="h-3 w-3 shrink-0" />
                                                <span>Éditer</span>
                                            </button>
                                            {p.Url && (
                                                <a
                                                    href={p.Url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1 text-mp-text-muted transition-colors hover:text-mp-accent"
                                                    title="Ouvrir sur Astrobin"
                                                >
                                                    <ExternalLink className="h-3 w-3 shrink-0" />
                                                </a>
                                            )}
                                            <a
                                                href={`/admin/astrophotos/importer?refresh=${encodeURIComponent(p.ID)}`}
                                                className="inline-flex items-center gap-1 text-mp-text-muted transition-colors hover:text-mp-accent"
                                                title="Photo retraitée sur AstroBin : la reprendre"
                                                aria-label={`Reprendre la photo ${p.ID} depuis AstroBin`}
                                            >
                                                <RefreshCw className="h-3 w-3 shrink-0" aria-hidden="true" />
                                            </a>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {filteredPhotos.length === 0 && (
                                <tr>
                                    <td colSpan={13} className="px-4 py-12 text-center text-xs text-mp-text-muted">
                                        <AlertCircle className="mx-auto mb-2.5 h-8 w-8 text-mp-text-muted/60" />
                                        Aucun enregistrement ne correspond aux critères de recherche ou de filtrage.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* Premium Metadata Editor Modal */}
            {selectedPhoto && (
                <MetadataEditorModal photo={selectedPhoto} onClose={() => setSelectedPhoto(null)} onSave={load} />
            )}
        </div>
    );
}

function PipelineStat({
    label,
    value,
    total,
    icon: Icon,
    active,
    onClick,
    accentColor = 'accent',
}: {
    label: string;
    value: number;
    total: number;
    icon: React.ComponentType<any>;
    active: boolean;
    onClick: () => void;
    accentColor?: 'accent' | 'emerald';
}) {
    const percentage = total > 0 ? Math.round((value / total) * 100) : 0;

    // POURQUOI : On applique des couleurs de barre de complétude dynamiques et haut de gamme.
    // - Vert/Gold (100%) : complétude totale.
    // - Orange (0% < complétude < 100%) : s'il manque des données (ex. annotations, miniatures).
    // - Rouge (0%) : si aucune donnée n'est présente (value === 0).
    let barBgClass: string;
    let percentColorClass: string;

    if (value === 0) {
        barBgClass = 'bg-red-500';
        percentColorClass = 'text-red-400 font-semibold';
    } else if (value < total) {
        barBgClass = 'bg-orange-500';
        percentColorClass = 'text-orange-400 font-semibold';
    } else {
        barBgClass = active ? 'bg-mp-accent' : accentColor === 'emerald' ? 'bg-emerald-400' : 'bg-mp-accent';
        percentColorClass = active ? 'text-mp-accent font-semibold' : 'text-emerald-400 font-semibold';
    }

    return (
        <button
            type="button"
            onClick={onClick}
            className={`flex cursor-pointer flex-col rounded-xl border p-4 text-left transition-all duration-200 ${
                active
                    ? 'border-mp-accent bg-mp-accent/10 shadow-lg ring-1 shadow-mp-accent/5 ring-mp-accent/30'
                    : 'border-mp-glass-border bg-mp-glass-solid/40 hover:border-mp-glass-hover-border hover:bg-mp-glass-solid/65'
            }`}
        >
            <div className="flex w-full items-center justify-between gap-2">
                <span className="truncate font-mono text-[10px] tracking-wider text-mp-text-muted uppercase">
                    {label}
                </span>
                <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-mp-accent' : 'text-mp-text-muted'}`} />
            </div>

            <div className="mt-2 flex items-baseline gap-1.5">
                <span className="font-serif text-2xl font-bold text-mp-text-heading">{value}</span>
                <span className="text-[10px] text-mp-text-muted">/ {total}</span>
            </div>

            <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-mp-ui-black/60">
                <div
                    className={`h-full transition-all duration-500 ${barBgClass}`}
                    style={{ width: `${percentage}%` }}
                />
            </div>

            <div className="mt-1 flex w-full items-center justify-between text-[10px] text-mp-text-muted">
                <span>Complétude</span>
                <span className={percentColorClass}>{percentage}%</span>
            </div>
        </button>
    );
}

function StatusDot({ ok, title, label }: { ok: boolean; title?: string; label?: string }) {
    return (
        <span
            title={title || (ok ? `${label} présent` : `${label} manquant`)}
            className={`inline-flex h-5 w-5 items-center justify-center rounded-full border transition-all ${
                ok
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                    : 'border-red-500/20 bg-red-500/10 text-red-400'
            }`}
        >
            <span className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-emerald-400' : 'bg-red-400'}`} />
        </span>
    );
}

interface MetadataEditorModalProps {
    photo: CsvPhoto;
    onClose: () => void;
    onSave: () => void;
}

function MetadataEditorModal({ photo, onClose, onSave }: MetadataEditorModalProps) {
    const toast = useToast();
    const [activeTab, setActiveTab] = useState<'alt' | 'wiki' | 'tech' | 'seo'>('alt');
    const [saving, setSaving] = useState(false);
    const fieldId = useId();

    // Form states
    const [altText, setAltText] = useState(photo.altText || '');

    const [wikiDesc, setWikiDesc] = useState(photo.wikiDesc || '');
    const [wikiSource, setWikiSource] = useState(photo.wikiSource || '');

    const [discovery, setDiscovery] = useState(photo.techDetails?.discovery || '');
    const [objectType, setObjectType] = useState(photo.techDetails?.object_type || '');
    const [dimensionsLy, setDimensionsLy] = useState(
        photo.techDetails?.dimensions_ly !== null && photo.techDetails?.dimensions_ly !== undefined
            ? String(photo.techDetails.dimensions_ly)
            : '',
    );
    const [distanceLy, setDistanceLy] = useState(
        photo.techDetails?.distance_ly !== null && photo.techDetails?.distance_ly !== undefined
            ? String(photo.techDetails.distance_ly)
            : '',
    );
    const [apparentDimensions, setApparentDimensions] = useState(photo.techDetails?.apparent_dimensions || '');
    const [apparentMagnitude, setApparentMagnitude] = useState(
        photo.techDetails?.apparent_magnitude !== null && photo.techDetails?.apparent_magnitude !== undefined
            ? String(photo.techDetails.apparent_magnitude)
            : '',
    );
    const [apparentRadius, setApparentRadius] = useState(
        photo.techDetails?.apparent_radius !== null && photo.techDetails?.apparent_radius !== undefined
            ? String(photo.techDetails.apparent_radius)
            : '',
    );
    const [sourceUrl, setSourceUrl] = useState(photo.techDetails?.source_url || '');

    const [seoDesc, setSeoDesc] = useState(photo.seoDesc || '');
    const [draft, setDraft] = useState(photo.draft || false);

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await fetch('/api/admin/astrophotos/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: photo.ID,
                    year: photo.year,
                    title: photo.Title,
                    alt: altText,
                    wiki: {
                        description: wikiDesc,
                        source: wikiSource,
                    },
                    tech: {
                        discovery: discovery || null,
                        object_type: objectType || null,
                        dimensions_ly: dimensionsLy ? Number(dimensionsLy) : null,
                        distance_ly: distanceLy ? Number(distanceLy) : null,
                        apparent_dimensions: apparentDimensions || null,
                        apparent_magnitude: apparentMagnitude ? Number(apparentMagnitude) : null,
                        apparent_radius: apparentRadius ? Number(apparentRadius) : null,
                        source_url: sourceUrl || null,
                    },
                    seo: seoDesc,
                    draft: draft,
                }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || `Erreur HTTP ${res.status}`);
            }

            toast.success('Les métadonnées ont été enregistrées avec succès.', { title: 'Mise à jour réussie' });
            onSave();
            onClose();
        } catch (e) {
            toast.error((e as Error).message, { title: 'Échec de la sauvegarde' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-mp-ui-black/80 p-4 backdrop-blur-xs">
            <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-mp-glass-border bg-mp-glass-solid shadow-2xl">
                {/* Header */}
                <header className="flex items-center justify-between border-b border-mp-glass-border bg-mp-glass-solid/40 px-5 py-4">
                    <div>
                        <h3 className="font-serif text-base font-bold text-mp-text-heading">
                            Éditer Métadonnées : {photo.Title}
                        </h3>
                        <p className="mt-0.5 font-mono text-[10px] text-mp-text-muted">
                            ID Astrobin : {photo.ID} · Dossier : /assets/astrophotographies/{photo.year}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1 text-mp-text-muted transition-colors hover:bg-mp-glass-border hover:text-mp-text-primary"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </header>

                {/* Tabs */}
                <div className="flex items-center justify-between border-b border-mp-glass-border bg-mp-glass-solid/20 px-4">
                    <div className="flex flex-wrap">
                        <TabButton
                            active={activeTab === 'alt'}
                            onClick={() => setActiveTab('alt')}
                            icon={FileText}
                            label="Texte Alt"
                        />
                        <TabButton
                            active={activeTab === 'wiki'}
                            onClick={() => setActiveTab('wiki')}
                            icon={BookOpen}
                            label="Wikipédia"
                        />
                        <TabButton
                            active={activeTab === 'tech'}
                            onClick={() => setActiveTab('tech')}
                            icon={Database}
                            label="Fiche Tech"
                        />
                        <TabButton
                            active={activeTab === 'seo'}
                            onClick={() => setActiveTab('seo')}
                            icon={Globe}
                            label="SEO Description"
                        />
                    </div>
                    <div className="shrink-0 py-2 pr-2">
                        <label className="flex cursor-pointer items-center gap-2 rounded-md border border-mp-glass-border bg-mp-ui-black/30 px-2.5 py-1.5 text-xs font-semibold text-mp-text-primary transition-all select-none hover:border-mp-accent/50">
                            <input type="checkbox" checked={draft} onChange={(e) => setDraft(e.target.checked)} />
                            <span>Brouillon</span>
                        </label>
                    </div>
                </div>

                {/* Scrollable content body */}
                <div className="flex scrollbar-thin flex-1 flex-col gap-4 overflow-y-auto p-5">
                    {/* ALT TEXT TAB */}
                    {activeTab === 'alt' && (
                        <div className="flex flex-col gap-2">
                            <label
                                htmlFor={`${fieldId}-altText`}
                                className="font-mono text-[10px] tracking-wider text-mp-text-secondary uppercase"
                            >
                                Description alternative (alt text)
                            </label>
                            <p className="mb-1 text-[11px] leading-relaxed text-mp-text-muted">
                                Description textuelle détaillée utilisée pour l'accessibilité (lecteurs d'écran) et le
                                SEO des images.
                            </p>
                            <textarea
                                id={`${fieldId}-altText`}
                                value={altText}
                                onChange={(e) => setAltText(e.target.value)}
                                rows={5}
                                placeholder="Description de l'image (ex: Galaxie spirale vue de face avec des bras bleus très contrastés...)"
                                className="admin-input w-full bg-mp-ui-black/60"
                            />
                        </div>
                    )}

                    {/* WIKIPEDIA TAB */}
                    {activeTab === 'wiki' && (
                        <div className="flex flex-col gap-4">
                            <div className="flex flex-col gap-2">
                                <label
                                    htmlFor={`${fieldId}-wikiDesc`}
                                    className="font-mono text-[10px] tracking-wider text-mp-text-secondary uppercase"
                                >
                                    Description Wikipédia (FR)
                                </label>
                                <textarea
                                    id={`${fieldId}-wikiDesc`}
                                    value={wikiDesc}
                                    onChange={(e) => setWikiDesc(e.target.value)}
                                    rows={5}
                                    placeholder="Résumé encyclopédique de l'objet..."
                                    className="admin-input w-full bg-mp-ui-black/60 text-xs"
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <label
                                    htmlFor={`${fieldId}-wikiSource`}
                                    className="font-mono text-[10px] tracking-wider text-mp-text-secondary uppercase"
                                >
                                    Lien URL de l'article Wikipédia
                                </label>
                                <input
                                    id={`${fieldId}-wikiSource`}
                                    type="url"
                                    value={wikiSource}
                                    onChange={(e) => setWikiSource(e.target.value)}
                                    placeholder="https://fr.wikipedia.org/wiki/..."
                                    className="admin-input w-full bg-mp-ui-black/60"
                                />
                            </div>
                        </div>
                    )}

                    {/* TECH TAB */}
                    {activeTab === 'tech' && (
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div className="flex flex-col gap-1.5">
                                <label
                                    htmlFor={`${fieldId}-objectType`}
                                    className="font-mono text-[10px] tracking-wider text-mp-text-secondary uppercase"
                                >
                                    Type d'objet
                                </label>
                                <input
                                    id={`${fieldId}-objectType`}
                                    type="text"
                                    value={objectType}
                                    onChange={(e) => setObjectType(e.target.value)}
                                    placeholder="ex: Galaxie spirale, Nébuleuse, Amas"
                                    className="admin-input w-full bg-mp-ui-black/60"
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label
                                    htmlFor={`${fieldId}-discovery`}
                                    className="font-mono text-[10px] tracking-wider text-mp-text-secondary uppercase"
                                >
                                    Découverte par
                                </label>
                                <input
                                    id={`${fieldId}-discovery`}
                                    type="text"
                                    value={discovery}
                                    onChange={(e) => setDiscovery(e.target.value)}
                                    placeholder="ex: William Herschel en 1784"
                                    className="admin-input w-full bg-mp-ui-black/60"
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label
                                    htmlFor={`${fieldId}-dimensionsLy`}
                                    className="font-mono text-[10px] tracking-wider text-mp-text-secondary uppercase"
                                >
                                    Dimensions (années-lumière)
                                </label>
                                <input
                                    id={`${fieldId}-dimensionsLy`}
                                    type="number"
                                    value={dimensionsLy}
                                    onChange={(e) => setDimensionsLy(e.target.value)}
                                    placeholder="ex: 120000"
                                    className="admin-input w-full bg-mp-ui-black/60"
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label
                                    htmlFor={`${fieldId}-distanceLy`}
                                    className="font-mono text-[10px] tracking-wider text-mp-text-secondary uppercase"
                                >
                                    Distance (années-lumière)
                                </label>
                                <input
                                    id={`${fieldId}-distanceLy`}
                                    type="number"
                                    value={distanceLy}
                                    onChange={(e) => setDistanceLy(e.target.value)}
                                    placeholder="ex: 2540000"
                                    className="admin-input w-full bg-mp-ui-black/60"
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label
                                    htmlFor={`${fieldId}-apparentDimensions`}
                                    className="font-mono text-[10px] tracking-wider text-mp-text-secondary uppercase"
                                >
                                    Dimensions apparentes
                                </label>
                                <input
                                    id={`${fieldId}-apparentDimensions`}
                                    type="text"
                                    value={apparentDimensions}
                                    onChange={(e) => setApparentDimensions(e.target.value)}
                                    placeholder="ex: 65.0 x 60.0"
                                    className="admin-input w-full bg-mp-ui-black/60"
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label
                                    htmlFor={`${fieldId}-apparentMagnitude`}
                                    className="font-mono text-[10px] tracking-wider text-mp-text-secondary uppercase"
                                >
                                    Magnitude apparente
                                </label>
                                <input
                                    id={`${fieldId}-apparentMagnitude`}
                                    type="number"
                                    step="0.01"
                                    value={apparentMagnitude}
                                    onChange={(e) => setApparentMagnitude(e.target.value)}
                                    placeholder="ex: 3.44"
                                    className="admin-input w-full bg-mp-ui-black/60"
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label
                                    htmlFor={`${fieldId}-apparentRadius`}
                                    className="font-mono text-[10px] tracking-wider text-mp-text-secondary uppercase"
                                >
                                    Rayon apparent (arcmin)
                                </label>
                                <input
                                    id={`${fieldId}-apparentRadius`}
                                    type="number"
                                    step="0.1"
                                    value={apparentRadius}
                                    onChange={(e) => setApparentRadius(e.target.value)}
                                    placeholder="ex: 110"
                                    className="admin-input w-full bg-mp-ui-black/60"
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label
                                    htmlFor={`${fieldId}-sourceUrl`}
                                    className="font-mono text-[10px] tracking-wider text-mp-text-secondary uppercase"
                                >
                                    URL Source technique
                                </label>
                                <input
                                    id={`${fieldId}-sourceUrl`}
                                    type="url"
                                    value={sourceUrl}
                                    onChange={(e) => setSourceUrl(e.target.value)}
                                    placeholder="https://..."
                                    className="admin-input w-full bg-mp-ui-black/60"
                                />
                            </div>
                        </div>
                    )}

                    {/* SEO TAB */}
                    {activeTab === 'seo' && (
                        <div className="flex flex-col gap-2">
                            <label
                                htmlFor={`${fieldId}-seoDesc`}
                                className="font-mono text-[10px] tracking-wider text-mp-text-secondary uppercase"
                            >
                                Description SEO (Meta Description)
                            </label>
                            <p className="mb-1 text-[11px] leading-relaxed text-mp-text-muted">
                                Description courte affichée dans les résultats de recherche Google. Idéalement entre 120
                                et 160 caractères.
                            </p>
                            <textarea
                                id={`${fieldId}-seoDesc`}
                                value={seoDesc}
                                onChange={(e) => setSeoDesc(e.target.value)}
                                rows={4}
                                maxLength={250}
                                placeholder="Description pour le référencement..."
                                className="admin-input w-full bg-mp-ui-black/60 text-xs"
                            />
                            <div className="mt-1 text-right font-mono text-[10px] text-mp-text-muted">
                                {seoDesc.length} / 250 caractères
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer buttons */}
                <footer className="flex items-center justify-end gap-3 border-t border-mp-glass-border bg-mp-glass-solid/40 px-5 py-4">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={saving}
                        className="rounded-md border border-mp-glass-border px-4 py-2 text-xs font-semibold text-mp-text-secondary transition-colors hover:text-mp-text-primary disabled:opacity-50"
                    >
                        Annuler
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-1.5 rounded-md border border-mp-accent bg-mp-accent px-5 py-2 text-xs font-semibold text-mp-ui-black shadow-md shadow-mp-accent/15 transition-colors hover:opacity-90 disabled:opacity-50"
                    >
                        {saving ? (
                            <>
                                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                Enregistrement…
                            </>
                        ) : (
                            'Enregistrer les modifications'
                        )}
                    </button>
                </footer>
            </div>
        </div>
    );
}

function TabButton({
    active,
    onClick,
    icon: Icon,
    label,
}: {
    active: boolean;
    onClick: () => void;
    icon: React.ComponentType<any>;
    label: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`flex cursor-pointer items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold transition-all ${
                active
                    ? 'border-mp-accent bg-mp-accent/5 text-mp-accent'
                    : 'border-transparent text-mp-text-muted hover:border-mp-glass-hover-border hover:text-mp-text-secondary'
            }`}
        >
            <Icon className="h-4 w-4 shrink-0" />
            <span>{label}</span>
        </button>
    );
}
