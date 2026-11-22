import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, Component, type ReactNode } from 'react';
import { useCollapsible } from '@/lib/useCollapsible';
import { useIsHydrated } from '@/lib/useIsHydrated';
import { ExternalLink, Camera, ChevronDown } from 'lucide-react';
import type { ResolvedObject, SkyImage } from '@/lib/objects/types';
import { getConstellationName } from '@/lib/constellations';
import { FRENCH_NAMES } from '@/data/common_names_fr';
import { constellationFromCoords } from '@/lib/constellation-from-coords';
import ObjectFilterBar from '@/components/Filters/ObjectFilterBar';

const AladinViewer = lazy(() => import('./AladinViewer'));
const StaticSkyMap = lazy(() => import('@/components/SkyMap/StaticSkyMap'));
import { UserSettingsModal } from '@/components/Settings/UserSettingsBar';
import ObservationPanel from './ObservationPanel';
import DailyVisibilityPanel from './DailyVisibilityPanel';
import AnnualVisibilityPanel from './AnnualVisibilityPanel';
import AstronomicalLoader from './AstronomicalLoader';
import { useUserSettings } from '@/lib/settings/useUserSettings';
import { formatRaLong as formatRa, formatDecLong as formatDec } from '@/lib/format';

interface Props {
    initialQuery?: string;
    /** Pre-resolved data from the Astro page when `?q=` was set at request
     *  time. Lets first paint show the result without a client fetch. */
    initialData?: ResolvedObject | null;
}

interface ErrorBoundaryProps {
    children: ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

class ResultErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('Erreur lors du rendu du composant ResultPanel:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="space-y-3 rounded-lg border border-mp-astro-red/40 bg-mp-astro-red/10 p-6 text-center">
                    <p className="text-sm font-medium text-mp-text-heading">
                        Une erreur de rendu est survenue pour cet objet.
                    </p>
                    <p className="font-mono text-xs text-mp-text-muted">{this.state.error?.message}</p>
                </div>
            );
        }

        return this.props.children;
    }
}

