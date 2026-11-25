/**
 * @file src/components/Admin/SEOPanel.tsx
 * @description Tableau de bord récapitulatif de l'optimisation et de la couverture SEO.
 * Responsabilité : Offrir un aperçu immédiat de la santé du référencement du site,
 * lister toutes les pages, photos et voyages, et indiquer précisément les descriptions
 * ou les textes alternatifs manquants avec des filtres interactifs.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, CheckCircle, AlertTriangle, XCircle, ExternalLink } from 'lucide-react';
import AdminProviders from './AdminProviders';
import ClaudeCodeNotice from './ClaudeCodeNotice';
import PageHeader from './PageHeader';
import ScriptConsole from './ScriptConsole';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmDialog';

interface TechnicalStatus {
    astroSeoImplemented: boolean;
    sitemapConfigured: boolean;
    sitemapGenerated: boolean;
    robotsTxtValid: boolean;
    prefetchingEnabled: boolean;
    structuredDataFilesCount: number;
}

interface TechnicalCheck {
    name: string;
    status: 'ok' | 'warning' | 'error';
    message: string;
}

interface AuditedItem {
    id: string;
    type: 'page' | 'astrophoto' | 'voyage' | 'blog';
    name: string;
    path: string;
    hasDescription: boolean;
    description: string;
    descriptionLength: number;
    hasAltText?: boolean;
    altText?: string;
}

interface SeoResponse {
    summary: {
        score: number;
        totalAuditedItems: number;
        missingDescriptionsCount: number;
        missingAltsCount: number;
        totalPhotos: number;
        technicalStatus: TechnicalStatus;
    };
    technicalChecks: TechnicalCheck[];
    items: AuditedItem[];
}

/**
 * Composant principal de tableau de bord pour l'administration et le suivi du SEO.
 * Enveloppe le panneau de suivi dans les fournisseurs d'administration requis (Toast, Dialogues, etc.).
 *
 * @returns {JSX.Element} Le panneau d'administration SEO complet avec son fournisseur de contexte.
 */
/** Domaine affiché : tout l'audit, ou les seules pages (« Pages du site »), ou les astrophotos (« Fiches & textes »). */
export type SeoScope = 'all' | 'page' | 'astrophoto';

const SCOPE_TITLES: Record<SeoScope, string> = {
    all: 'Audit Référencement & Couverture SEO',
    page: 'Descriptions des pages du site',
    astrophoto: 'Descriptions SEO et alts des astrophotos',
};

const SCOPE_COMMANDS: Record<SeoScope, string[]> = {
    all: ['/generate-seo astro', '/generate-seo voyages'],
    // POURQUOI : `/generate-seo` ne couvre que les astrophotos et les voyages ; les pages se rédigent à la main.
    page: [],
    astrophoto: ['/generate-seo astro'],
};

export default function SEOPanel({ scope = 'all', remote = false }: { scope?: SeoScope; remote?: boolean }) {
    return (
        <AdminProviders>
            <SEOPanelInner scope={scope} remote={remote} />
        </AdminProviders>
    );
}

