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
import { useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import AdminProviders from './AdminProviders';
import { useConfirm } from './ConfirmDialog';
import PageHeader from './PageHeader';
import RemoteJobHistory from './RemoteJobHistory';
import { useToast } from './Toast';
import { useRemoteJobs, type RemoteScript } from './useRemoteJobs';

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
    const { data, loadError, refresh, selectedJob, logs, selectJob, launch, cancel } = useRemoteJobs();
    const [busy, setBusy] = useState(false);

    const launchScript = async (script: RemoteScript) => {
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
            await launch(script.id);
            toast.success('Job lancé : le run GitHub Actions démarre dans quelques secondes.');
        } catch (error) {
            toast.error(String((error as Error).message ?? error), { title: 'Lancement impossible' });
        } finally {
            setBusy(false);
        }
    };

    const cancelJob = async (job: Parameters<typeof cancel>[0]) => {
        if (!(await confirm({ title: 'Annuler ce job ?', tone: 'danger', confirmLabel: 'Annuler le job' }))) return;
        const error = await cancel(job);
        if (error) toast.error(error, { title: 'Annulation impossible' });
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
                                onClick={() => void launchScript(script)}
                                className={`${buttonClass} border-mp-accent bg-mp-accent text-mp-ui-black hover:opacity-90`}
                            >
                                Lancer
                            </button>
                        </div>
                    </li>
                ))}
            </ul>

            <RemoteJobHistory
                jobs={data.jobs}
                selectedJob={selectedJob}
                logs={logs}
                scriptLabel={scriptLabel}
                onSelect={selectJob}
                onCancel={(job) => void cancelJob(job)}
            />
        </div>
    );
}