export default function ObjectExplorer({ initialQuery = '', initialData = null }: Props) {
    const [query, setQuery] = useState(initialQuery);
    const [submitted, setSubmitted] = useState(initialQuery);
    const [data, setData] = useState<ResolvedObject | null>(initialData);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const abortRef = useRef<AbortController | null>(null);
    const { location, camera, isLocationCustom, isCameraCustom, setLocation, setCamera, resetLocation, resetCamera } =
        useUserSettings();
    const [obsDate, setObsDate] = useState<Date>(() => new Date());

    const runSearch = useCallback(async (q: string) => {
        const term = q.trim();
        if (!term) return;
        setSubmitted(term);
        setLoading(true);
        setError(null);
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            const res = await fetch(`/api/object/resolve?q=${encodeURIComponent(term)}`, {
                signal: controller.signal,
            });
            const payload: { error?: string } | ResolvedObject = await res.json();
            if (!res.ok) {
                setData(null);
                const message =
                    typeof payload === 'object' && payload && 'error' in payload && payload.error
                        ? payload.error
                        : `Erreur ${res.status}`;
                setError(message);
            } else {
                setData(payload as ResolvedObject);
            }
        } catch (e) {
            if ((e as Error).name === 'AbortError') return;
            setError((e as Error).message);
            setData(null);
        } finally {
            setLoading(false);
        }
    }, []);

    // Initial seed from ?q=…
    useEffect(() => {
        const fromUrl =
            typeof window !== 'undefined' ? new URL(window.location.href).searchParams.get('q')?.trim() : '';
        const seed = (fromUrl || initialQuery).trim();
        if (!seed) return;
        setQuery(seed);
        setSubmitted(seed);
        if (initialData && initialData.query.trim().toLowerCase() === seed.toLowerCase()) {
            return;
        }
        runSearch(seed);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Sync URL with last submitted query
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const url = new URL(window.location.href);
        if (submitted) url.searchParams.set('q', submitted);
        else url.searchParams.delete('q');
        window.history.replaceState({}, '', url.toString());
    }, [submitted]);

    const suggestions = useMemo(() => {
        const list: { value: string; label?: string }[] = [];
        Object.entries(FRENCH_NAMES).forEach(([key, val]) => {
            list.push({ value: val, label: key });
            list.push({ value: key, label: val });
        });
        return list;
    }, []);

    return (
        <div className="space-y-8">
            <ObjectFilterBar
                query={query}
                onQueryChange={(val) => {
                    setQuery(val);
                    runSearch(val);
                }}
                suggestions={suggestions}
                searchPlaceholder="Rechercher un objet du ciel (ex: M31, NGC 7000, Sh2-155, IC 1396, Barnard 33…)"
                isLoading={loading}
                onOpenSettings={() => setIsSettingsOpen(true)}
                isSettingsCustom={isLocationCustom || isCameraCustom}
            />

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
                date={obsDate}
                onDateChange={setObsDate}
            />

            {error && (
                <div className="rounded-lg border border-mp-astro-red/40 bg-mp-astro-red/10 p-4 text-sm text-mp-text-body">
                    {error}
                </div>
            )}

            {loading ? (
                <AstronomicalLoader
                    title="Recherche cosmique en cours"
                    message="Résolution de l'objet via SIMBAD, calcul des coordonnées J2000, éphémérides et imagerie DSS2..."
                    query={submitted || query}
                />
            ) : data && data.coords ? (
                <ResultErrorBoundary key={data.canonicalName || data.query}>
                    <ResultPanel data={data} location={location} camera={camera} date={obsDate} />
                </ResultErrorBoundary>
            ) : !loading && submitted && !error ? (
                <div className="py-12 text-center text-mp-text-muted">Aucun résultat trouvé pour "{submitted}".</div>
            ) : null}
        </div>
    );
}

function ResultPanel({
    data,
    location,
    camera,
    date,
}: {
    data: ResolvedObject;
    location: ReturnType<typeof useUserSettings>['location'];
    camera: ReturnType<typeof useUserSettings>['camera'];
    date: Date;
}) {
    const [activeImageId, setActiveImageId] = useState<string>(data.images[0]?.id ?? '');
    const activeImage = useMemo(
        () => data.images.find((i) => i.id === activeImageId) ?? data.images[0],
        [data.images, activeImageId],
    );

    // Reset active image when target changes
    useEffect(() => {
        setActiveImageId(data.images[0]?.id ?? '');
    }, [data.canonicalName, data.images]);

    return (
        <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
            <div className="space-y-8 min-w-0">
                <Header data={data} />
                {activeImage && <ImagePanel images={data.images} active={activeImage} onSelect={setActiveImageId} />}
                <ObservationPanel ra={data.coords.ra} dec={data.coords.dec} location={location} date={date} />
                <DailyVisibilityPanel
                    ra={data.coords.ra}
                    dec={data.coords.dec}
                    location={location}
                    date={date}
                    targetName={data.canonicalName}
                    magV={data.simbad?.fluxes?.V}
                />
                <AnnualVisibilityPanel
                    ra={data.coords.ra}
                    dec={data.coords.dec}
                    location={location}
                    date={date}
                    magV={data.simbad?.fluxes?.V}
                    diamArcmin={data.simbad?.dimMajArcmin}
                />
                <SkyChartPanel data={data} />
                <AladinPanel data={data} camera={camera} />
            </div>
            <aside className="space-y-6">
                {data.ownPhotos && data.ownPhotos.length > 0 && <OwnPhotosCard photos={data.ownPhotos} />}
                {data.wikipedia && <WikipediaPanel summary={data.wikipedia} />}
                <FactSheet data={data} />
                {data.ned && <NedCard ned={data.ned} />}
                {data.catalogEntries?.map((entry) => (
                    <CatalogCard key={entry.catalogId} entry={entry} />
                ))}
                <AliasList aliases={data.aliases} />
            </aside>
        </div>
    );
}

