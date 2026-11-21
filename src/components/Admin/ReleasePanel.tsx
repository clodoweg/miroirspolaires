/**
 * Panneau « Mise en production » de `/admin/publication` (admin distant).
 *
 * Responsabilité : montrer ce que la branche de contenu (`dev`) a de plus que la production (`main`),
 * ouvrir la PR de mise en production, suivre sa CI et la fusionner quand elle est verte.
 *
 * WARNING: la fusion déploie le site public ; elle passe par une confirmation et le serveur la refuse
 * si la CI n'est pas verte ou si la PR a reçu de nouveaux commits depuis l'affichage.
 */
import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import AdminProviders from './AdminProviders';
import { useConfirm } from './ConfirmDialog';
import PageHeader from './PageHeader';
import { useToast } from './Toast';
import type { ChecksState, ReleaseStatus } from '@/lib/admin/github/release';

/** POURQUOI : la CI dure environ 4 minutes ; relire l'état toutes les 15 s suffit à suivre son avancée. */
const PENDING_REFRESH_MS = 15_000;

const CHECKS_LABELS: Record<ChecksState, { label: string; className: string }> = {
    none: { label: 'Pas encore de CI', className: 'text-mp-text-muted' },
    pending: { label: 'CI en cours…', className: 'text-amber-700 dark:text-amber-400' },
    success: { label: 'CI verte', className: 'text-emerald-700 dark:text-emerald-400' },
    failure: { label: 'CI en échec', className: 'text-red-700 dark:text-red-400' },
};

async function readError(response: Response): Promise<string> {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    return body.error ?? `HTTP ${response.status}`;
}

async function fetchReleaseStatus(): Promise<{ status?: ReleaseStatus; error?: string }> {
    const response = await fetch('/api/admin/release');
    if (!response.ok) return { error: await readError(response) };
    return { status: (await response.json()) as ReleaseStatus };
}

export default function ReleasePanel() {
    return (
        <AdminProviders>
            <ReleasePanelInner />
        </AdminProviders>
    );
}