function SEOPanelInner({ scope, remote }: { scope: SeoScope; remote: boolean }) {
    const toast = useToast();
    const confirm = useConfirm();

    const [report, setReport] = useState<SeoResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState<
        'all' | 'missing-desc' | 'missing-alt' | 'pages' | 'photos' | 'voyages' | 'blog'
    >('all');
    const [isRunning, setIsRunning] = useState(false);
    const [runId, setRunId] = useState<string | null>(null);
    const [runNonce, setRunNonce] = useState(0);

    // Fetch SEO audit payload
    const fetchSeoReport = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/admin/seo');
            if (!res.ok) {
                throw new Error(`Code erreur : ${res.status}`);
            }
            const data: SeoResponse = await res.json();
            setReport(data);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const saved = sessionStorage.getItem('script-console-seo');
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
        fetchSeoReport();
    }, [fetchSeoReport]);

    const handleRunAudit = async () => {
        const ok = await confirm({
            title: "Lancer l'analyse SEO complète ?",
            message: (
                <div className="space-y-3 text-sm leading-relaxed text-mp-text-secondary">
                    <p>
                        Le script va scanner en lecture seule la couverture SEO, les balises de données structurées et
                        la validité technique du sitemap et de robots.txt.
                    </p>
                    <p className="font-mono text-[11px] text-mp-text-muted">
                        Script cible : scripts/audit/seo-coverage.mjs
                    </p>
                </div>
            ),
            confirmLabel: "Lancer l'analyse",
        });

        if (!ok) return;

        setRunId('seo-check');
        setIsRunning(true);
        setRunNonce((n) => n + 1);
    };

    const handleAuditExit = (code: number | null) => {
        setIsRunning(false);
        if (code === 0) {
            toast.success("L'analyse SEO est terminée. Les données ont été rafraîchies.", { title: 'Analyse réussie' });
            fetchSeoReport();
        } else {
            toast.error("Le script d'analyse SEO a échoué. Vérifiez la console de sortie pour plus de détails.", {
                title: "Échec de l'analyse",
            });
        }
    };

    // Filtering items based on search query and active tab
    // POURQUOI : une page de domaine (pages, astrophotos) ne montre que ses éléments ; l'audit global montre tout.
    const scopedItems = useMemo(
        () => (report ? report.items.filter((item) => scope === 'all' || item.type === scope) : []),
        [report, scope],
    );

    const filteredItems = useMemo(() => {
        return scopedItems.filter((item) => {
            // Search query match
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                const matchName = item.name.toLowerCase().includes(q);
                const matchPath = item.path.toLowerCase().includes(q);
                const matchDesc = item.description.toLowerCase().includes(q);
                if (!matchName && !matchPath && !matchDesc) return false;
            }

            // Tab selection filter
            if (activeTab === 'missing-desc') return !item.hasDescription;
            if (activeTab === 'missing-alt') return item.type === 'astrophoto' && !item.hasAltText;
            if (activeTab === 'pages') return item.type === 'page';
            if (activeTab === 'photos') return item.type === 'astrophoto';
            if (activeTab === 'voyages') return item.type === 'voyage';
            if (activeTab === 'blog') return item.type === 'blog';

            return true;
        });
    }, [scopedItems, searchQuery, activeTab]);

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <span className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-mp-accent border-t-transparent" />
            </div>
        );
    }

    if (error || !report) {
        return (
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-6 text-center text-red-400">
                <XCircle className="mx-auto mb-3 h-8 w-8 text-red-500" />
                <h3 className="mb-2 font-serif text-lg font-bold">Impossible de charger l'audit SEO</h3>
                <p className="mb-4 text-xs">
                    {error || "Une erreur inconnue s'est produite lors de la connexion à l'API."}
                </p>
                <button
                    onClick={fetchSeoReport}
                    className="rounded-md border border-mp-accent bg-mp-accent px-4 py-2 text-xs font-semibold text-mp-ui-black hover:opacity-90"
                >
                    Réessayer le chargement
                </button>
            </div>
        );
    }

    const { summary, technicalChecks } = report;
    const isGlobal = scope === 'all';
    const missingDescriptionsCount = scopedItems.filter((item) => !item.hasDescription).length;
    const missingAltsCount = scopedItems.filter((item) => item.type === 'astrophoto' && !item.hasAltText).length;

    // Jauge de score global
    const scoreColorClass =
        summary.score >= 90
            ? 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5'
            : summary.score >= 50
              ? 'text-amber-400 border-amber-500/20 bg-amber-500/5'
              : 'text-mp-astro-red border-mp-astro-red/20 bg-mp-astro-red/5';

    const trackColor =
        summary.score >= 90
            ? 'stroke-emerald-500/10'
            : summary.score >= 50
              ? 'stroke-amber-500/10'
              : 'stroke-red-500/10';
    const progressColor =
        summary.score >= 90 ? 'stroke-emerald-500' : summary.score >= 50 ? 'stroke-amber-500' : 'stroke-red-500';
    const circumference = 2 * Math.PI * 30;
    const strokeDashoffset = circumference - (summary.score / 100) * circumference;

    return (
        <div className="flex flex-col gap-6 pb-12">
            <PageHeader
                breadcrumb={[{ label: 'Admin', href: '/admin' }, { label: 'SEO' }]}
                title={SCOPE_TITLES[scope]}
                description="Analyse complète du positionnement sémantique, des balises descriptives, des textes alternatifs et du Sitemap."
                actions={
                    // POURQUOI : l'audit affiché est recalculé à chaque chargement ; le script ne sert qu'en local.
                    isGlobal &&
                    !remote && (
                        <button
                            type="button"
                            disabled={isRunning}
                            onClick={handleRunAudit}
                            className="rounded-md border border-mp-accent bg-mp-accent px-4 py-2 text-sm font-semibold text-mp-ui-black transition-opacity hover:opacity-90 disabled:opacity-50"
                        >
                            {isRunning ? 'Analyse en cours…' : "▶ Lancer l'analyse SEO"}
                        </button>
                    )
                }
            />

            {SCOPE_COMMANDS[scope].length > 0 ? (
                <ClaudeCodeNotice
                    message="Une description SEO manquante ne se génère pas depuis l’admin"
                    commands={SCOPE_COMMANDS[scope]}
                />
            ) : (
                <p className="text-sm text-mp-text-secondary">
                    Les descriptions des pages se rédigent dans <code>src/data/seo.json</code> (clé de la page, par
                    exemple <code>voyages/index</code>).
                </p>
            )}

            {runId && (
                <div className="flex flex-col gap-3">
                    {isRunning && (
                        <div className="rounded-lg border border-mp-accent/20 bg-mp-accent/5 p-4 text-xs leading-relaxed text-mp-accent">
                            <strong>Analyse en cours de traitement :</strong> Le script vérifie dynamiquement les
                            méta-descriptions, les balises de texte alternatif des images et la validité technique
                            globale de votre référencement.
                        </div>
                    )}
                    <ScriptConsole
                        runId={runId}
                        runNonce={runNonce}
                        panelId="seo"
                        onExit={handleAuditExit}
                        onClose={() => {
                            setRunId(null);
                            sessionStorage.removeItem('script-console-seo');
                        }}
                    />
                </div>
            )}

            {isGlobal && (
                <>
                    {/* Bilan & Synthèse */}
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        {/* Score global */}
                        <div className={`flex items-center gap-6 rounded-xl border p-5 ${scoreColorClass}`}>
                            <div className="relative h-20 w-20 shrink-0">
                                <svg className="h-full w-full -rotate-90">
                                    <circle
                                        cx="40"
                                        cy="40"
                                        r="30"
                                        className={trackColor}
                                        strokeWidth="5"
                                        fill="transparent"
                                    />
                                    <circle
                                        cx="40"
                                        cy="40"
                                        r="30"
                                        className={progressColor}
                                        strokeWidth="5"
                                        fill="transparent"
                                        strokeDasharray={circumference}
                                        strokeDashoffset={strokeDashoffset}
                                        strokeLinecap="round"
                                    />
                                </svg>
                                <div className="absolute inset-0 flex items-center justify-center font-serif text-xl font-bold">
                                    {summary.score}
                                </div>
                            </div>
                            <div>
                                <h3 className="font-serif text-base font-bold text-mp-text-primary">
                                    Santé SEO Générale
                                </h3>
                                <p className="mt-1 text-xs text-mp-text-secondary">
                                    Bilan basé sur l'intégrité technique et la couverture des méta-descriptions.
                                </p>
                            </div>
                        </div>

                        {/* KPI Descriptions manquantes */}
                        <div className="flex flex-col justify-center rounded-xl border border-mp-glass-border bg-mp-glass-solid/40 p-5">
                            <span className="font-mono text-[10px] tracking-wider text-mp-text-secondary uppercase">
                                Descriptions manquantes
                            </span>
                            <span className="mt-1.5 font-serif text-3xl font-bold text-mp-text-heading">
                                {summary.missingDescriptionsCount}
                            </span>
                            <p className="mt-1 text-[11px] text-mp-text-secondary">
                                Sur un total de {summary.totalAuditedItems} pages indexées sur le site.
                            </p>
                        </div>

                        {/* KPI Textes alternatifs manquants */}
                        <div className="flex flex-col justify-center rounded-xl border border-mp-glass-border bg-mp-glass-solid/40 p-5">
                            <span className="font-mono text-[10px] tracking-wider text-mp-text-secondary uppercase">
                                Alts d'images manquants
                            </span>
                            <span className="mt-1.5 font-serif text-3xl font-bold text-mp-text-heading">
                                {summary.missingAltsCount}
                            </span>
                            <p className="mt-1 text-[11px] text-mp-text-secondary">
                                Sur {summary.totalPhotos} astrophotographies publiées.
                            </p>
                        </div>
                    </div>

                    {/* Vérifications Techniques */}
                    <section aria-labelledby="technical-checks-title" className="space-y-4">
                        <h2
                            id="technical-checks-title"
                            className="font-mono text-xs tracking-wider text-mp-text-muted uppercase"
                        >
                            Intégrité Technique Référencement
                        </h2>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {technicalChecks.map((check, idx) => {
                                const isOk = check.status === 'ok';
                                const isError = check.status === 'error';
                                return (
                                    <div
                                        key={idx}
                                        className="flex gap-3 rounded-lg border border-mp-glass-border bg-mp-glass-solid/30 p-4"
                                    >
                                        <div className="mt-0.5 shrink-0">
                                            {isOk ? (
                                                <CheckCircle className="h-5 w-5 text-emerald-400" />
                                            ) : isError ? (
                                                <XCircle className="h-5 w-5 text-mp-astro-red" />
                                            ) : (
                                                <AlertTriangle className="h-5 w-5 text-amber-400" />
                                            )}
                                        </div>
                                        <div>
                                            <h4 className="text-xs font-semibold text-mp-text-heading">{check.name}</h4>
                                            <p className="mt-1 text-[11px] leading-relaxed text-mp-text-secondary">
                                                {check.message}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                </>
            )}

            {/* Explorateur de Contenus SEO */}
            <section className="flex flex-col gap-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    {/* Filtres de catégorie */}
                    <div className="flex flex-wrap gap-1">
                        {[
                            { id: 'all', label: `Tous (${scopedItems.length})` },
                            { id: 'missing-desc', label: `Manque desc (${missingDescriptionsCount})` },
                            ...(scope !== 'page'
                                ? [{ id: 'missing-alt', label: `Manque Alt d'image (${missingAltsCount})` }]
                                : []),
                            ...(isGlobal
                                ? [
                                      { id: 'pages', label: 'Pages' },
                                      { id: 'photos', label: 'Astrophotos' },
                                      { id: 'voyages', label: 'Voyages' },
                                      { id: 'blog', label: 'Blog' },
                                  ]
                                : []),
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                className={`rounded px-3 py-1.5 text-xs font-semibold transition-colors ${
                                    activeTab === tab.id
                                        ? 'bg-mp-accent text-mp-ui-black'
                                        : 'border border-mp-glass-border bg-mp-glass-solid text-mp-text-secondary hover:text-mp-text-primary'
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Champ de recherche */}
                    <div className="relative md:w-64">
                        <input
                            type="text"
                            placeholder="Rechercher une page…"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="admin-input pl-8"
                        />
                        <Search className="absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-mp-text-muted" />
                    </div>
                </div>

                {/* Table du Bilan SEO */}
                <div className="overflow-hidden rounded-lg border border-mp-glass-border bg-mp-glass-solid/20">
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-xs">
                            <thead>
                                <tr className="border-b border-mp-glass-border bg-mp-glass-solid text-left tracking-wider text-mp-text-muted uppercase">
                                    <th className="w-1/4 px-4 py-3 font-medium">Nom & URL</th>
                                    <th className="w-24 px-4 py-3 font-medium">Type</th>
                                    <th className="px-4 py-3 font-medium">Méta Description</th>
                                    <th className="w-36 px-4 py-3 font-medium">Image Alt Text (Photos)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-mp-glass-border/40">
                                {filteredItems.length > 0 ? (
                                    filteredItems.map((item, idx) => {
                                        const typeColor =
                                            item.type === 'page'
                                                ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                                : item.type === 'astrophoto'
                                                  ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                                                  : item.type === 'voyage'
                                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                                    : 'bg-amber-500/10 text-amber-400 border-amber-500/20';

                                        return (
                                            <tr key={idx} className="transition-colors hover:bg-mp-accent/5">
                                                <td className="px-4 py-3 font-medium text-mp-text-primary">
                                                    <div className="flex flex-col gap-0.5">
                                                        <span>{item.name}</span>
                                                        <a
                                                            href={item.path}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="flex w-max items-center gap-1 font-mono text-[10px] text-mp-text-muted hover:text-mp-accent"
                                                        >
                                                            {item.path} <ExternalLink className="h-3 w-3" />
                                                        </a>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span
                                                        className={`inline-block rounded-sm border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase ${typeColor}`}
                                                    >
                                                        {item.type}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    {item.hasDescription ? (
                                                        <div className="max-w-xl leading-relaxed text-mp-text-secondary">
                                                            {item.description}
                                                            <span className="ml-2 font-mono text-[10px] text-mp-text-muted">
                                                                ({item.descriptionLength} char)
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 rounded-sm border border-red-500/20 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-400">
                                                            <AlertTriangle className="h-3 w-3" /> Manquant dans seo.json
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3">
                                                    {item.type === 'astrophoto' ? (
                                                        item.hasAltText ? (
                                                            <span
                                                                className="block max-w-[200px] truncate text-mp-text-secondary"
                                                                title={item.altText}
                                                            >
                                                                {item.altText}
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1 rounded-sm border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">
                                                                <AlertTriangle className="h-3 w-3" /> Manquant dans
                                                                alt.json
                                                            </span>
                                                        )
                                                    ) : (
                                                        <span className="text-mp-text-muted">—</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })
                                ) : (
                                    <tr>
                                        <td colSpan={4} className="px-4 py-8 text-center text-mp-text-muted">
                                            Aucun objet ne correspond aux filtres de recherche.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>
        </div>
    );
}
