/**
 * Historique des jobs GitHub Actions et journal du job choisi.
 *
 * Responsabilité : afficher les derniers jobs (état, date, auteur, commit), permettre d'en annuler un et
 * montrer le journal du job sélectionné. L'état vient de `useRemoteJobs` ; ce composant ne fait aucun appel.
 */
import type { AdminJob, JobLogLine } from '@/lib/admin/jobs';
import { isJobActive } from './useRemoteJobs';

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
    queued: { label: 'En attente du run', className: 'text-mp-text-muted' },
    running: { label: 'En cours', className: 'text-amber-700 dark:text-amber-400' },
    succeeded: { label: 'Terminé', className: 'text-emerald-700 dark:text-emerald-400' },
    failed: { label: 'Échec', className: 'text-red-700 dark:text-red-400' },
    cancelled: { label: 'Annulé', className: 'text-mp-text-muted' },
};

interface Props {
    jobs: AdminJob[];
    selectedJob: AdminJob | null;
    logs: JobLogLine[];
    /** Libellé lisible d'un script. */
    scriptLabel: (scriptId: string) => string;
    onSelect: (jobId: string) => void;
    onCancel: (job: AdminJob) => void;
    title?: string;
}

/**
 * Liste des jobs et journal.
 *
 * @param props - Jobs, job sélectionné, journal et actions.
 * @returns La section.
 */
export default function RemoteJobHistory({
    jobs,
    selectedJob,
    logs,
    scriptLabel,
    onSelect,
    onCancel,
    title = 'Derniers jobs',
}: Props) {
    return (
        <>
            <section className="flex flex-col gap-3">
                <h2 className="font-serif text-lg font-light text-mp-text-primary">{title}</h2>
                {jobs.length === 0 ? (
                    <p className="text-sm text-mp-text-muted">Aucun job pour l’instant.</p>
                ) : (
                    <ul className="flex flex-col divide-y divide-mp-glass-border/40 text-sm">
                        {jobs.map((job) => {
                            const status = STATUS_LABELS[job.status] ?? STATUS_LABELS.queued;
                            return (
                                <li key={job.id} className="flex flex-wrap items-center gap-3 py-2">
                                    <button
                                        type="button"
                                        onClick={() => onSelect(job.id)}
                                        className={`min-h-touch text-left underline ${
                                            job.id === selectedJob?.id ? 'text-mp-accent' : 'text-mp-text-primary'
                                        }`}
                                    >
                                        {scriptLabel(job.scriptId)}
                                    </button>
                                    <span className={status.className}>{status.label}</span>
                                    <span className="font-mono text-xs text-mp-text-muted">
                                        {new Date(job.createdAt).toLocaleString('fr-FR')} · @{job.actor}
                                        {job.commitSha ? ` · commit ${job.commitSha.slice(0, 7)}` : ''}
                                    </span>
                                    {isJobActive(job) && (
                                        <button
                                            type="button"
                                            onClick={() => onCancel(job)}
                                            className="inline-flex min-h-touch items-center gap-2 rounded-md border border-mp-glass-border px-4 py-2 text-xs font-semibold text-mp-text-primary"
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
        </>
    );
}
