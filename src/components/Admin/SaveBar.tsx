import type { ReactNode } from 'react';

export type SyncState =
    | { kind: 'idle' }
    | { kind: 'syncing'; label?: string }
    | { kind: 'done'; summary: string }
    | { kind: 'error'; summary: string };

interface Props {
    /** Visible when true; slides in from the bottom otherwise. */
    visible: boolean;
    dirty: boolean;
    saving: boolean;
    saveLabel?: string;
    onSave: () => void;
    onDiscard?: () => void;
    /** Optional R2 sync status indicator. */
    sync?: SyncState;
    /** Optional extra controls (delete, sync now, etc). */
    extras?: ReactNode;
    /** Tip shown next to the save button (keyboard shortcut, last saved at, …). */
    hint?: ReactNode;
}

/**
 * Sticky save bar pinned to the bottom of the page while an editor session is
 * active. Familiar pattern from Notion / Linear: a context-aware action bar
 * that appears when the user has work in progress.
 */
export default function SaveBar({
    visible,
    dirty,
    saving,
    saveLabel = 'Sauvegarder',
    onSave,
    onDiscard,
    sync,
    extras,
    hint,
}: Props) {
    if (!visible) return null;
    return (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-4 sm:pb-5">
            <div className="pointer-events-auto w-full max-w-5xl rounded-lg border border-mp-glass-border bg-mp-bg-secondary/90 px-4 py-2.5 shadow-floating backdrop-blur-md">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                        <SaveDot dirty={dirty} saving={saving} />
                        <div className="min-w-0 text-xs leading-tight">
                            <div className="font-medium text-mp-text-primary">
                                {saving
                                    ? 'Sauvegarde en cours…'
                                    : dirty
                                      ? 'Modifications non sauvegardées'
                                      : 'Tout est synchronisé'}
                            </div>
                            <SyncLine sync={sync} />
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {extras}
                        {onDiscard && dirty && !saving && (
                            <button
                                type="button"
                                onClick={onDiscard}
                                className="rounded-md border border-mp-glass-border px-3 py-1.5 text-xs text-mp-text-secondary hover:border-mp-text-primary/40 hover:text-mp-text-primary"
                            >
                                Annuler
                            </button>
                        )}
                        {hint && <span className="hidden text-[10px] text-mp-text-muted sm:inline">{hint}</span>}
                        <button
                            type="button"
                            onClick={onSave}
                            disabled={saving || (!dirty && !!onDiscard)}
                            className="rounded-md border border-mp-accent bg-mp-accent px-3.5 py-1.5 text-xs font-semibold text-mp-ui-black hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {saving ? '…' : saveLabel}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function SaveDot({ dirty, saving }: { dirty: boolean; saving: boolean }) {
    if (saving) {
        return (
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-mp-accent/15">
                <span className="block h-2 w-2 animate-ping rounded-full bg-mp-accent" />
            </span>
        );
    }
    if (dirty) {
        return <span className="inline-flex h-2.5 w-2.5 shrink-0 rounded-full bg-mp-accent" />;
    }
    return <span className="inline-flex h-2.5 w-2.5 shrink-0 rounded-full bg-mp-text-muted/60" />;
}

function SyncLine({ sync }: { sync?: SyncState }) {
    if (!sync || sync.kind === 'idle') return null;
    if (sync.kind === 'syncing') {
        return <div className="text-[11px] text-mp-accent">{sync.label ?? 'Synchronisation R2 en cours…'}</div>;
    }
    if (sync.kind === 'done') {
        return <div className="text-[11px] text-mp-text-muted">{sync.summary}</div>;
    }
    return <div className="text-[11px] text-mp-astro-red">{sync.summary}</div>;
}
