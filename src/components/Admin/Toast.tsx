import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

export type ToastTone = 'success' | 'error' | 'info';

export interface ToastItem {
    id: number;
    title?: string;
    message: string;
    tone: ToastTone;
    durationMs: number;
}

interface ToastContextValue {
    show: (input: Omit<ToastItem, 'id' | 'durationMs'> & { durationMs?: number }) => number;
    success: (message: string, opts?: { title?: string; durationMs?: number }) => number;
    error: (message: string, opts?: { title?: string; durationMs?: number }) => number;
    info: (message: string, opts?: { title?: string; durationMs?: number }) => number;
    dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * useToast - access the toast manager from any component nested under <ToastProvider>.
 *
 * Example:
 *   const toast = useToast();
 *   toast.success('Article sauvegardé.');
 *   toast.error('Échec de la sync R2.', { title: 'Erreur' });
 */
export function useToast(): ToastContextValue {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error('useToast() must be used inside <ToastProvider>');
    return ctx;
}

const DEFAULT_DURATION: Record<ToastTone, number> = {
    success: 3500,
    info: 4000,
    error: 6000,
};

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    const idRef = useRef(0);
    const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

    const dismiss = useCallback((id: number) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
        const handle = timers.current.get(id);
        if (handle) {
            clearTimeout(handle);
            timers.current.delete(id);
        }
    }, []);

    const show = useCallback<ToastContextValue['show']>(
        (input) => {
            const id = ++idRef.current;
            const tone = input.tone;
            const durationMs = input.durationMs ?? DEFAULT_DURATION[tone];
            const item: ToastItem = {
                id,
                title: input.title,
                message: input.message,
                tone,
                durationMs,
            };
            setToasts((prev) => [...prev, item]);
            if (durationMs > 0) {
                const handle = setTimeout(() => dismiss(id), durationMs);
                timers.current.set(id, handle);
            }
            return id;
        },
        [dismiss],
    );

    const success = useCallback(
        (message: string, opts?: { title?: string; durationMs?: number }) =>
            show({ message, tone: 'success', ...opts }),
        [show],
    );
    const error = useCallback(
        (message: string, opts?: { title?: string; durationMs?: number }) => show({ message, tone: 'error', ...opts }),
        [show],
    );
    const info = useCallback(
        (message: string, opts?: { title?: string; durationMs?: number }) => show({ message, tone: 'info', ...opts }),
        [show],
    );

    useEffect(() => {
        return () => {
            timers.current.forEach((h) => clearTimeout(h));
            timers.current.clear();
        };
    }, []);

    // POURQUOI: Mémoïser l'objet contexte évite que les composants enfants (ex: callbacks
    // ou effets dépendants de `toast`) ne soient redéclenchés à chaque rendu du provider.
    const contextValue = useMemo(
        () => ({ show, success, error, info, dismiss }),
        [show, success, error, info, dismiss],
    );

    return (
        <ToastContext.Provider value={contextValue}>
            {children}
            <ToastViewport toasts={toasts} dismiss={dismiss} />
        </ToastContext.Provider>
    );
}

function ToastViewport({ toasts, dismiss }: { toasts: ToastItem[]; dismiss: (id: number) => void }) {
    return (
        <div
            aria-live="polite"
            className="pointer-events-none fixed right-4 bottom-4 z-9100 flex w-full max-w-sm flex-col gap-2"
        >
            {toasts.map((t) => (
                <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
            ))}
        </div>
    );
}

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
    const tone = toast.tone;
    const accent =
        tone === 'success'
            ? 'border-mp-accent/50 bg-mp-accent/15 text-mp-text-primary'
            : tone === 'error'
              ? 'border-mp-astro-red/50 bg-mp-astro-red/15 text-mp-text-primary'
              : 'border-mp-glass-border bg-mp-glass-solid text-mp-text-primary';
    const dot = tone === 'success' ? 'bg-mp-accent' : tone === 'error' ? 'bg-mp-astro-red' : 'bg-mp-text-secondary';

    return (
        <div
            role="status"
            className={`pointer-events-auto flex items-start gap-3 rounded-lg border ${accent} px-3 py-2.5 shadow-floating backdrop-blur-md transition-all`}
        >
            <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
            <div className="min-w-0 flex-1">
                {toast.title && <div className="text-xs font-semibold text-mp-text-primary">{toast.title}</div>}
                <div className="text-xs text-mp-text-secondary">{toast.message}</div>
            </div>
            <button
                type="button"
                onClick={onDismiss}
                aria-label="Fermer la notification"
                className="rounded-md p-0.5 text-mp-text-muted transition-colors hover:bg-white/5 hover:text-mp-text-primary"
            >
                <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
            </button>
        </div>
    );
}
