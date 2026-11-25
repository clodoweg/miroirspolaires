/**
 * Liste « À faire » du tableau de bord : ce qui manque dans chaque section, avec un lien vers la page qui corrige.
 *
 * Responsabilité : afficher `GET /api/admin/todo` (`collectAdminTodos`), en local comme à distance, et signaler
 * discrètement les sources illisibles.
 */
import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import type { AdminTodoReport } from '@/lib/admin/admin-todo';

type LoadState = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; report: AdminTodoReport };

export default function AdminTodoPanel() {
    const [state, setState] = useState<LoadState>({ kind: 'loading' });

    useEffect(() => {
        let cancelled = false;
        fetch('/api/admin/todo')
            .then(async (response) => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return (await response.json()) as AdminTodoReport;
            })
            .then((report) => {
                if (!cancelled) setState({ kind: 'ready', report });
            })
            .catch((error: unknown) => {
                if (!cancelled) setState({ kind: 'error', message: String((error as Error).message ?? error) });
            });
        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <section aria-labelledby="admin-todo-title" className="mb-8 flex flex-col gap-3">
            <h2 id="admin-todo-title" className="font-serif text-2xl font-light text-mp-text-heading">
                À faire
            </h2>
            {state.kind === 'loading' && (
                <p className="flex items-center gap-2 text-sm text-mp-text-muted">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Recherche de ce qui manque…
                </p>
            )}
            {state.kind === 'error' && (
                <p className="text-sm text-red-700 dark:text-red-400">Liste indisponible : {state.message}</p>
            )}
            {state.kind === 'ready' && (
                <>
                    {state.report.todos.length === 0 ? (
                        <p
                            role="status"
                            className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400"
                        >
                            <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Rien à faire : tout est à jour.
                        </p>
                    ) : (
                        <ul className="flex flex-col divide-y divide-mp-glass-border/60 rounded-xl border border-mp-glass-border">
                            {state.report.todos.map((todo) => (
                                <li
                                    key={`${todo.section}-${todo.title}`}
                                    className="flex flex-wrap items-center gap-3 px-4 py-3"
                                >
                                    <span className="w-44 font-mono text-xs tracking-wider text-mp-accent uppercase">
                                        {todo.section}
                                    </span>
                                    <span className="flex min-w-0 flex-1 flex-col">
                                        <span className="text-mp-text-heading">{todo.title}</span>
                                        <span className="text-sm text-mp-text-muted">{todo.detail}</span>
                                    </span>
                                    <a
                                        href={todo.href}
                                        className="min-h-touch content-center rounded-md border border-mp-border-accent px-3 text-sm text-mp-accent"
                                    >
                                        Ouvrir
                                    </a>
                                </li>
                            ))}
                        </ul>
                    )}
                    {state.report.errors.length > 0 && (
                        <p className="text-xs text-mp-text-muted">Non vérifié : {state.report.errors.join(' ; ')}</p>
                    )}
                </>
            )}
        </section>
    );
}
