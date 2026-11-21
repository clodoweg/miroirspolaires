/**
 * @file src/components/Admin/Dashboard.tsx
 * @description Tableau de bord centralisé "Vue d'ensemble" pour l'administration.
 * Responsabilité : Afficher en un seul écran tous les indicateurs clés du site —
 * inventaire de contenu, santé SEO, performance Lighthouse, stockage R2,
 * activité récente et actions rapides.
 */

import { useEffect, useState } from 'react';

// ---------------------------------------------------------------------------
// Types — miroir de l'API /api/admin/stats
// ---------------------------------------------------------------------------

interface SeoSummary {
    score: number;
    totalAuditedItems: number;
    missingDescriptionsCount: number;
    missingAltsCount: number;
    totalPhotos: number;
    technicalChecks: { ok: number; warning: number; error: number };
}

interface LighthouseSummary {
    averagePerformance: number;
    averageAccessibility: number;
    averageBestPractices: number;
    averageSeo: number;
    averageLcp: number;
    averageCls: number;
    averageTbt: number;
    pagesAudited: number;
    timestamp: string;
    durationSeconds: number;
}

interface CategoryStats {
    files: number;
    size: number;
}

interface R2Summary {
    local: { totalFiles: number; totalSize: number; categories: Record<string, CategoryStats> };
    r2: { totalFiles: number; totalSize: number; categories: Record<string, CategoryStats> };
}

interface RecentItem {
    kind: 'blog' | 'voyage';
    year: string;
    slug: string;
    title: string;
    href: string;
    editHref: string;
    date?: string;
    image?: string;
    mtimeMs: number;
}

