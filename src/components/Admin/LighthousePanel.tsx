import { useEffect, useMemo, useState } from 'react';
import AdminProviders from './AdminProviders';
import PageHeader from './PageHeader';
import ScriptConsole from './ScriptConsole';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmDialog';

interface Scores {
    performance: number;
    accessibility: number;
    bestPractices: number;
    seo: number;
}

interface Metrics {
    lcp: number;
    cls: number;
    tbt: number;
    fcp: number;
    ttfb: number;
    totalBytes: number;
}

interface AuditResult {
    path: string;
    name: string;
    group: string;
    scores?: Scores;
    metrics?: Metrics;
    error?: string;
}

interface LighthouseReport {
    target: string;
    mode: 'local' | 'production';
    timestamp: string;
    durationSeconds: number;
    summary: {
        averagePerformance: number;
        averageAccessibility: number;
        averageBestPractices: number;
        averageSeo: number;
    };
    results: AuditResult[];
}

const GROUP_LABELS: Record<string, string> = {
    pages_principales: 'Pages Principales',
    astrophotographies: 'Détails Astrophotographies',
    voyages: 'Détails Voyages',
    blog: 'Détails Blog',
    videos: 'Vidéos',
    outils: 'Outils & Catalogues',
};

export default function LighthousePanel() {
    return (
        <AdminProviders>
            <LighthousePanelInner />
        </AdminProviders>
    );
}