/** Collapse multiple spaces so "NGC  40" matches our "NGC 40" key. */
function normId(s: string) {
    return s.replace(/\s+/g, ' ').trim();
}

function lookupFrenchName(data: ResolvedObject): string | undefined {
    const candidates = [data.canonicalName, ...(data.simbad?.aliases ?? [])];
    for (const c of candidates) {
        const name = FRENCH_NAMES[normId(c)];
        if (name) return name;
    }
    return undefined;
}

/** IAU 3-letter abbreviation: prefer VizieR catalogue field, fallback to RA/Dec lookup. */
function lookupConstellation(data: ResolvedObject): string | undefined {
    for (const entry of data.catalogEntries ?? []) {
        const field = entry.fields.find((f) => f.label === 'Constellation');
        if (field?.value) return field.value.trim();
    }
    return constellationFromCoords(data.coords.ra, data.coords.dec);
}

/**
 * Recherche la magnitude apparente de l'objet à partir des flux SIMBAD ou des catalogues VizieR.
 *
 * @param data - L'objet résolu contenant les données photométriques et de catalogues
 * @returns Un objet avec la valeur numérique de la magnitude et le filtre/bande associé, ou null.
 */
function lookupMagnitude(data: ResolvedObject): { value: number; band?: string } | null {
    // POURQUOI: Utilise en priorité les flux photométriques SIMBAD normalisés (ex: bande V).
    const fluxes = data.simbad?.fluxes;
    if (fluxes) {
        const preferredBands = ['V', 'G', 'B', 'VT', 'R', 'I'];
        for (const band of preferredBands) {
            if (typeof fluxes[band] === 'number') {
                return { value: fluxes[band], band };
            }
        }
        for (const [band, val] of Object.entries(fluxes)) {
            if (typeof val === 'number') {
                return { value: val, band };
            }
        }
    }

    // POURQUOI: En second recours, recherche une magnitude textuelle dans les entrées de catalogue VizieR (ex: NGC 2000 "Magnitude intégrée").
    if (data.catalogEntries) {
        for (const entry of data.catalogEntries) {
            for (const field of entry.fields) {
                if (field.label.toLowerCase().includes('magnitude')) {
                    const parsed = parseFloat(field.value.replace(',', '.'));
                    if (!isNaN(parsed)) {
                        let band: string | undefined;
                        if (field.label.toLowerCase().includes(' v')) band = 'V';
                        else if (field.label.toLowerCase().includes(' b')) band = 'B';
                        return { value: parsed, band };
                    }
                }
            }
        }
    }

    return null;
}

function Header({ data }: { data: ResolvedObject }) {
    const frenchName = lookupFrenchName(data);
    const constAbbr = lookupConstellation(data);
    const magData = lookupMagnitude(data);

    return (
        <header className="space-y-2">
            <p className="text-xs tracking-uppercase text-mp-accent uppercase">
                {data.simbad?.otypeText ?? 'Objet du ciel'}
            </p>
            <h1 className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-3xl font-light text-mp-text-heading md:text-4xl">
                {data.canonicalName}
                {frenchName && <span className="text-xl font-light text-mp-text-muted md:text-2xl">{frenchName}</span>}
            </h1>
            <p className="font-mono text-sm text-mp-text-muted">
                RA {formatRa(data.coords.ra)} · Dec {formatDec(data.coords.dec)}
                {constAbbr && (
                    <span className="font-sans text-mp-text-secondary">
                        {' · '}
                        {getConstellationName(constAbbr)}
                    </span>
                )}
                {magData && (
                    <span className="font-sans text-mp-text-secondary">
                        {' · '}Mag {magData.value.toFixed(1)}
                        {magData.band ? ` ${magData.band}` : ''}
                    </span>
                )}
            </p>
        </header>
    );
}

