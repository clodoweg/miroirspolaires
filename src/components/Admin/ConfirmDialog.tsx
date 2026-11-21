import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

export interface ConfirmOptions {
    title: string;
    message?: ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    tone?: 'default' | 'danger';
}

interface PendingConfirm extends ConfirmOptions {
    resolve: (value: boolean) => void;
}

interface ConfirmContextValue {
    /**
     * Replacement for the native `window.confirm()`.
     *
     * Example:
     *   const ok = await confirm({
     *       title: 'Supprimer l\'article ?',
     *       message: 'Cette action est définitive.',
     *       tone: 'danger',
     *       confirmLabel: 'Supprimer',
     *   });
     */
    confirm: (opts: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function useConfirm(): ConfirmContextValue['confirm'] {
    const ctx = useContext(ConfirmContext);
    if (!ctx) throw new Error('useConfirm() must be used inside <ConfirmProvider>');
    return ctx.confirm;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
    const [pending, setPending] = useState<PendingConfirm | null>(null);
    const confirmBtnRef = useRef<HTMLButtonElement>(null);

    const confirm = useCallback((opts: ConfirmOptions) => {
        return new Promise<boolean>((resolve) => {
            setPending({ ...opts, resolve });
        });
    }, []);

    const decide = useCallback(
        (value: boolean) => {
            if (!pending) return;
            pending.resolve(value);
            setPending(null);
        },
        [pending],
    );

    useEffect(() => {
        if (!pending) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') decide(false);
            else if (e.key === 'Enter' && (e.target as HTMLElement)?.tagName !== 'TEXTAREA') {
                decide(true);
            }
        };
        window.addEventListener('keydown', onKey);
        const t = setTimeout(() => confirmBtnRef.current?.focus(), 30);
        return () => {
            window.removeEventListener('keydown', onKey);
            clearTimeout(t);
        };
    }, [pending, decide]);

    // POURQUOI: Mémoïser la valeur de contexte évite de créer un nouvel objet à chaque rendu.
    const contextValue = useMemo(() => ({ confirm }), [confirm]);

    return (
        <ConfirmContext.Provider value={contextValue}>
            {children}
            {pending && (
                <div
                    className="fixed inset-0 z-9050 flex items-center justify-center p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="admin-confirm-title"
                >
                    <button
                        type="button"
                        aria-label="Fermer"
                        onClick={() => decide(false)}
                        className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-xs"
                    />
                    <div
                        className={`relative w-full max-w-md rounded-lg border bg-mp-bg-secondary shadow-xl ${
                            pending.tone === 'danger' ? 'border-mp-astro-red/40' : 'border-mp-glass-border'
                        }`}
                    >
                        <div className="border-b border-mp-glass-border px-5 py-3.5">
                            <h2
                                id="admin-confirm-title"
                                className={`text-sm font-semibold ${pending.tone === 'danger' ? 'text-mp-astro-red' : 'text-mp-text-primary'}`}
                            >
                                {pending.title}
                            </h2>
                        </div>
                        {pending.message && (
                            <div className="px-5 py-4 text-sm text-mp-text-secondary">{pending.message}</div>
                        )}
                        <div className="flex items-center justify-end gap-2 border-t border-mp-glass-border px-5 py-3">
                            <button
                                type="button"
                                onClick={() => decide(false)}
                                className="rounded-md border border-mp-glass-border px-3 py-1.5 text-xs font-medium text-mp-text-secondary hover:border-mp-text-primary/40 hover:text-mp-text-primary"
                            >
                                {pending.cancelLabel ?? 'Annuler'}
                            </button>
                            <button
                                ref={confirmBtnRef}
                                type="button"
                                onClick={() => decide(true)}
                                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                                    pending.tone === 'danger'
                                        ? 'border border-mp-astro-red bg-mp-astro-red/15 text-mp-astro-red hover:bg-mp-astro-red/25'
                                        : 'border border-mp-accent bg-mp-accent text-mp-ui-black hover:opacity-90'
                                }`}
                            >
                                {pending.confirmLabel ?? 'Confirmer'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </ConfirmContext.Provider>
    );
}
