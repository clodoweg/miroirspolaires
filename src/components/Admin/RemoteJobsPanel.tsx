/**
 * Panneau des scripts de l'admin distant (`/admin/infra/scripts` sur la Preview de `dev`).
 *
 * Responsabilité : lister les scripts lançables dans GitHub Actions, en lancer un, suivre l'état et le
 * journal des jobs (relus toutes les 3 s tant qu'un job tourne) et annuler un job.
 *
 * POURQUOI un panneau distinct de `ScriptsRunner` : en local, les scripts tournent sur la machine et
 * diffusent leur sortie en SSE ; à distance, ils tournent dans un run GitHub Actions et leur journal
 * transite par Turso.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import AdminProviders from './AdminProviders';
import { useConfirm } from './ConfirmDialog';
import PageHeader from './PageHeader';
import { useToast } from './Toast';
import type { AdminJob, JobLogLine } from '@/lib/admin/jobs';

interface RemoteScript {
    id: string;
    label: string;
    description: string;
    writes: boolean;
}

interface JobsResponse {
    scripts: RemoteScript[];
    jobs: AdminJob[];
    error?: string;
}

const POLL_MS = 3000;
const ACTIVE = new Set(['queued', 'running']);
const STATUS_LABELS: Record<string, { label: string; className: string }> = {
    queued: { label: 'En attente du run', className: 'text-mp-text-muted' },
    running: { label: 'En cours', className: 'text-amber-700 dark:text-amber-400' },
    succeeded: { label: 'Terminé', className: 'text-emerald-700 dark:text-emerald-400' },
    failed: { label: 'Échec', className: 'text-red-700 dark:text-red-400' },
    cancelled: { label: 'Annulé', className: 'text-mp-text-muted' },
};

async function readError(response: Response): Promise<string> {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    return body.error ?? `HTTP ${response.status}`;
}

async function fetchJobs(): Promise<{ data?: JobsResponse; error?: string }> {
    const response = await fetch('/api/admin/jobs');
    if (!response.ok) return { error: await readError(response) };
    return { data: (await response.json()) as JobsResponse };
}

export default function RemoteJobsPanel() {
    return (
        <AdminProviders>
            <RemoteJobsPanelInner />
        </AdminProviders>
    );
}

function RemoteJobsPanelInner() {
    const toast = useToast();
    const confirm = useConfirm();
    const [data, setData] = useState<JobsResponse | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
    const [logs, setLogs] = useState<JobLogLine[]>([]);
    const lastLogId = useRef(0);
    const [busy, setBusy] = useState(false);

    const applyJobs = useCallback((result: { data?: JobsResponse; error?: string }) => {
        setLoadError(result.error ?? null);
        if (result.data) setData(result.data);
    }, []);
    const refresh = useCallback(() => fetchJobs().then(applyJobs), [applyJobs]);

    useEffect(() => {
        let cancelled = false;
        void fetchJobs().then((result) => {
            if (!cancelled) applyJobs(result);
        });
        return () => {
            cancelled = true;
        };
    }, [applyJobs]);

    const selectedJob = data?.jobs.find((job) => job.id === selectedJobId) ?? null;
    const hasActiveJob = data?.jobs.some((job) => ACTIVE.has(job.status)) ?? false;

    useEffect(() => {
        if (!hasActiveJob) return;
        const timer = window.setInterval(() => void refresh(), POLL_MS);
        return () => window.clearInterval(timer);
    }, [hasActiveJob, refresh]);

    useEffect(() => {
        if (!selectedJobId) return;
        let cancelled = false;
        const poll = async () => {
            const response = await fetch(`/api/admin/jobs/${selectedJobId}?after=${lastLogId.current}`);
            if (!response.ok || cancelled) return;
            const body = (await response.json()) as { job: AdminJob; logs: JobLogLine[] };
            if (body.logs.length > 0) {
                lastLogId.current = body.logs[body.logs.length - 1].id;
                setLogs((previous) => [...previous, ...body.logs]);
            }
            return body.job;
        };
        void poll();
        const timer = window.setInterval(async () => {
            const job = await poll();
            if (job && !ACTIVE.has(job.status)) window.clearInterval(timer);
        }, POLL_MS);
        return () => {
            cancelled = true;
            window.clearInterval(timer);
        };
    }, [selectedJobId]);

    const selectJob = (jobId: string) => {
        lastLogId.current = 0;
        setLogs([]);
        setSelectedJobId(jobId);
    };

    const launch = async (script: RemoteScript) => {
        const accepted = await confirm({
            title: `Lancer « ${script.label} » ?`,
            message: script.writes
                ? 'Le script tourne dans GitHub Actions. Ce qu’il écrit (Turso, ou fichiers de src/data/ committés sur dev) prend effet sans autre confirmation.'
                : 'Le script tourne dans GitHub Actions, en lecture seule.',
            tone: script.writes ? 'danger' : 'default',
            confirmLabel: 'Lancer',
        });
        if (!accepted) return;
        setBusy(true);
        try {
            const response = await fetch('/api/admin/jobs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ scriptId: script.id }),
            });
            if (!response.ok) throw new Error(await readError(response));
            const job = (await response.json()) as AdminJob;
            toast.success('Job lancé : le run GitHub Actions démarre dans quelques secondes.');
            await refresh();
            selectJob(job.id);
        } catch (error) {
            toast.error(String((error as Error).message ?? error), { title: 'Lancement impossible' });
        } finally {
            setBusy(false);
        }
    };

    const cancel = async (job: AdminJob) => {
        if (!(await confirm({ title: 'Annuler ce job ?', tone: 'danger', confirmLabel: 'Annuler le job' }))) return;
        const response = await fetch(`/api/admin/jobs/${job.id}/cancel`, { method: 'POST' });
        if (!response.ok) toast.error(await readError(response), { title: 'Annulation impossible' });
        await refresh();
    };

    if (loadError) return <p className="text-sm text-red-700 dark:text-red-400">Chargement impossible : {loadError}</p>;
    if (!data) {
        return (
            <p className="flex items-center gap-2 text-sm text-mp-text-muted">
                <Loader2 className="h-4 w-4 animate-spin" /> Chargement des scripts…
            </p>
        );
    }

    const scriptLabel = (id: string) => data.scripts.find((script) => script.id === id)?.label ?? id;
    const buttonClass =
        'min-h-touch rounded-md border px-4 py-2 text-xs font-semibold disabled:opacity-50 inline-flex items-center gap-2';

    return (
        <div className="flex flex-col gap-6">
            <PageHeader
                title="Scripts (GitHub Actions)"
                description="Chaque lancement crée un run GitHub Actions sur dev ; les fichiers modifiés sont committés sur dev."
                actions={
                    <button
                        type="button"
                        onClick={() => void refresh()}
                        className={`${buttonClass} border-mp-glass-border text-mp-text-primary hover:bg-mp-ui-black/20`}
                    >
                        <RefreshCw className="h-3.5 w-3.5" /> Actualiser
                    </button>
                }
            />
            {data.error && <p className="text-sm text-red-700 dark:text-red-400">{data.error}</p>}

            <ul className="grid gap-3 md:grid-cols-2">
                {data.scripts.map((script) => (
                    <li
                        key={script.id}
                        className="flex flex-col gap-2 rounded-xl border border-mp-glass-border bg-mp-glass-solid p-4"
                    >
                        <p className="text-sm font-semibold text-mp-text-primary">{script.label}</p>
                        <p className="text-xs text-mp-text-secondary">{script.description}</p>
                        <div>
                            <button
                                type="button"
                                disabled={busy || Boolean(data.error)}
                                onClick={() => void launch(script)}
                                className={`${buttonClass} border-mp-accent bg-mp-accent text-mp-ui-black hover:opacity-90`}
                            >
                                Lancer
                            </button>
                        </div>
                    </li>
                ))}
            </ul>

            <section className="flex flex-col gap-3">
                <h2 className="font-serif text-lg font-light text-mp-text-primary">Derniers jobs</h2>
                {data.jobs.length === 0 ? (
                    <p className="text-sm text-mp-text-muted">Aucun job pour l’instant.</p>
                ) : (
                    <ul className="flex flex-col divide-y divide-mp-glass-border/40 text-sm">
                        {data.jobs.map((job) => {
                            const status = STATUS_LABELS[job.status] ?? STATUS_LABELS.queued;
                            return (
                                <li key={job.id} className="flex flex-wrap items-center gap-3 py-2">
                                    <button
                                        type="button"
                                        onClick={() => selectJob(job.id)}
                                        className={`min-h-touch text-left underline ${
                                            job.id === selectedJobId ? 'text-mp-accent' : 'text-mp-text-primary'
                                        }`}
                                    >
                                        {scriptLabel(job.scriptId)}
                                    </button>
                                    <span className={status.className}>{status.label}</span>
                                    <span className="font-mono text-xs text-mp-text-muted">
                                        {new Date(job.createdAt).toLocaleString('fr-FR')} · @{job.actor}
                                        {job.commitSha ? ` · commit ${job.commitSha.slice(0, 7)}` : ''}
                                    </span>
                                    {ACTIVE.has(job.status) && (
                                        <button
                                            type="button"
                                            onClick={() => void cancel(job)}
                                            className={`${buttonClass} border-mp-glass-border text-mp-text-primary`}
                                        >
                                            Annuler
                                        </button>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>

            {selectedJob && (
                <section className="flex flex-col gap-2">
                    <h2 className="font-serif text-lg font-light text-mp-text-primary">
                        Journal : {scriptLabel(selectedJob.scriptId)}
                    </h2>
                    <pre
                        aria-label="Journal du job"
                        className="max-h-[60vh] overflow-auto rounded-xl border border-mp-glass-border bg-mp-ui-black/40 p-4 font-mono text-xs whitespace-pre-wrap text-mp-text-primary"
                    >
                        {logs.length === 0
                            ? 'En attente des premières lignes…'
                            : logs.map((line) => `${line.stream === 'stderr' ? '! ' : ''}${line.line}`).join('\n')}
                    </pre>
                </section>
            )}
        </div>
    );
}