function LighthousePanelInner() {
    const toast = useToast();
    const confirm = useConfirm();

    const [report, setReport] = useState<LighthouseReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [isRunning, setIsRunning] = useState(false);
    const [runId, setRunId] = useState<string | null>(null);
    const [runNonce, setRunNonce] = useState(0);

    // Search and filters
    const [searchQuery, setSearchQuery] = useState('');
    const [activeGroup, setActiveGroup] = useState<string | 'all'>('all');
    const [scoreFilter, setScoreFilter] = useState<'all' | 'green' | 'orange' | 'red'>('all');

    const fetchReport = async () => {
        try {
            const res = await fetch('/api/admin/lighthouse/report');
            if (res.status === 404) {
                setReport(null);
            } else if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            } else {
                const data = (await res.json()) as LighthouseReport;
                setReport(data);
            }
        } catch (e) {
            console.error('Failed to load Lighthouse report', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const saved = sessionStorage.getItem('script-console-lighthouse');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (parsed.runId) {
                    setRunId(parsed.runId);
                    setRunNonce(parsed.runNonce || 0);
                }
            } catch {
                // POURQUOI : état sauvegardé corrompu, on repart d'une console vierge.
            }
        }
        fetchReport();
    }, []);

    const handleRunAudit = async () => {
        const ok = await confirm({
            title: 'Lancer un audit Lighthouse complet ?',
            message: (
                <div className="space-y-3 text-sm leading-relaxed text-mp-text-secondary">
                    <p>
                        L'audit va lancer Lighthouse en mode mobile sans tête (headless) sur{' '}
                        <strong>16 pages stratégiques</strong> du site.
                    </p>
                    <div className="space-y-1 rounded-sm border border-mp-accent/20 bg-mp-accent/5 p-3 text-xs text-mp-accent">
                        <span className="font-bold">Cible de l'audit :</span>
                        <p>
                            L'audit cible le site de production en ligne{' '}
                            <strong>(https://www.miroirspolaires.fr)</strong> pour mesurer les performances réelles avec
                            la mise en cache CDN Cloudflare et les optimisations de serveurs réels.
                        </p>
                    </div>
                    <p className="text-[11px] text-mp-text-muted">Durée estimée : environ 2 à 3 minutes.</p>
                </div>
            ),
            confirmLabel: "Lancer l'audit",
        });

        if (!ok) return;

        setRunId('lighthouse-audit');
        setIsRunning(true);
        setRunNonce((n) => n + 1);
    };

    const handleAuditExit = (code: number | null) => {
        setIsRunning(false);
        if (code === 0) {
            toast.success("L'audit de performance est terminé. Les données ont été rafraîchies.", {
                title: 'Audit réussi',
            });
            fetchReport();
        } else {
            toast.error("Le script d'audit a échoué. Vérifiez la console de sortie pour plus de détails.", {
                title: "Échec de l'audit",
            });
        }
    };

    // Filter results
    const filteredResults = useMemo(() => {
        if (!report) return [];
        return report.results.filter((r) => {
            // Group filter
            if (activeGroup !== 'all' && r.group !== activeGroup) return false;

            // Search query filter
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                const matchName = r.name.toLowerCase().includes(q);
                const matchPath = r.path.toLowerCase().includes(q);
                if (!matchName && !matchPath) return false;
            }

            // Score Filter
            if (scoreFilter !== 'all') {
                if (r.error) return false;
                const perf = r.scores?.performance ?? 0;
                if (scoreFilter === 'green' && perf < 90) return false;
                if (scoreFilter === 'orange' && (perf < 50 || perf >= 90)) return false;
                if (scoreFilter === 'red' && perf >= 50) return false;
            }

            return true;
        });
    }, [report, activeGroup, searchQuery, scoreFilter]);

    // Unique groups in the report
    const groups = useMemo(() => {
        if (!report) return [];
        const set = new Set<string>();
        for (const r of report.results) {
            set.add(r.group);
        }
        return Array.from(set);
    }, [report]);

    const formattedDate = report
        ? new Date(report.timestamp).toLocaleDateString('fr-FR', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
          })
        : '';

    return (
        <div className="flex flex-col gap-6 pb-12">
            <PageHeader
                breadcrumb={[{ label: 'Admin', href: '/admin' }, { label: 'Lighthouse' }]}
                title="Audit de Performance & Core Web Vitals"
                description="Suivi en temps réel des performances Lighthouse et du respect des indicateurs de vitesse de Google (LCP, CLS, TBT)."
                actions={
                    <div className="flex items-center gap-2">
                        {report && (
                            <span className="hidden items-center gap-1.5 rounded-sm border border-mp-glass-border bg-mp-ui-black/30 px-3 py-1.5 text-xs text-mp-text-secondary sm:inline-flex">
                                <span
                                    className={`h-1.5 w-1.5 rounded-full ${report.mode === 'local' ? 'bg-mp-accent' : 'bg-emerald-500'}`}
                                />
                                Cible : <span className="font-mono text-mp-text-primary">{report.target}</span>
                            </span>
                        )}
                        <button
                            type="button"
                            disabled={isRunning}
                            onClick={handleRunAudit}
                            className="rounded-md border border-mp-accent bg-mp-accent px-4 py-2 text-sm font-semibold text-mp-ui-black transition-opacity hover:opacity-90 disabled:opacity-50"
                        >
                            {isRunning ? 'Audit en cours…' : '▶ Lancer un audit complet'}
                        </button>
                    </div>
                }
            />

            {runId && (
                <div className="flex flex-col gap-3">
                    {isRunning && (
                        <div className="rounded-lg border border-mp-accent/20 bg-mp-accent/5 p-4 text-xs leading-relaxed text-mp-accent">
                            <strong>Audit en cours de traitement :</strong> Lighthouse analyse séquentiellement les 16
                            pages sélectionnées. Ne fermez pas cette page. Les résultats seront actualisés et
                            enregistrés dès la fin du processus.
                        </div>
                    )}
                    <ScriptConsole
                        runId={runId}
                        runNonce={runNonce}
                        panelId="lighthouse"
                        onExit={handleAuditExit}
                        onClose={() => {
                            setRunId(null);
                            sessionStorage.removeItem('script-console-lighthouse');
                        }}
                    />
                </div>
            )}

            {loading ? (
                <div className="flex h-64 items-center justify-center">
                    <span className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-mp-accent border-t-transparent" />
                </div>
            ) : !report && !isRunning ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-mp-glass-border bg-mp-glass-solid/40 p-12 text-center">
                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-mp-glass-border bg-mp-glass-solid text-mp-text-muted">
                        <svg
                            width="28"
                            height="28"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                        </svg>
                    </div>
                    <h3 className="mb-2 font-serif text-lg text-mp-text-primary">Aucun rapport Lighthouse</h3>
                    <p className="mb-6 max-w-md text-xs leading-relaxed text-mp-text-secondary">
                        Aucun audit n'a encore été enregistré. Lancez un premier audit complet pour mesurer et optimiser
                        les scores du site.
                    </p>
                    <button
                        type="button"
                        onClick={handleRunAudit}
                        className="rounded-md border border-mp-accent bg-mp-accent px-4 py-2 text-sm font-semibold text-mp-ui-black hover:opacity-90"
                    >
                        Lancer l'audit initial
                    </button>
                </div>
            ) : report ? (
                <div className="flex flex-col gap-8">
                    {/* Bilan Synthèse */}
                    <section aria-labelledby="lh-summary-title">
                        <div className="mb-4 flex flex-wrap items-end justify-between gap-2 border-b border-mp-glass-border pb-2">
                            <div>
                                <h2
                                    id="lh-summary-title"
                                    className="font-mono text-[11px] tracking-wider text-mp-text-muted uppercase"
                                >
                                    Scores Moyens globaux
                                </h2>
                                <p className="mt-0.5 text-[11px] text-mp-text-secondary">
                                    Dernier audit réalisé le {formattedDate} (durée : {report.durationSeconds}s)
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <ScoreGauge score={report.summary.averagePerformance} label="Performance" />
                            <ScoreGauge score={report.summary.averageAccessibility} label="Accessibilité" />
                            <ScoreGauge score={report.summary.averageBestPractices} label="Bonnes Pratiques" />
                            <ScoreGauge score={report.summary.averageSeo} label="SEO" />
                        </div>
                    </section>

                    {/* Navigation, Search and Filtering */}
                    <section className="flex flex-col gap-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            {/* Group Selection */}
                            <div className="flex flex-wrap gap-1">
                                <button
                                    onClick={() => setActiveGroup('all')}
                                    className={`rounded px-3 py-1.5 text-xs font-semibold transition-colors ${
                                        activeGroup === 'all'
                                            ? 'bg-mp-accent text-mp-ui-black'
                                            : 'border border-mp-glass-border bg-mp-glass-solid text-mp-text-secondary hover:text-mp-text-primary'
                                    }`}
                                >
                                    Tous ({report.results.length})
                                </button>
                                {groups.map((g) => {
                                    const count = report.results.filter((r) => r.group === g).length;
                                    return (
                                        <button
                                            key={g}
                                            onClick={() => setActiveGroup(g)}
                                            className={`rounded px-3 py-1.5 text-xs font-semibold transition-colors ${
                                                activeGroup === g
                                                    ? 'bg-mp-accent text-mp-ui-black'
                                                    : 'border border-mp-glass-border bg-mp-glass-solid text-mp-text-secondary hover:text-mp-text-primary'
                                            }`}
                                        >
                                            {GROUP_LABELS[g] || g} ({count})
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Search bar */}
                            <div className="relative md:w-64">
                                <input
                                    type="text"
                                    placeholder="Rechercher une page…"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="admin-input pl-8"
                                />
                                <span className="absolute top-1/2 left-2.5 -translate-y-1/2 text-mp-text-muted">
                                    <svg
                                        width="14"
                                        height="14"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                    >
                                        <circle cx="11" cy="11" r="8" />
                                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                    </svg>
                                </span>
                            </div>
                        </div>

                        {/* Secondary filter by Score badge */}
                        <div className="flex items-center gap-4 text-xs">
                            <span className="font-mono text-[10px] tracking-wider text-mp-text-muted uppercase">
                                Filtrer par Score :
                            </span>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setScoreFilter('all')}
                                    className={`rounded-sm border px-2 py-0.5 transition-colors ${scoreFilter === 'all' ? 'border-mp-accent bg-mp-accent/5 text-mp-accent' : 'border-mp-glass-border text-mp-text-secondary hover:text-mp-text-primary'}`}
                                >
                                    Tous
                                </button>
                                <button
                                    onClick={() => setScoreFilter('green')}
                                    className={`rounded-sm border px-2 py-0.5 transition-colors ${scoreFilter === 'green' ? 'border-emerald-500 bg-emerald-500/5 text-emerald-400' : 'border-mp-glass-border text-mp-text-secondary hover:text-mp-text-primary'}`}
                                >
                                    🟢 Conforme (90+)
                                </button>
                                <button
                                    onClick={() => setScoreFilter('orange')}
                                    className={`rounded-sm border px-2 py-0.5 transition-colors ${scoreFilter === 'orange' ? 'border-amber-500 bg-amber-500/5 text-amber-400' : 'border-mp-glass-border text-mp-text-secondary hover:text-mp-text-primary'}`}
                                >
                                    🟠 Moyen (50-89)
                                </button>
                                <button
                                    onClick={() => setScoreFilter('red')}
                                    className={`rounded-sm border px-2 py-0.5 transition-colors ${scoreFilter === 'red' ? 'border-red-500 bg-red-500/5 text-red-400' : 'border-mp-glass-border text-mp-text-secondary hover:text-mp-text-primary'}`}
                                >
                                    🔴 Critique (&lt;50)
                                </button>
                            </div>
                        </div>

                        {/* Result list table */}
                        <div className="scrollbar-thin overflow-x-auto rounded-lg border border-mp-glass-border bg-mp-glass-solid">
                            <table className="w-full border-collapse text-left text-xs">
                                <thead>
                                    <tr className="border-b border-mp-glass-border bg-mp-bg-secondary/30 font-mono text-[10px] tracking-wider text-mp-text-muted uppercase">
                                        <th className="px-4 py-3">Page / Slug</th>
                                        <th className="px-3 py-3 text-center">Perf</th>
                                        <th className="px-3 py-3 text-center">A11y</th>
                                        <th className="px-3 py-3 text-center">Best</th>
                                        <th className="px-3 py-3 text-center">SEO</th>
                                        <th className="px-3 py-3 text-right">LCP</th>
                                        <th className="px-3 py-3 text-right">CLS</th>
                                        <th className="px-3 py-3 text-right">TBT</th>
                                        <th className="px-4 py-3 text-right">Poids</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-mp-glass-border">
                                    {filteredResults.map((r) => (
                                        <tr key={r.path} className="group transition-colors hover:bg-mp-ui-black/20">
                                            <td className="min-w-[200px] px-4 py-3">
                                                <div className="font-semibold text-mp-text-primary transition-colors group-hover:text-mp-accent">
                                                    {r.name}
                                                </div>
                                                <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] text-mp-text-muted">
                                                    {r.path}
                                                    <a
                                                        href={
                                                            report.mode === 'local'
                                                                ? `http://localhost:4321${r.path}`
                                                                : `https://www.miroirspolaires.fr${r.path}`
                                                        }
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-mp-text-muted hover:text-mp-accent"
                                                        title="Tester sur le site"
                                                    >
                                                        ↗
                                                    </a>
                                                </div>
                                            </td>

                                            {r.error ? (
                                                <td
                                                    colSpan={8}
                                                    className="bg-mp-astro-red/5 px-4 py-3 text-center text-mp-astro-red italic"
                                                >
                                                    Erreur : {r.error}
                                                </td>
                                            ) : (
                                                <>
                                                    {/* Scores Badges */}
                                                    <td className="px-3 py-3 text-center">
                                                        <ScoreBadge score={r.scores?.performance ?? 0} />
                                                    </td>
                                                    <td className="px-3 py-3 text-center">
                                                        <ScoreBadge score={r.scores?.accessibility ?? 0} />
                                                    </td>
                                                    <td className="px-3 py-3 text-center">
                                                        <ScoreBadge score={r.scores?.bestPractices ?? 0} />
                                                    </td>
                                                    <td className="px-3 py-3 text-center">
                                                        <ScoreBadge score={r.scores?.seo ?? 0} />
                                                    </td>

                                                    {/* Vitals Metrics */}
                                                    <td className="px-3 py-3 text-right font-mono font-medium">
                                                        <LcpMetric val={r.metrics?.lcp ?? 0} />
                                                    </td>
                                                    <td className="px-3 py-3 text-right font-mono font-medium">
                                                        <ClsMetric val={r.metrics?.cls ?? 0} />
                                                    </td>
                                                    <td className="px-3 py-3 text-right font-mono font-medium">
                                                        <TbtMetric val={r.metrics?.tbt ?? 0} />
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-mono text-mp-text-secondary">
                                                        {((r.metrics?.totalBytes ?? 0) / 1024).toFixed(0)} KB
                                                    </td>
                                                </>
                                            )}
                                        </tr>
                                    ))}
                                    {filteredResults.length === 0 && (
                                        <tr>
                                            <td colSpan={9} className="px-4 py-8 text-center text-mp-text-muted italic">
                                                Aucun résultat ne correspond aux filtres de recherche.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </div>
            ) : null}
        </div>
    );
}

function ScoreGauge({ score, label }: { score: number; label: string }) {
    let colorClass = 'text-mp-astro-red border-mp-astro-red/20 bg-mp-astro-red/5';
    let trackColor = 'stroke-red-500/10';
    let progressColor = 'stroke-red-500';
    if (score >= 90) {
        colorClass = 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5';
        trackColor = 'stroke-emerald-500/10';
        progressColor = 'stroke-emerald-500';
    } else if (score >= 50) {
        colorClass = 'text-amber-400 border-amber-500/20 bg-amber-500/5';
        trackColor = 'stroke-amber-500/10';
        progressColor = 'stroke-amber-500';
    }

    const radius = 30;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (score / 100) * circumference;

    return (
        <div className={`flex flex-col items-center gap-2.5 rounded-xl border p-4 ${colorClass}`}>
            <div className="relative h-20 w-20">
                <svg className="h-full w-full -rotate-90">
                    <circle cx="40" cy="40" r={radius} className={trackColor} strokeWidth="5" fill="transparent" />
                    <circle
                        cx="40"
                        cy="40"
                        r={radius}
                        className={progressColor}
                        strokeWidth="5"
                        fill="transparent"
                        strokeDasharray={circumference}
                        strokeDashoffset={strokeDashoffset}
                        strokeLinecap="round"
                    />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center font-serif text-xl font-bold">
                    {score}
                </div>
            </div>
            <span className="font-mono text-[10px] tracking-wider text-mp-text-secondary uppercase">{label}</span>
        </div>
    );
}

function ScoreBadge({ score }: { score: number }) {
    let colors = 'bg-red-500/10 text-red-400 border-red-500/20';
    if (score >= 90) {
        colors = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    } else if (score >= 50) {
        colors = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    }
    return (
        <span
            className={`inline-block min-w-[28px] rounded-sm border px-1.5 py-0.5 text-center font-mono text-[11px] font-bold ${colors}`}
        >
            {score}
        </span>
    );
}

function LcpMetric({ val }: { val: number }) {
    const sec = val / 1000;
    let color = 'text-red-400';
    if (sec <= 2.5) color = 'text-emerald-400';
    else if (sec <= 4.0) color = 'text-amber-400';
    return <span className={color}>{sec.toFixed(2)}s</span>;
}

function ClsMetric({ val }: { val: number }) {
    let color = 'text-red-400';
    if (val <= 0.1) color = 'text-emerald-400';
    else if (val <= 0.25) color = 'text-amber-400';
    return <span className={color}>{val.toFixed(3)}</span>;
}

function TbtMetric({ val }: { val: number }) {
    let color = 'text-red-400';
    if (val <= 200) color = 'text-emerald-400';
    else if (val <= 600) color = 'text-amber-400';
    return <span className={color}>{val.toFixed(0)}ms</span>;
}