function ImagePanel({
    images,
    active,
    onSelect,
}: {
    images: SkyImage[];
    active: SkyImage;
    onSelect: (id: string) => void;
}) {
    const [expanded, setExpanded] = useCollapsible('obj-surveys');
    // POURQUOI : hips2fits n'a pas de miroir. Pendant une panne, une image cassée laisserait un cadre noir muet.
    const [failedUrls, setFailedUrls] = useState<Set<string>>(() => new Set());
    const markFailed = (url: string) => setFailedUrls((current) => new Set(current).add(url));
    return (
        <section className="space-y-3 rounded-lg border border-mp-glass-border bg-mp-glass-solid p-4">
            <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="flex w-full items-center justify-between gap-2 text-left"
            >
                <h2 className="text-sm tracking-uppercase text-mp-text-secondary uppercase">Sky Surveys</h2>
                <ChevronDown
                    className={`h-4 w-4 shrink-0 text-mp-text-muted transition-transform ${expanded ? 'rotate-180' : ''}`}
                />
            </button>
            {expanded && (
                <>
                    <div className="aspect-square w-full overflow-hidden rounded-lg border border-mp-glass-border bg-black md:aspect-video">
                        {failedUrls.has(active.url) ? (
                            <p className="flex h-full items-center justify-center p-4 text-center text-sm text-mp-text-muted">
                                Image du ciel indisponible : le service d’images ne répond pas.
                            </p>
                        ) : (
                            <img
                                key={active.url}
                                src={active.url}
                                alt={`Vignette ${active.label}`}
                                className="h-full w-full object-cover"
                                loading="eager"
                                fetchPriority="high"
                                decoding="async"
                                onError={() => markFailed(active.url)}
                            />
                        )}
                    </div>
                    <p className="text-xs text-mp-text-muted">{active.description}</p>
                    <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
                        {images.map((img) => {
                            const isActive = img.id === active.id;
                            return (
                                <button
                                    key={img.id}
                                    type="button"
                                    onClick={() => onSelect(img.id)}
                                    className={`group relative aspect-square overflow-hidden rounded-md border transition-all ${
                                        isActive
                                            ? 'border-mp-accent ring-2 ring-mp-accent/40'
                                            : 'border-mp-glass-border hover:border-mp-accent/50'
                                    }`}
                                    aria-label={img.label}
                                    aria-pressed={isActive}
                                >
                                    <img
                                        src={img.thumbUrl}
                                        alt=""
                                        width={220}
                                        height={220}
                                        className={`h-full w-full object-cover ${failedUrls.has(img.thumbUrl) ? 'invisible' : ''}`}
                                        loading="lazy"
                                        decoding="async"
                                        onError={() => markFailed(img.thumbUrl)}
                                    />
                                    <span className="absolute inset-x-0 bottom-0 truncate bg-black/70 px-1 py-0.5 text-center text-[9px] tracking-wide text-mp-text-primary uppercase">
                                        {img.label}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </>
            )}
        </section>
    );
}

function AladinPanel({ data, camera }: { data: ResolvedObject; camera: ReturnType<typeof useUserSettings>['camera'] }) {
    const [expanded, setExpanded] = useCollapsible('obj-aladin');
    // POURQUOI : `AladinViewer` (lazy) n'est rendu qu'après l'hydratation, voir `useIsHydrated`.
    const isHydrated = useIsHydrated();
    const loadingPlaceholder = (
        <div className="flex aspect-video w-full items-center justify-center rounded-lg border border-mp-glass-border bg-mp-glass-solid text-sm text-mp-text-muted">
            Chargement d'Aladin Lite…
        </div>
    );
    return (
        <section className="space-y-3 rounded-lg border border-mp-glass-border bg-mp-glass-solid p-4">
            <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="flex w-full items-center justify-between gap-2 text-left"
            >
                <h2 className="text-sm tracking-uppercase text-mp-text-secondary uppercase">Vue interactive</h2>
                <ChevronDown
                    className={`h-4 w-4 shrink-0 text-mp-text-muted transition-transform ${expanded ? 'rotate-180' : ''}`}
                />
            </button>
            {expanded &&
                (isHydrated ? (
                    <Suspense fallback={loadingPlaceholder}>
                        <AladinViewer
                            ra={data.coords.ra}
                            dec={data.coords.dec}
                            fovDeg={data.defaultFovDeg}
                            targetName={data.canonicalName}
                            camera={camera}
                        />
                    </Suspense>
                ) : (
                    loadingPlaceholder
                ))}
        </section>
    );
}

function SkyChartPanel({ data }: { data: ResolvedObject }) {
    const [expanded, setExpanded] = useCollapsible('obj-skychart');
    const radius = Math.max(2, data.defaultFovDeg);
    const fieldSize = `${data.defaultFovDeg.toFixed(2)}° × ${data.defaultFovDeg.toFixed(2)}°`;
    // POURQUOI : `StaticSkyMap` (lazy) n'est rendu qu'après l'hydratation, voir `useIsHydrated`.
    const isHydrated = useIsHydrated();
    const loadingPlaceholder = (
        <div className="flex aspect-2/1 w-full items-center justify-center bg-mp-glass-solid text-sm text-mp-text-muted">
            Chargement de la carte du ciel…
        </div>
    );
    return (
        <section className="space-y-3 rounded-lg border border-mp-glass-border bg-mp-glass-solid p-4">
            <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="flex w-full items-center justify-between gap-2 text-left"
            >
                <h2 className="text-sm tracking-uppercase text-mp-text-secondary uppercase">
                    Localisation dans le ciel
                </h2>
                <ChevronDown
                    className={`h-4 w-4 shrink-0 text-mp-text-muted transition-transform ${expanded ? 'rotate-180' : ''}`}
                />
            </button>
            {expanded && (
                <div className="overflow-hidden rounded-lg border border-mp-glass-border">
                    {isHydrated ? (
                        <Suspense fallback={loadingPlaceholder}>
                            <StaticSkyMap
                                key={`${data.coords.ra}-${data.coords.dec}`}
                                raVal={data.coords.ra}
                                decVal={data.coords.dec}
                                radius={radius}
                                fieldSize={fieldSize}
                                title={data.canonicalName}
                            />
                        </Suspense>
                    ) : (
                        loadingPlaceholder
                    )}
                </div>
            )}
        </section>
    );
}

function CollapsibleSection({
    title,
    storageKey,
    defaultExpanded = false,
    className,
    children,
}: {
    title: ReactNode;
    storageKey: string;
    defaultExpanded?: boolean;
    className?: string;
    children: ReactNode;
}) {
    const [expanded, setExpanded] = useCollapsible(storageKey, defaultExpanded);
    return (
        <section
            className={`space-y-3 rounded-lg border border-mp-glass-border bg-mp-glass-solid p-5 ${className ?? ''}`}
        >
            <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="flex w-full items-center justify-between gap-2 text-left"
            >
                <h2 className="text-sm tracking-uppercase text-mp-text-secondary uppercase">{title}</h2>
                <ChevronDown
                    className={`h-4 w-4 shrink-0 text-mp-text-muted transition-transform ${expanded ? 'rotate-180' : ''}`}
                />
            </button>
            {expanded && <div className="space-y-3">{children}</div>}
        </section>
    );
}

function WikipediaPanel({ summary }: { summary: ResolvedObject['wikipedia'] }) {
    if (!summary) return null;
    return (
        <CollapsibleSection
            title={`Wikipédia (${summary.lang.toUpperCase()})`}
            storageKey="obj-wikipedia"
            defaultExpanded
        >
            <p className="text-sm leading-relaxed text-mp-text-body">{summary.extract}</p>
            <a
                href={summary.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-mp-accent transition-colors hover:text-mp-text-link-hover"
            >
                Lire sur Wikipédia <ExternalLink className="h-3 w-3" />
            </a>
        </CollapsibleSection>
    );
}

function FactSheet({ data }: { data: ResolvedObject }) {
    const s = data.simbad;
    const facts: { label: string; value: string }[] = [];

    if (s?.otypeText) facts.push({ label: 'Type', value: s.otypeText });
    if (s?.morphType) facts.push({ label: 'Morphologie', value: s.morphType });
    if (s?.spType) facts.push({ label: 'Type spectral', value: s.spType });

    const v = s?.fluxes?.V;
    const b = s?.fluxes?.B;
    if (typeof v === 'number') facts.push({ label: 'Magnitude V', value: v.toFixed(2) });
    if (typeof b === 'number') facts.push({ label: 'Magnitude B', value: b.toFixed(2) });

    if (s?.dimMajArcmin) {
        const dim =
            s.dimMinArcmin && s.dimMinArcmin !== s.dimMajArcmin
                ? `${s.dimMajArcmin.toFixed(1)}′ × ${s.dimMinArcmin.toFixed(1)}′`
                : `${s.dimMajArcmin.toFixed(1)}′`;
        facts.push({ label: 'Taille apparente', value: dim });
    }

    if (typeof s?.plxMas === 'number' && s.plxMas > 0) {
        const distancePc = 1000 / s.plxMas;
        const distanceLy = distancePc * 3.2616;
        facts.push({ label: 'Distance', value: `${distanceLy.toFixed(0)} al (${distancePc.toFixed(1)} pc)` });
    }
    const z = typeof s?.redshift === 'number' ? s.redshift : data.ned?.redshift;
    if (typeof z === 'number') facts.push({ label: 'Redshift z', value: z.toFixed(5) });
    if (typeof s?.radvelKms === 'number')
        facts.push({ label: 'Vitesse radiale', value: `${s.radvelKms.toFixed(0)} km/s` });

    facts.push({ label: 'Champ par défaut', value: `${(data.defaultFovDeg * 60).toFixed(1)}′` });

    return (
        <CollapsibleSection title="Fiche" storageKey="obj-fiche" defaultExpanded>
            <dl className="space-y-2 text-sm">
                {facts.map((f) => (
                    <div key={f.label} className="flex justify-between gap-3">
                        <dt className="text-mp-text-muted">{f.label}</dt>
                        <dd className="text-right font-mono text-mp-text-primary">{f.value}</dd>
                    </div>
                ))}
            </dl>
        </CollapsibleSection>
    );
}

function AliasList({ aliases }: { aliases: string[] }) {
    const [showAll, setShowAll] = useState(false);
    if (!aliases.length) return null;
    const visible = showAll ? aliases : aliases.slice(0, 12);
    return (
        <CollapsibleSection title={`Identifiants (${aliases.length})`} storageKey="obj-identifiants" defaultExpanded>
            <ul className="space-y-1 font-mono text-xs text-mp-text-body">
                {visible.map((a) => (
                    <li key={a} className="truncate" title={a}>
                        {a}
                    </li>
                ))}
            </ul>
            {aliases.length > 12 && (
                <button
                    type="button"
                    onClick={() => setShowAll((v) => !v)}
                    className="text-xs text-mp-accent hover:text-mp-text-link-hover"
                >
                    {showAll ? 'Réduire' : `Voir tous (${aliases.length - 12} de plus)`}
                </button>
            )}
        </CollapsibleSection>
    );
}

function NedCard({ ned }: { ned: NonNullable<ResolvedObject['ned']> }) {
    const facts: { label: string; value: string }[] = [];
    facts.push({ label: 'Nom préféré', value: ned.preferredName });
    if (ned.objType) facts.push({ label: 'Type NED', value: ned.objType });
    if (typeof ned.redshift === 'number') {
        const unc = typeof ned.redshiftUncertainty === 'number' ? ` ± ${ned.redshiftUncertainty.toExponential(1)}` : '';
        facts.push({ label: 'Redshift z', value: `${ned.redshift.toFixed(5)}${unc}` });
    }
    if (ned.redshiftRef) facts.push({ label: 'Réf. redshift', value: ned.redshiftRef });
    return (
        <CollapsibleSection title="NED (extragalactique)" storageKey="obj-ned" defaultExpanded>
            <dl className="space-y-2 text-sm">
                {facts.map((f) => (
                    <div key={f.label} className="flex justify-between gap-3">
                        <dt className="text-mp-text-muted">{f.label}</dt>
                        <dd className="text-right font-mono break-all text-mp-text-primary">{f.value}</dd>
                    </div>
                ))}
            </dl>
        </CollapsibleSection>
    );
}

function CatalogCard({ entry }: { entry: NonNullable<ResolvedObject['catalogEntries']>[number] }) {
    return (
        <CollapsibleSection title={entry.catalogId} storageKey={`obj-catalog-${entry.catalogId}`} defaultExpanded>
            <p className="text-xs text-mp-text-muted">{entry.catalog}</p>
            <dl className="space-y-2 text-sm">
                {entry.fields.map((f) => (
                    <div key={f.label} className="flex justify-between gap-3">
                        <dt className="text-mp-text-muted">{f.label}</dt>
                        <dd className="text-right text-mp-text-primary">{f.value}</dd>
                    </div>
                ))}
            </dl>
            {entry.sourceUrl && (
                <a
                    href={entry.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-mp-accent transition-colors hover:text-mp-text-link-hover"
                >
                    Source VizieR <ExternalLink className="h-3 w-3" />
                </a>
            )}
        </CollapsibleSection>
    );
}

function OwnPhotosCard({ photos }: { photos: NonNullable<ResolvedObject['ownPhotos']> }) {
    const [expanded, setExpanded] = useCollapsible('obj-own-photos');
    return (
        <section className="space-y-3 rounded-lg border border-mp-accent bg-mp-accent-light p-4">
            <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="flex w-full items-center gap-2 text-left"
            >
                <Camera className="h-4 w-4 shrink-0 text-mp-accent" />
                <span className="text-xs tracking-uppercase text-mp-accent uppercase">Mes astrophotographies</span>
                <span className="ml-auto text-xs tracking-normal text-mp-text-muted normal-case">{photos.length}</span>
                <ChevronDown
                    className={`h-4 w-4 shrink-0 text-mp-text-muted transition-transform ${expanded ? 'rotate-180' : ''}`}
                />
            </button>
            {expanded && (
                <ul className="space-y-3">
                    {photos.map((p) => (
                        <li key={p.slug}>
                            <a
                                href={p.href}
                                className="group -m-1 flex items-start gap-3 rounded-md p-1 no-underline transition-colors hover:bg-mp-accent/10"
                            >
                                {p.thumbnailUrl ? (
                                    <img
                                        src={p.thumbnailUrl}
                                        alt={p.title}
                                        loading="lazy"
                                        className="h-20 w-20 shrink-0 rounded-md border border-mp-glass-border object-cover"
                                    />
                                ) : (
                                    <div className="h-20 w-20 shrink-0 rounded-md border border-mp-glass-border bg-mp-bg-secondary" />
                                )}
                                <div className="space-y-1 min-w-0 flex-1">
                                    <p className="line-clamp-2 text-sm text-mp-text-primary transition-colors group-hover:text-mp-accent">
                                        {p.title}
                                    </p>
                                    <p className="text-xs text-mp-text-muted">{p.year} · ouvrir →</p>
                                </div>
                            </a>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
