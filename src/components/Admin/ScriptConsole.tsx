import { useEffect, useRef, useState } from 'react';
import { copyToClipboard } from './clipboard';

interface LogLine {
    kind: 'stdout' | 'stderr' | 'meta';
    text: string;
}

interface Props {
    /** When set, the console opens a connection to /api/admin/scripts/run?id=... */
    runId: string | null;
    /** Optional command line arguments to pass to the script. */
    args?: string[];
    /** Optional run nonce: changing this re-runs the same id (used by Retry button). */
    runNonce?: number;
    /** Identifiant unique du panneau d'administration pour isoler les états de console. */
    panelId: string;
    onExit?: (code: number | null) => void;
    onClose?: () => void;
}

/** SSE console streaming stdout/stderr from /api/admin/scripts/run. */
export default function ScriptConsole({ runId, args = [], runNonce = 0, panelId, onExit, onClose }: Props) {
    const [lines, setLines] = useState<LogLine[]>([]);
    const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
    const [exitCode, setExitCode] = useState<number | null>(null);
    const [autoscroll, setAutoscroll] = useState(true);
    const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
    const abortRef = useRef<AbortController | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const onExitRef = useRef(onExit);
    useEffect(() => {
        onExitRef.current = onExit;
    }, [onExit]);

    useEffect(() => {
        if (!runId) return;

        // POURQUOI: Permet de restaurer les logs et l'état de la console depuis sessionStorage
        // lors d'un rechargement de page (F5) s'il s'agit de la même exécution (même nonce).
        const savedKey = `script-console-${panelId}`;
        const savedRaw = sessionStorage.getItem(savedKey);
        if (savedRaw) {
            try {
                const saved = JSON.parse(savedRaw);
                if (saved.runId === runId && saved.runNonce === runNonce) {
                    let restoredStatus = saved.status;
                    let restoredLines: LogLine[] = saved.lines || [];
                    let restoredExitCode = saved.exitCode;

                    // Si la page a été rechargée pendant l'exécution, vérifier si le script était déjà terminé avec succès
                    if (restoredStatus === 'running') {
                        // POURQUOI: Évite un faux positif 'exit -1' si le script s'est déjà conclu avec succès
                        // (ex: 'All SEO checks passed', 'checks passed', etc.) juste avant ou pendant le rechargement.
                        const tailText = restoredLines
                            .slice(-6)
                            .map((l: any) => l.text)
                            .join(' ');
                        const isSuccess = /checks passed|all.*passed|terminé avec succès/i.test(tailText);

                        if (isSuccess) {
                            restoredStatus = 'done';
                            restoredExitCode = 0;
                        } else {
                            restoredStatus = 'error';
                            restoredExitCode = -1;
                            restoredLines = [
                                ...restoredLines,
                                {
                                    kind: 'stderr',
                                    text: '[Console] Connexion interrompue par le rechargement de la page.',
                                },
                            ];
                        }
                    }

                    setLines(restoredLines);
                    setStatus(restoredStatus);
                    setExitCode(restoredExitCode);
                    return;
                }
            } catch {
                /* ignore et exécute */
            }
        }

        // Sinon, démarrer une nouvelle exécution
        setLines([]);
        setExitCode(null);
        setStatus('running');
        const ctrl = new AbortController();
        abortRef.current = ctrl;

        let url = `/api/admin/scripts/run?id=${encodeURIComponent(runId)}`;
        if (args && args.length > 0) {
            url += '&' + args.map((a) => `arg=${encodeURIComponent(a)}`).join('&');
        }
        let buffer = '';

        (async () => {
            try {
                const res = await fetch(url, { signal: ctrl.signal });
                if (!res.ok || !res.body) {
                    setLines((prev) => [...prev, { kind: 'stderr', text: `HTTP ${res.status}` }]);
                    setStatus('error');
                    return;
                }
                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });
                    let idx: number;
                    while ((idx = buffer.indexOf('\n\n')) >= 0) {
                        const raw = buffer.slice(0, idx);
                        buffer = buffer.slice(idx + 2);
                        const eventMatch = raw.match(/^event: (.+)$/m);
                        const dataLines = raw
                            .split('\n')
                            .filter((l) => l.startsWith('data: '))
                            .map((l) => l.slice(6));
                        const event = eventMatch?.[1] ?? 'message';
                        const data = dataLines.join('\n');
                        if (event === 'stdout' || event === 'stderr') {
                            setLines((prev) => [...prev, { kind: event, text: data }]);
                        } else if (event === 'start') {
                            try {
                                const meta = JSON.parse(data) as { command: string; pid: number };
                                if (meta.pid)
                                    setLines((prev) => [
                                        ...prev,
                                        { kind: 'meta', text: `$ ${meta.command} (pid ${meta.pid})` },
                                    ]);
                            } catch {
                                /* ignore */
                            }
                        } else if (event === 'exit') {
                            try {
                                const { code } = JSON.parse(data) as { code: number | null };
                                setExitCode(code);
                                setStatus(code === 0 ? 'done' : 'error');
                                onExitRef.current?.(code);
                            } catch {
                                setStatus('done');
                            }
                        } else if (event === 'error') {
                            setLines((prev) => [...prev, { kind: 'stderr', text: data }]);
                            setStatus('error');
                        }
                    }
                }

                // POURQUOI: Si le flux SSE se ferme normalement (done: true) sans erreur,
                // mais que l'événement 'exit' n'a pas été reçu, on finalise l'état proprement en 'done'.
                setStatus((current) => {
                    if (current === 'running') {
                        setExitCode(0);
                        onExitRef.current?.(0);
                        return 'done';
                    }
                    return current;
                });
            } catch (e) {
                if ((e as Error).name !== 'AbortError') {
                    setLines((prev) => [...prev, { kind: 'stderr', text: String(e) }]);
                    setStatus('error');
                }
            }
        })();

        return () => {
            ctrl.abort();
        };
        // POURQUOI: On sérialise `args` sous forme de chaîne JSON pour éviter que le useEffect
        // ne se réexécute à cause d'une nouvelle référence d'un tableau identique.
        // De même, `onExit` est géré via une ref pour éviter d'invalider l'effet inutilement.
    }, [runId, runNonce, JSON.stringify(args), panelId]);

    // POURQUOI: Met à jour le stockage de session en temps réel pour synchroniser les lignes
    // de logs reçues afin de pouvoir les restaurer fidèlement lors d'un F5.
    useEffect(() => {
        if (!runId) return;
        const state = {
            runId,
            args,
            runNonce,
            lines,
            status,
            exitCode,
        };
        sessionStorage.setItem(`script-console-${panelId}`, JSON.stringify(state));
    }, [runId, args, runNonce, lines, status, exitCode, panelId]);

    useEffect(() => {
        if (!autoscroll) return;
        const el = containerRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [lines, autoscroll]);

    // POURQUOI : l'abandon de la requête ne produit pas d'événement `exit` ; sans cette fin explicite,
    // la console resterait « en cours » et le bouton qui a lancé le script resterait désactivé.
    const stop = () => {
        abortRef.current?.abort();
        setLines((prev) => [...prev, { kind: 'meta', text: 'Arrêt demandé.' }]);
        setStatus('error');
        onExitRef.current?.(null);
    };

    const copyAll = async () => {
        const isCopied = await copyToClipboard(lines.map((l) => l.text).join('\n'));
        setCopyStatus(isCopied ? 'copied' : 'failed');
        setTimeout(() => setCopyStatus('idle'), 2000);
    };

    const clear = () => setLines([]);

    if (!runId) return null;

    const statusLabel =
        status === 'running' ? 'Exécution…' : status === 'done' ? 'Terminé' : status === 'error' ? 'Erreur' : 'Inactif';

    return (
        <div className="overflow-hidden rounded-lg border border-mp-glass-border bg-mp-ui-black/70">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-mp-glass-border bg-mp-bg-secondary/60 px-3 py-2 text-xs">
                <div className="flex items-center gap-2">
                    <span
                        className={`inline-block h-2 w-2 rounded-full ${
                            status === 'running'
                                ? 'animate-pulse bg-mp-accent'
                                : status === 'done'
                                  ? 'bg-mp-accent'
                                  : status === 'error'
                                    ? 'bg-mp-astro-red'
                                    : 'bg-mp-text-muted/60'
                        }`}
                    />
                    <span className="font-mono text-mp-text-primary">{runId}</span>
                    <span className="font-mono text-mp-text-muted">·</span>
                    <span
                        className={`font-mono ${status === 'error' ? 'text-mp-astro-red' : 'text-mp-text-secondary'}`}
                    >
                        {statusLabel}
                    </span>
                    {exitCode !== null && (
                        <span
                            className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${
                                exitCode === 0
                                    ? 'border-mp-accent/40 text-mp-accent'
                                    : 'border-mp-astro-red/40 text-mp-astro-red'
                            }`}
                        >
                            exit {exitCode}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-1.5">
                    <label className="flex cursor-pointer items-center gap-1 text-[10px] text-mp-text-muted select-none">
                        <input
                            type="checkbox"
                            checked={autoscroll}
                            onChange={(e) => setAutoscroll(e.target.checked)}
                            className="h-3 w-3 rounded-sm border-mp-glass-border bg-mp-ui-black/60 text-mp-accent focus:ring-0"
                        />
                        <span>Auto-scroll</span>
                    </label>
                    <button
                        type="button"
                        onClick={() => void copyAll()}
                        className={`rounded-sm border px-2 py-0.5 text-[10px] hover:border-mp-accent hover:text-mp-accent ${
                            copyStatus === 'failed'
                                ? 'border-mp-astro-red/50 text-mp-astro-red'
                                : 'border-mp-glass-border text-mp-text-secondary'
                        }`}
                    >
                        {copyStatus === 'copied' ? 'Copié' : copyStatus === 'failed' ? 'Échec de la copie' : 'Copier'}
                    </button>
                    <button
                        type="button"
                        onClick={clear}
                        className="rounded-sm border border-mp-glass-border px-2 py-0.5 text-[10px] text-mp-text-secondary hover:border-mp-accent hover:text-mp-accent"
                    >
                        Effacer
                    </button>
                    {status === 'running' && (
                        <button
                            type="button"
                            onClick={stop}
                            className="rounded-sm border border-mp-astro-red/50 px-2 py-0.5 text-[10px] text-mp-astro-red hover:bg-mp-astro-red/10"
                        >
                            ■ Arrêter
                        </button>
                    )}
                    {onClose && status !== 'running' && (
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-sm border border-mp-accent bg-mp-accent/10 px-2 py-0.5 text-[10px] font-semibold text-mp-accent hover:bg-mp-accent/20"
                        >
                            Fermer
                        </button>
                    )}
                </div>
            </div>
            <div
                ref={containerRef}
                className="scrollbar-thin max-h-[60vh] overflow-auto p-3 font-mono text-[11px] leading-snug"
            >
                {lines.length === 0 ? (
                    <span className="text-mp-text-muted">En attente de la sortie…</span>
                ) : (
                    lines.map((l, i) => (
                        <pre
                            key={i}
                            className={`wrap-break-word whitespace-pre-wrap ${
                                l.kind === 'stderr'
                                    ? 'text-mp-astro-red'
                                    : l.kind === 'meta'
                                      ? 'text-mp-accent'
                                      : 'text-mp-text-primary'
                            }`}
                        >
                            {l.text}
                        </pre>
                    ))
                )}
            </div>
        </div>
    );
}