interface Stats {
    counts: {
        blog: number;
        voyages: number;
        astrophotos: { total: number; withRaw: number; withMini: number };
    };
    recent: RecentItem[];
    seo: SeoSummary | null;
    lighthouse: LighthouseSummary | null;
    r2: R2Summary | null;
    lastUpdatedAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Frontmatter image paths point at source assets — rewrite to admin API streams.
 */
function resolveThumb(item: RecentItem): string | undefined {
    if (!item.image) return undefined;
    if (item.kind === 'blog') {
        return item.image.replace(/^\/assets\/blog\//, '/api/admin/images/');
    }
    return item.image.replace(/^(?:\.\.\/)+assets\/voyages\//, '/api/admin/voyages-images/');
}

function formatRelative(ms: number): string {
    if (!ms) return 'date inconnue';
    const diff = Date.now() - ms;
    const s = Math.floor(diff / 1000);
    if (s < 60) return 'il y a quelques secondes';
    const m = Math.floor(s / 60);
    if (m < 60) return `il y a ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `il y a ${h} h`;
    const d = Math.floor(h / 24);
    if (d < 30) return `il y a ${d} j`;
    return new Date(ms).toLocaleDateString('fr-FR', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function scoreColor(score: number): string {
    if (score >= 90) return 'text-emerald-400';
    if (score >= 50) return 'text-amber-400';
    return 'text-red-400';
}

function scoreBg(score: number): string {
    if (score >= 90) return 'bg-emerald-400';
    if (score >= 50) return 'bg-amber-400';
    return 'bg-red-400';
}

function scoreRingColor(score: number): string {
    if (score >= 90) return 'stroke-emerald-400';
    if (score >= 50) return 'stroke-amber-400';
    return 'stroke-red-400';
}

// ---------------------------------------------------------------------------
// Quick Actions
// ---------------------------------------------------------------------------

const QUICK_ACTIONS = [
    {
        href: '/admin/blog?new=true',
        title: 'Nouvel article',
        description: 'Démarrer un brouillon Markdown',
        icon: 'plus',
        accent: true,
    },
    {
        href: '/admin/voyages?new=true',
        title: 'Nouveau voyage',
        description: 'Album photo + récit',
        icon: 'plus',
        accent: false,
    },
    {
        href: '/admin/astrophotos',
        title: 'Pipeline photo',
        description: 'Déposer un raw + traitement',
        icon: 'upload',
        accent: false,
    },
    {
        href: '/admin/database',
        title: 'Base de données',
        description: 'Catalogues exoplanètes & étoiles',
        icon: 'database',
        accent: false,
    },
    {
        href: '/admin/lighthouse',
        title: 'Audit Lighthouse',
        description: 'Performance & Core Web Vitals',
        icon: 'lighthouse',
        accent: false,
    },
    {
        href: '/admin/scripts',
        title: 'Lancer un script',
        description: 'SEO, checks, sync R2…',
        icon: 'play',
        accent: false,
    },
] as const;

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function Dashboard() {
    const [stats, setStats] = useState<Stats | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        fetch('/api/admin/stats')
            .then(async (r) => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                return r.json() as Promise<Stats>;
            })
            .then((data) => {
                if (!cancelled) setStats(data);
            })
            .catch((e) => {
                if (!cancelled) setError(String((e as Error).message ?? e));
            });
        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <div className="flex flex-col gap-8">
            {error && (
                <div className="rounded-lg border border-mp-astro-red/40 bg-mp-astro-red/10 p-4 text-sm text-mp-astro-red">
                    Erreur de chargement des stats : {error}
                </div>
            )}

            {/* ── Section 1: Inventaire du contenu ── */}
            <ContentInventorySection stats={stats} />

            {/* ── Section 2 + 3: SEO & Lighthouse côte à côte ── */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <SeoHealthSection seo={stats?.seo ?? null} loading={!stats && !error} />
                <LighthouseSection lighthouse={stats?.lighthouse ?? null} loading={!stats && !error} />
            </div>

            {/* ── Section 4: Stockage R2 ── */}
            <R2StorageSection r2={stats?.r2 ?? null} loading={!stats && !error} />

            {/* ── Section 5 + 6: Activité récente + Actions rapides ── */}
            <section className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <div>
                    <SectionTitle>Activité récente</SectionTitle>
                    <RecentActivity stats={stats} />
                </div>
                <div>
                    <SectionTitle>Actions rapides</SectionTitle>
                    <ul className="space-y-2">
                        {QUICK_ACTIONS.map((a) => (
                            <li key={a.href}>
                                <a
                                    href={a.href}
                                    className={`group flex items-center gap-3 rounded-md border border-mp-glass-border bg-mp-glass-solid px-3 py-3 transition-all hover:border-mp-accent/40 hover:bg-mp-accent/5 ${a.accent ? 'ring-1 ring-mp-accent/30' : ''}`}
                                >
                                    <span
                                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${a.accent ? 'bg-mp-accent/20 text-mp-accent' : 'bg-mp-ui-black/40 text-mp-text-secondary'} transition-colors group-hover:text-mp-accent`}
                                    >
                                        <QuickIcon icon={a.icon} />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <div className="text-sm font-medium text-mp-text-primary">{a.title}</div>
                                        <div className="text-xs text-mp-text-secondary">{a.description}</div>
                                    </span>
                                    <span
                                        aria-hidden
                                        className="text-mp-text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-mp-accent"
                                    >
                                        →
                                    </span>
                                </a>
                            </li>
                        ))}
                    </ul>
                </div>
            </section>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Section 1: Inventaire du contenu
// ---------------------------------------------------------------------------