function ReleasePanelInner() {
    const toast = useToast();
    const confirm = useConfirm();
    const [status, setStatus] = useState<ReleaseStatus | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const load = useCallback(
        () =>
            fetchReleaseStatus().then((result) => {
                setLoadError(result.error ?? null);
                if (result.status) setStatus(result.status);
            }),
        [],
    );

    useEffect(() => {
        let cancelled = false;
        void fetchReleaseStatus().then((result) => {
            if (cancelled) return;
            setLoadError(result.error ?? null);
            if (result.status) setStatus(result.status);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    const checks = status?.pullRequest?.checks;
    useEffect(() => {
        if (checks !== 'pending' && checks !== 'none') return;
        const timer = window.setInterval(() => void load(), PENDING_REFRESH_MS);
        return () => window.clearInterval(timer);
    }, [checks, load]);

    const openPullRequest = async () => {
        setBusy(true);
        try {
            const response = await fetch('/api/admin/release', { method: 'POST' });
            if (!response.ok) throw new Error(await readError(response));
            toast.success('PR de mise en production ouverte : la CI démarre.');
            await load();
        } catch (error) {
            toast.error(String((error as Error).message ?? error), { title: 'Impossible d’ouvrir la PR' });
        } finally {
            setBusy(false);
        }
    };

    const publish = async () => {
        const pull = status?.pullRequest;
        if (!status || !pull) return;
        const accepted = await confirm({
            title: 'Mettre en production ?',
            message: `Les ${status.ahead} commit(s) de ${status.contentBranch} partent sur le site public (${status.productionBranch}). Vercel le redéploie en quelques minutes.`,
            tone: 'danger',
            confirmLabel: 'Mettre en production',
        });
        if (!accepted) return;
        setBusy(true);
        try {
            const response = await fetch('/api/admin/release/merge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pullNumber: pull.number, headSha: pull.headSha }),
            });
            if (!response.ok) throw new Error(await readError(response));
            toast.success('Fusionné : le site public se redéploie.');
            await load();
        } catch (error) {
            toast.error(String((error as Error).message ?? error), { title: 'Mise en production refusée' });
        } finally {
            setBusy(false);
        }
    };

    if (loadError) return <p className="text-sm text-red-700 dark:text-red-400">Chargement impossible : {loadError}</p>;
    if (!status) {
        return (
            <p className="flex items-center gap-2 text-sm text-mp-text-muted">
                <Loader2 className="h-4 w-4 animate-spin" /> Comparaison des branches…
            </p>
        );
    }

    const pull = status.pullRequest;
    const canPublish = pull !== null && pull.checks === 'success' && pull.mergeable !== false && !busy;
    const buttonClass =
        'rounded-md border px-4 py-2 text-xs font-semibold disabled:opacity-50 min-h-touch inline-flex items-center gap-2';

    return (
        <div className="flex flex-col gap-6">
            <PageHeader
                title="Mise en production"
                description={`${status.contentBranch} → ${status.productionBranch}`}
                actions={
                    <button
                        type="button"
                        onClick={() => void load()}
                        className={`${buttonClass} border-mp-glass-border text-mp-text-primary hover:bg-mp-ui-black/20`}
                    >
                        <RefreshCw className="h-3.5 w-3.5" /> Actualiser
                    </button>
                }
            />

            {status.ahead === 0 ? (
                <p className="rounded-xl border border-mp-glass-border p-5 text-sm text-mp-text-secondary">
                    Rien à publier : {status.contentBranch} et {status.productionBranch} sont alignées.
                </p>
            ) : (
                <section className="flex flex-col gap-4 rounded-xl border border-mp-glass-border bg-mp-glass-solid p-5">
                    <p className="text-sm text-mp-text-primary">
                        <strong>{status.ahead}</strong> commit(s) de {status.contentBranch} ne sont pas encore en
                        production.
                    </p>

                    {pull ? (
                        <div className="flex flex-wrap items-center gap-3 text-sm">
                            <a
                                href={pull.url}
                                className="inline-flex items-center gap-1 text-mp-accent underline"
                                rel="noreferrer"
                            >
                                PR #{pull.number} <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                            <span className={CHECKS_LABELS[pull.checks].className}>
                                {CHECKS_LABELS[pull.checks].label}
                            </span>
                            {pull.mergeable === false && (
                                <span className="text-red-700 dark:text-red-400">Conflit à résoudre sur GitHub</span>
                            )}
                            <button
                                type="button"
                                disabled={!canPublish}
                                onClick={() => void publish()}
                                className={`${buttonClass} border-mp-accent bg-mp-accent text-mp-ui-black hover:opacity-90`}
                            >
                                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Mettre en production
                            </button>
                        </div>
                    ) : (
                        <div>
                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => void openPullRequest()}
                                className={`${buttonClass} border-mp-accent bg-mp-accent text-mp-ui-black hover:opacity-90`}
                            >
                                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Préparer la mise en
                                production
                            </button>
                            <p className="mt-2 text-xs text-mp-text-muted">
                                Ouvre la PR {status.contentBranch} → {status.productionBranch} ; la CI vérifie le site
                                avant que la publication soit possible.
                            </p>
                        </div>
                    )}

                    <ol className="flex flex-col divide-y divide-mp-glass-border/40 text-sm">
                        {status.commits.map((commit) => (
                            <li key={commit.sha} className="flex flex-col gap-0.5 py-2">
                                <span className="text-mp-text-primary">{commit.message}</span>
                                <span className="font-mono text-xs text-mp-text-muted">
                                    {commit.sha.slice(0, 7)} · {commit.author} ·{' '}
                                    {commit.date ? new Date(commit.date).toLocaleString('fr-FR') : ''}
                                </span>
                            </li>
                        ))}
                    </ol>
                </section>
            )}
        </div>
    );
}
