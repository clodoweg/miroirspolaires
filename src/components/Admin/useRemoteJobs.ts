/**
 * Suivi des jobs GitHub Actions de l'admin distant.
 *
 * Responsabilité : charger les scripts lançables et les derniers jobs (`/api/admin/jobs`), les relire toutes
 * les 3 s tant qu'un job tourne, suivre le journal du job choisi, lancer et annuler un job.
 *
 * POURQUOI un hook : `RemoteJobsPanel` (tous les scripts) et les pages métier (import des astrophotos) lancent
 * et suivent les mêmes jobs ; seule la présentation change.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AdminJob, JobLogLine } from '@/lib/admin/jobs';

export interface RemoteScript {
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
const ACTIVE_STATUSES = new Set(['queued', 'running']);

/**
 * Indique si un job attend ou tourne encore.
 *
 * @param job - Job à tester.
 * @returns `true` tant que le job n'est pas terminé.
 */
export function isJobActive(job: Pick<AdminJob, 'status'>): boolean {
    return ACTIVE_STATUSES.has(job.status);
}

/**
 * Lit le message d'erreur d'une réponse en échec.
 *
 * @param response - Réponse HTTP.
 * @returns Le message de l'API, ou le code HTTP.
 */
export async function readErrorMessage(response: Response): Promise<string> {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    return body.error ?? `HTTP ${response.status}`;
}

async function fetchJobs(): Promise<{ data?: JobsResponse; error?: string }> {
    const response = await fetch('/api/admin/jobs');
    if (!response.ok) return { error: await readErrorMessage(response) };
    return { data: (await response.json()) as JobsResponse };
}

/**
 * Scripts, jobs et journal du job choisi.
 *
 * @param scriptIds - Restreint scripts et jobs à ces identifiants ; absent, tout est gardé.
 * @returns L'état et les actions.
 */
export function useRemoteJobs(scriptIds?: readonly string[]) {
    const [data, setData] = useState<JobsResponse | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
    const [logs, setLogs] = useState<JobLogLine[]>([]);
    const lastLogId = useRef(0);
    // POURQUOI : la liste passée en prop change d'identité à chaque rendu ; on la compare par contenu.
    const filterKey = scriptIds ? scriptIds.join(',') : null;

    const applyJobs = useCallback(
        (result: { data?: JobsResponse; error?: string }) => {
            setLoadError(result.error ?? null);
            if (!result.data) return;
            const allowed = filterKey === null ? null : new Set(filterKey.split(','));
            setData(
                allowed
                    ? {
                          ...result.data,
                          scripts: result.data.scripts.filter((script) => allowed.has(script.id)),
                          jobs: result.data.jobs.filter((job) => allowed.has(job.scriptId)),
                      }
                    : result.data,
            );
        },
        [filterKey],
    );
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

    const hasActiveJob = data?.jobs.some(isJobActive) ?? false;

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
            if (job && !isJobActive(job)) window.clearInterval(timer);
        }, POLL_MS);
        return () => {
            cancelled = true;
            window.clearInterval(timer);
        };
    }, [selectedJobId]);

    const selectJob = useCallback((jobId: string) => {
        lastLogId.current = 0;
        setLogs([]);
        setSelectedJobId(jobId);
    }, []);

    /**
     * Lance un job, puis affiche son journal.
     *
     * @param scriptId - Script à lancer (entrée `remote: true` de `SCRIPTS`).
     * @returns Le job créé.
     * @throws Error avec le message de l'API si le lancement est refusé.
     */
    const launch = useCallback(
        async (scriptId: string): Promise<AdminJob> => {
            const response = await fetch('/api/admin/jobs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ scriptId }),
            });
            if (!response.ok) throw new Error(await readErrorMessage(response));
            const job = (await response.json()) as AdminJob;
            await refresh();
            selectJob(job.id);
            return job;
        },
        [refresh, selectJob],
    );

    /**
     * Annule un job en attente ou en cours.
     *
     * @param job - Job à annuler.
     * @returns `null` si l'annulation est acceptée, sinon le message d'erreur.
     */
    const cancel = useCallback(
        async (job: AdminJob): Promise<string | null> => {
            const response = await fetch(`/api/admin/jobs/${job.id}/cancel`, { method: 'POST' });
            const error = response.ok ? null : await readErrorMessage(response);
            await refresh();
            return error;
        },
        [refresh],
    );

    const selectedJob = data?.jobs.find((job) => job.id === selectedJobId) ?? null;

    return { data, loadError, refresh, selectedJob, selectedJobId, logs, selectJob, launch, cancel, hasActiveJob };
}