function ContentInventorySection({ stats }: { stats: Stats | null }) {
    return (
        <section aria-label="Inventaire du site">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <StatCard label="Articles" value={stats?.counts.blog} href="/admin/blog" icon={<BlogIcon />} accent />
                <StatCard label="Voyages" value={stats?.counts.voyages} href="/admin/voyages" icon={<MapIcon />} />
                <StatCard
                    label="Astrophotos"
                    value={stats?.counts.astrophotos.total}
                    href="/admin/astrophotos"
                    icon={<StarIcon />}
                />
                <StatCard
                    label="Raw téléchargés"
                    value={stats?.counts.astrophotos.withRaw}
                    href="/admin/astrophotos"
                    icon={<DownloadIcon />}
                    sub={
                        stats
                            ? `${Math.round((stats.counts.astrophotos.withRaw / Math.max(stats.counts.astrophotos.total, 1)) * 100)}%`
                            : undefined
                    }
                />
                <StatCard
                    label="Mini générés"
                    value={stats?.counts.astrophotos.withMini}
                    href="/admin/astrophotos"
                    icon={<ImageIcon />}
                    sub={
                        stats
                            ? `${Math.round((stats.counts.astrophotos.withMini / Math.max(stats.counts.astrophotos.total, 1)) * 100)}%`
                            : undefined
                    }
                />
                <StatCard
                    label="Score SEO"
                    value={stats?.seo ? `${stats.seo.score}%` : undefined}
                    href="/admin/seo"
                    icon={<SeoIcon />}
                    valueColor={stats?.seo ? scoreColor(stats.seo.score) : undefined}
                />
            </div>
        </section>
    );
}

// ---------------------------------------------------------------------------
// Section 2: Santé SEO
// ---------------------------------------------------------------------------

function SeoHealthSection({ seo, loading }: { seo: SeoSummary | null; loading: boolean }) {
    if (loading) return <SectionSkeleton title="Santé SEO" />;

    if (!seo) {
        return (
            <SectionPanel title="Santé SEO" href="/admin/seo">
                <div className="flex items-center gap-2 text-sm text-mp-text-muted">
                    <InfoIcon /> Données SEO non disponibles
                </div>
            </SectionPanel>
        );
    }

    const descCoveredPct =
        seo.totalAuditedItems > 0
            ? Math.round(((seo.totalAuditedItems - seo.missingDescriptionsCount) / seo.totalAuditedItems) * 100)
            : 100;
    const altCoveredPct =
        seo.totalPhotos > 0 ? Math.round(((seo.totalPhotos - seo.missingAltsCount) / seo.totalPhotos) * 100) : 100;
    const totalTechChecks = seo.technicalChecks.ok + seo.technicalChecks.warning + seo.technicalChecks.error;

    return (
        <SectionPanel title="Santé SEO" href="/admin/seo">
            <div className="flex items-start gap-5">
                {/* Radial score gauge */}
                <ScoreGauge score={seo.score} size={88} label="SEO" />

                <div className="space-y-3 flex-1">
                    {/* Descriptions coverage bar */}
                    <ProgressRow
                        label="Descriptions"
                        current={seo.totalAuditedItems - seo.missingDescriptionsCount}
                        total={seo.totalAuditedItems}
                        pct={descCoveredPct}
                    />
                    {/* Alt text coverage bar */}
                    <ProgressRow
                        label="Textes alt"
                        current={seo.totalPhotos - seo.missingAltsCount}
                        total={seo.totalPhotos}
                        pct={altCoveredPct}
                    />
                    {/* Technical checks pills */}
                    <div className="flex items-center gap-2 pt-1">
                        <span className="font-mono text-[10px] tracking-wider text-mp-text-muted uppercase">
                            Checks techniques
                        </span>
                        <div className="flex gap-1.5">
                            {seo.technicalChecks.ok > 0 && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] text-emerald-400">
                                    ✓ {seo.technicalChecks.ok}/{totalTechChecks}
                                </span>
                            )}
                            {seo.technicalChecks.warning > 0 && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 font-mono text-[10px] text-amber-400">
                                    ⚠ {seo.technicalChecks.warning}
                                </span>
                            )}
                            {seo.technicalChecks.error > 0 && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 font-mono text-[10px] text-red-400">
                                    ✗ {seo.technicalChecks.error}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </SectionPanel>
    );
}

// ---------------------------------------------------------------------------
// Section 3: Performance Lighthouse
// ---------------------------------------------------------------------------

