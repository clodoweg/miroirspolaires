import { useEffect, useMemo, useState } from 'react';
import AdminProviders from './AdminProviders';
import PageHeader from './PageHeader';
import SegmentedTabs from './SegmentedTabs';
import EmptyState from './EmptyState';
import ScriptConsole from './ScriptConsole';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmDialog';

type Category = 'pipeline' | 'seo' | 'check';

interface ScriptDef {
    id: string;
    label: string;
    description: string;
    category: Category;
    writes: boolean;
    commandPreview: string;
    needsTarget?: boolean;
}

const CATEGORY_LABEL: Record<Category | 'all', string> = {
    all: 'Tous',
    pipeline: 'Pipeline',
    seo: 'SEO',
    check: 'Checks',
};

export default function ScriptsRunner() {
    return (
        <AdminProviders>
            <ScriptsRunnerInner />
        </AdminProviders>
    );
}

function ScriptsRunnerInner() {
    const toast = useToast();
    const confirm = useConfirm();

    const [scripts, setScripts] = useState<ScriptDef[]>([]);
    const [filter, setFilter] = useState<Category | 'all'>('all');
    const [activeId, setActiveId] = useState<string | null>(null);
    const [runNonce, setRunNonce] = useState(0);

    useEffect(() => {
        // POURQUOI: Permet de restaurer la console de script active lors d'un rechargement F5.
        const saved = sessionStorage.getItem('script-console-scripts');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (parsed.runId) {
                    setActiveId(parsed.runId);
                    setRunNonce(parsed.runNonce || 0);
                }
            } catch {
                // POURQUOI : état sauvegardé corrompu, on repart d'une console vierge.
            }
        }

        fetch('/api/admin/scripts')
            .then((r) => r.json() as Promise<ScriptDef[]>)
            .then((all) => setScripts(all.filter((script) => !script.needsTarget)))
            .catch((e) => toast.error(String(e), { title: 'Chargement impossible' }));
    }, [toast]);

    const run = async (s: ScriptDef) => {
        if (s.writes) {
            const ok = await confirm({
                title: `Lancer "${s.label}" ?`,
                message: (
                    <div className="space-y-2">
                        <p>Ce script écrit sur le disque et peut faire des appels réseau.</p>
                        <pre className="rounded-sm border border-mp-glass-border bg-mp-ui-black/60 p-2 font-mono text-[11px] text-mp-text-secondary">
                            $ {s.commandPreview}
                        </pre>
                    </div>
                ),
                confirmLabel: 'Lancer',
            });
            if (!ok) return;
        }
        setActiveId(s.id);
        setRunNonce((n) => n + 1);
    };

    const retry = () => setRunNonce((n) => n + 1);

    const counts = useMemo(() => {
        const c: Record<Category | 'all', number> = { all: scripts.length, pipeline: 0, seo: 0, check: 0 };
        for (const s of scripts) c[s.category]++;
        return c;
    }, [scripts]);

    const filtered = scripts.filter((s) => filter === 'all' || s.category === filter);

    const activeScript = scripts.find((s) => s.id === activeId);

    return (
        <div className="flex flex-col gap-5 pb-12">
            <PageHeader
                breadcrumb={[{ label: 'Admin', href: '/admin' }, { label: 'Scripts' }]}
                title="Exécution de scripts"
                description="Lancement de pipelines SEO, checks et utilitaires. La sortie est streamée en temps réel via Server-Sent Events."
            />

            <SegmentedTabs
                value={filter}
                onChange={setFilter}
                options={[
                    { value: 'all', label: CATEGORY_LABEL.all, count: counts.all },
                    { value: 'pipeline', label: CATEGORY_LABEL.pipeline, count: counts.pipeline },
                    { value: 'seo', label: CATEGORY_LABEL.seo, count: counts.seo },
                    { value: 'check', label: CATEGORY_LABEL.check, count: counts.check },
                ]}
            />

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
                <ul className="space-y-2">
                    {filtered.map((s) => {
                        const isActive = s.id === activeId;
                        return (
                            <li key={s.id}>
                                <article
                                    className={`group rounded-lg border transition-colors ${
                                        isActive
                                            ? 'border-mp-accent/40 bg-mp-accent/5'
                                            : 'border-mp-glass-border bg-mp-glass-solid hover:border-mp-accent/30'
                                    }`}
                                >
                                    <div className="flex items-start justify-between gap-3 p-3">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="text-sm font-semibold text-mp-text-primary">
                                                    {s.label}
                                                </span>
                                                <span
                                                    className={`rounded border px-1.5 py-0.5 font-mono text-[9px] tracking-wider uppercase ${
                                                        s.category === 'pipeline'
                                                            ? 'border-mp-accent/40 text-mp-accent'
                                                            : s.category === 'seo'
                                                              ? 'border-mp-text-secondary/40 text-mp-text-secondary'
                                                              : 'border-mp-glass-border text-mp-text-muted'
                                                    }`}
                                                >
                                                    {s.category}
                                                </span>
                                                {!s.writes && (
                                                    <span className="rounded-sm border border-mp-accent/40 px-1.5 py-0.5 font-mono text-[9px] tracking-wider text-mp-accent uppercase">
                                                        read-only
                                                    </span>
                                                )}
                                            </div>
                                            <p className="mt-1.5 text-xs text-mp-text-secondary">{s.description}</p>
                                            <p
                                                className="mt-2 truncate rounded-sm bg-mp-ui-black/40 px-2 py-1 font-mono text-[10px] text-mp-text-muted"
                                                title={s.commandPreview}
                                            >
                                                $ {s.commandPreview}
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => run(s)}
                                            className="shrink-0 rounded-md border border-mp-accent bg-mp-accent px-3 py-1.5 text-xs font-semibold text-mp-ui-black hover:opacity-90"
                                        >
                                            ▶ Lancer
                                        </button>
                                    </div>
                                </article>
                            </li>
                        );
                    })}
                    {filtered.length === 0 && (
                        <li className="rounded-md border border-dashed border-mp-glass-border bg-mp-glass-solid/40 p-6 text-center text-xs text-mp-text-muted">
                            Aucun script dans cette catégorie.
                        </li>
                    )}
                </ul>

                <div className="flex flex-col gap-3 lg:sticky lg:top-16 lg:self-start">
                    {activeId ? (
                        <>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="min-w-0">
                                    <div className="font-mono text-[11px] tracking-wider text-mp-text-muted uppercase">
                                        Sortie · {activeScript ? activeScript.label : activeId}
                                    </div>
                                    <div className="truncate font-mono text-[11px] text-mp-text-secondary">
                                        {activeScript ? activeScript.commandPreview : ''}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={retry}
                                    className="rounded-md border border-mp-glass-border px-2.5 py-1 text-xs text-mp-text-secondary hover:border-mp-accent hover:text-mp-accent"
                                >
                                    ↻ Réessayer
                                </button>
                            </div>
                            <ScriptConsole
                                runId={activeId}
                                runNonce={runNonce}
                                panelId="scripts"
                                onClose={() => {
                                    setActiveId(null);
                                    sessionStorage.removeItem('script-console-scripts');
                                }}
                            />
                        </>
                    ) : (
                        <EmptyState
                            icon={
                                <svg
                                    width="20"
                                    height="20"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                >
                                    <polygon points="5 3 19 12 5 21 5 3" />
                                </svg>
                            }
                            title="Sélectionne un script"
                            description="Sa sortie en temps réel apparaîtra ici, ligne par ligne."
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