function LighthouseSection({ lighthouse, loading }: { lighthouse: LighthouseSummary | null; loading: boolean }) {
    if (loading) return <SectionSkeleton title="Performance Lighthouse" />;

    if (!lighthouse) {
        return (
            <SectionPanel title="Performance Lighthouse" href="/admin/lighthouse">
                <div className="flex items-center gap-2 text-sm text-mp-text-muted">
                    <InfoIcon /> Aucun rapport Lighthouse disponible.
                    <a href="/admin/lighthouse" className="text-mp-accent hover:underline">
                        Lancer un audit →
                    </a>
                </div>
            </SectionPanel>
        );
    }

    const auditDate = lighthouse.timestamp
        ? new Date(lighthouse.timestamp).toLocaleDateString('fr-FR', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
          })
        : '—';

    return (
        <SectionPanel title="Performance Lighthouse" href="/admin/lighthouse">
            {/* Four score gauges */}
            <div className="flex items-start justify-around gap-2">
                <ScoreGauge score={lighthouse.averagePerformance} size={68} label="Perf." />
                <ScoreGauge score={lighthouse.averageAccessibility} size={68} label="A11y" />
                <ScoreGauge score={lighthouse.averageBestPractices} size={68} label="Bonnes P." />
                <ScoreGauge score={lighthouse.averageSeo} size={68} label="SEO" />
            </div>

            {/* CWV Metrics */}
            <div className="mt-4 grid grid-cols-3 gap-2">
                <CwvMetric
                    label="LCP"
                    value={`${(lighthouse.averageLcp / 1000).toFixed(1)}s`}
                    good={lighthouse.averageLcp <= 2500}
                />
                <CwvMetric label="CLS" value={String(lighthouse.averageCls)} good={lighthouse.averageCls <= 0.1} />
                <CwvMetric label="TBT" value={`${lighthouse.averageTbt}ms`} good={lighthouse.averageTbt <= 200} />
            </div>

            {/* Metadata */}
            <div className="mt-3 flex items-center justify-between font-mono text-[10px] text-mp-text-muted">
                <span>{lighthouse.pagesAudited} pages auditées</span>
                <span>{auditDate}</span>
            </div>
        </SectionPanel>
    );
}

// ---------------------------------------------------------------------------
// Section 4: Stockage R2
// ---------------------------------------------------------------------------

function R2StorageSection({ r2, loading }: { r2: R2Summary | null; loading: boolean }) {
    if (loading)
        return (
            <section>
                <SectionTitle>Stockage & Synchronisation R2</SectionTitle>
                <div className="h-32 animate-pulse rounded-lg border border-mp-glass-border bg-mp-glass-solid/40" />
            </section>
        );

    if (!r2) {
        return (
            <section>
                <SectionTitle>Stockage & Synchronisation R2</SectionTitle>
                <div className="flex items-center gap-2 rounded-lg border border-mp-glass-border bg-mp-glass-solid p-4 text-sm text-mp-text-muted">
                    <InfoIcon /> Données R2 non disponibles
                </div>
            </section>
        );
    }

    const hasR2 = r2.r2.totalFiles > 0;
    const allCategories = Array.from(new Set([...Object.keys(r2.local.categories), ...Object.keys(r2.r2.categories)]));

    return (
        <section>
            <SectionTitle>Stockage & Synchronisation R2</SectionTitle>
            <div className="rounded-lg border border-mp-glass-border bg-mp-glass-solid p-4">
                {/* Summary row */}
                <div className="mb-4 flex flex-wrap items-center gap-6">
                    <div className="flex items-center gap-2">
                        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-500/15 text-blue-400">
                            <HardDriveIcon />
                        </span>
                        <div>
                            <div className="text-xs text-mp-text-muted">Local</div>
                            <div className="text-sm font-medium text-mp-text-primary">
                                {r2.local.totalFiles.toLocaleString('fr-FR')} fichiers ·{' '}
                                {formatBytes(r2.local.totalSize)}
                            </div>
                        </div>
                    </div>
                    {hasR2 && (
                        <>
                            <span className="text-mp-text-muted">↔</span>
                            <div className="flex items-center gap-2">
                                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-orange-500/15 text-orange-400">
                                    <CloudIcon />
                                </span>
                                <div>
                                    <div className="text-xs text-mp-text-muted">Cloudflare R2</div>
                                    <div className="text-sm font-medium text-mp-text-primary">
                                        {r2.r2.totalFiles.toLocaleString('fr-FR')} fichiers ·{' '}
                                        {formatBytes(r2.r2.totalSize)}
                                    </div>
                                </div>
                            </div>
                            <SyncBadge local={r2.local.totalFiles} remote={r2.r2.totalFiles} />
                        </>
                    )}
                    {!hasR2 && <span className="text-[11px] text-mp-text-muted italic">R2 non configuré ou vide</span>}
                    <a href="/admin/r2" className="ml-auto text-xs text-mp-accent hover:underline">
                        Gérer R2 →
                    </a>
                </div>

                {/* Categories breakdown */}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {allCategories.map((cat) => {
                        const localCat = r2.local.categories[cat] ?? { files: 0, size: 0 };
                        const r2Cat = r2.r2.categories[cat] ?? { files: 0, size: 0 };
                        return (
                            <div
                                key={cat}
                                className="flex items-center gap-3 rounded-md border border-mp-glass-border/50 bg-mp-ui-black/20 px-3 py-2"
                            >
                                <span className="min-w-[90px] text-xs font-medium text-mp-text-primary capitalize">
                                    {cat}
                                </span>
                                <div className="space-y-0.5 flex-1">
                                    <div className="flex items-center justify-between font-mono text-[10px] text-mp-text-muted">
                                        <span>Local: {localCat.files}</span>
                                        {hasR2 && <span>R2: {r2Cat.files}</span>}
                                    </div>
                                    {hasR2 && <ComparisonBar local={localCat.files} remote={r2Cat.files} />}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}

// ===========================================================================
// Shared UI Atoms
// ===========================================================================

function SectionTitle({ children }: { children: React.ReactNode }) {
    return <h2 className="mb-3 font-mono text-[11px] tracking-wider text-mp-text-muted uppercase">{children}</h2>;
}

function SectionPanel({ title, href, children }: { title: string; href: string; children: React.ReactNode }) {
    return (
        <section className="rounded-lg border border-mp-glass-border bg-mp-glass-solid p-5">
            <div className="mb-4 flex items-center justify-between">
                <h2 className="font-mono text-[11px] tracking-wider text-mp-text-muted uppercase">{title}</h2>
                <a href={href} className="font-mono text-[10px] text-mp-accent hover:underline">
                    Détails →
                </a>
            </div>
            {children}
        </section>
    );
}

function SectionSkeleton({ title }: { title: string }) {
    return (
        <section className="rounded-lg border border-mp-glass-border bg-mp-glass-solid/40 p-5">
            <h2 className="mb-4 font-mono text-[11px] tracking-wider text-mp-text-muted uppercase">{title}</h2>
            <div className="space-y-3">
                <div className="h-20 animate-pulse rounded-md bg-mp-glass-border/30" />
                <div className="h-4 w-2/3 animate-pulse rounded-sm bg-mp-glass-border/30" />
            </div>
        </section>
    );
}

/** Circular SVG score gauge used for SEO + Lighthouse scores. */
function ScoreGauge({ score, size, label }: { score: number; size: number; label: string }) {
    const strokeWidth = 5;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const dashOffset = circumference - (score / 100) * circumference;

    return (
        <div className="flex flex-col items-center gap-1">
            <svg width={size} height={size} className="-rotate-90">
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={strokeWidth}
                    className="text-mp-glass-border/40"
                />
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={dashOffset}
                    className={`${scoreRingColor(score)} transition-all duration-700 ease-out`}
                />
            </svg>
            <span
                className={`-mt-${size > 70 ? '[58px]' : '[46px]'} text-${size > 70 ? 'xl' : 'base'} font-serif font-light ${scoreColor(score)}`}
                style={{ marginTop: -(size / 2 + (size > 70 ? 8 : 6)) }}
            >
                {score}
            </span>
            <span className="mt-1 font-mono text-[10px] text-mp-text-muted">{label}</span>
        </div>
    );
}

function ProgressRow({ label, current, total, pct }: { label: string; current: number; total: number; pct: number }) {
    return (
        <div>
            <div className="flex items-center justify-between text-[11px]">
                <span className="text-mp-text-secondary">{label}</span>
                <span className="font-mono text-mp-text-muted">
                    {current}/{total} ({pct}%)
                </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-mp-glass-border/40">
                <div
                    className={`h-full rounded-full transition-all duration-500 ${scoreBg(pct)}`}
                    style={{ width: `${pct}%` }}
                />
            </div>
        </div>
    );
}

function CwvMetric({ label, value, good }: { label: string; value: string; good: boolean }) {
    return (
        <div
            className={`rounded-md border px-3 py-2 text-center ${good ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-amber-500/20 bg-amber-500/5'}`}
        >
            <div className={`font-serif text-lg font-light ${good ? 'text-emerald-400' : 'text-amber-400'}`}>
                {value}
            </div>
            <div className="font-mono text-[10px] tracking-wider text-mp-text-muted uppercase">{label}</div>
        </div>
    );
}

function ComparisonBar({ local, remote }: { local: number; remote: number }) {
    const max = Math.max(local, remote, 1);
    const localPct = (local / max) * 100;
    const remotePct = (remote / max) * 100;
    return (
        <div className="flex h-1 gap-0.5">
            <div className="rounded-full bg-blue-400/60" style={{ width: `${localPct}%` }} />
            <div className="rounded-full bg-orange-400/60" style={{ width: `${remotePct}%` }} />
        </div>
    );
}

function SyncBadge({ local, remote }: { local: number; remote: number }) {
    const isSynced = local === remote;
    const delta = Math.abs(local - remote);
    if (isSynced) {
        return (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 font-mono text-[10px] text-emerald-400">
                ✓ Synchronisé
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 font-mono text-[10px] text-amber-400">
            ⚠ Δ {delta} fichiers
        </span>
    );
}

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------

function StatCard({
    label,
    value,
    href,
    icon,
    accent,
    sub,
    valueColor,
}: {
    label: string;
    value: number | string | undefined;
    href: string;
    icon: React.ReactNode;
    accent?: boolean;
    sub?: string;
    valueColor?: string;
}) {
    return (
        <a
            href={href}
            className={`group relative flex flex-col gap-2 overflow-hidden rounded-lg border bg-mp-glass-solid p-4 transition-all hover:border-mp-accent/50 hover:bg-mp-accent/5 ${accent ? 'border-mp-accent/30' : 'border-mp-glass-border'}`}
        >
            <div className="flex items-center justify-between">
                <span className="text-[10px] font-medium tracking-wider text-mp-text-secondary uppercase">{label}</span>
                <span
                    className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${accent ? 'bg-mp-accent/20 text-mp-accent' : 'bg-mp-ui-black/40 text-mp-text-muted'} group-hover:bg-mp-accent/20 group-hover:text-mp-accent`}
                >
                    {icon}
                </span>
            </div>
            <div className="flex items-baseline gap-2">
                <span
                    className={`font-serif text-2xl font-light tracking-tight ${valueColor || 'text-mp-text-heading'}`}
                >
                    {value === undefined ? (
                        <span className="inline-block h-7 w-12 animate-pulse rounded-sm bg-mp-glass-border/40" />
                    ) : (
                        value
                    )}
                </span>
                {sub && <span className="text-[11px] text-mp-text-muted">{sub}</span>}
            </div>
        </a>
    );
}

// ---------------------------------------------------------------------------
// Recent Activity (preserved from original)
// ---------------------------------------------------------------------------

function RecentActivity({ stats }: { stats: Stats | null }) {
    if (!stats) {
        return (
            <ul className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                    <li
                        key={i}
                        className="h-14 animate-pulse rounded-md border border-mp-glass-border bg-mp-glass-solid/40"
                    />
                ))}
            </ul>
        );
    }
    if (stats.recent.length === 0) {
        return (
            <div className="rounded-md border border-mp-glass-border bg-mp-glass-solid p-4 text-xs text-mp-text-muted">
                Aucune activité récente.
            </div>
        );
    }
    return (
        <ul className="space-y-2">
            {stats.recent.map((item) => {
                const thumb = resolveThumb(item);
                return (
                    <li key={`${item.kind}-${item.year}-${item.slug}`}>
                        <article className="group flex items-center gap-3 rounded-md border border-mp-glass-border bg-mp-glass-solid px-3 py-2.5 transition-colors hover:border-mp-accent/40">
                            {thumb ? (
                                <img
                                    src={thumb}
                                    alt=""
                                    className="h-10 w-10 shrink-0 rounded-sm object-cover"
                                    loading="lazy"
                                />
                            ) : (
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-mp-ui-black/40 font-mono text-[10px] text-mp-text-muted">
                                    {item.kind === 'blog' ? 'BL' : 'VG'}
                                </span>
                            )}
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    <span
                                        className={`rounded-full px-1.5 py-px font-mono text-[9px] tracking-wider uppercase ${item.kind === 'blog' ? 'border border-mp-accent/40 text-mp-accent' : 'border border-mp-glass-border text-mp-text-secondary'}`}
                                    >
                                        {item.kind === 'blog' ? 'Blog' : 'Voyage'}
                                    </span>
                                    <span className="font-mono text-[10px] text-mp-text-muted">{item.year}</span>
                                </div>
                                <div className="mt-0.5 truncate text-sm font-medium text-mp-text-primary">
                                    {item.title}
                                </div>
                                <div className="truncate text-[11px] text-mp-text-muted">
                                    {formatRelative(item.mtimeMs)}
                                </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                                <a
                                    href={item.editHref}
                                    className="rounded-md border border-mp-glass-border px-2 py-1 text-[11px] font-medium text-mp-text-secondary hover:border-mp-accent hover:text-mp-accent"
                                >
                                    Éditer
                                </a>
                                <a
                                    href={item.href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="rounded-md border border-mp-glass-border px-2 py-1 text-[11px] font-medium text-mp-text-secondary hover:border-mp-accent hover:text-mp-accent"
                                    title="Ouvrir sur le site"
                                >
                                    ↗
                                </a>
                            </div>
                        </article>
                    </li>
                );
            })}
        </ul>
    );
}

// ===========================================================================
// SVG Icons
// ===========================================================================

function BlogIcon() {
    return (
        <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
        </svg>
    );
}
function MapIcon() {
    return (
        <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <circle cx="12" cy="10" r="3" />
            <path d="M12 2a8 8 0 0 0-8 8c0 6 8 12 8 12s8-6 8-12a8 8 0 0 0-8-8z" />
        </svg>
    );
}
function StarIcon() {
    return (
        <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
    );
}
function CloudIcon() {
    return (
        <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M17.5 19a4.5 4.5 0 1 0-.8-8.93 6 6 0 1 0-11.4 3" />
            <polyline points="8 16 12 12 16 16" />
            <line x1="12" y1="12" x2="12" y2="21" />
        </svg>
    );
}
function DownloadIcon() {
    return (
        <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
    );
}
function ImageIcon() {
    return (
        <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
        </svg>
    );
}
function SeoIcon() {
    return (
        <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
    );
}
function HardDriveIcon() {
    return (
        <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <line x1="22" y1="12" x2="2" y2="12" />
            <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
            <line x1="6" y1="16" x2="6.01" y2="16" />
            <line x1="10" y1="16" x2="10.01" y2="16" />
        </svg>
    );
}
function InfoIcon() {
    return (
        <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
    );
}
function QuickIcon({ icon }: { icon: 'plus' | 'upload' | 'play' | 'lighthouse' | 'database' }) {
    if (icon === 'plus')
        return (
            <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
        );
    if (icon === 'upload')
        return (
            <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
        );
    if (icon === 'lighthouse')
        return (
            <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
        );
    if (icon === 'database')
        return (
            <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <ellipse cx="12" cy="5" rx="9" ry="3" />
                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" />
            </svg>
        );
    return (
        <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
    );
}
