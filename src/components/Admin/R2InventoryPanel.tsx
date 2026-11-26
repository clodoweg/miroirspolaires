/**
 * Inventaire du bucket R2 et fichiers orphelins (`/admin/infra/r2`, en local comme à distance).
 *
 * Responsabilité : afficher le bucket par grand dossier, lister les orphelins groupés par raison
 * (`src/lib/admin/r2-inventory.ts`) et supprimer ceux que l'on coche, après confirmation.
 *
 * WARNING: destructif. La suppression touche le bucket de production ; le serveur refuse toute clé qui n'est pas
 * un orphelin au moment de la demande.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import AdminProviders from './AdminProviders';
import { useConfirm } from './ConfirmDialog';
import { useToast } from './Toast';
import type { R2Inventory } from '@/lib/admin/r2-inventory';

/**
 * Formate une taille en octets.
 *
 * @param bytes - Taille.
 * @returns La taille lisible (Ko, Mo, Go).
 */
export function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} o`;
    const units = ['Ko', 'Mo', 'Go', 'To'];
    let value = bytes / 1024;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
    }
    return `${value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} ${units[unit]}`;
}

export default function R2InventoryPanel() {
    return (
        <AdminProviders>
            <R2InventoryPanelInner />
        </AdminProviders>
    );
}

function R2InventoryPanelInner() {
    const toast = useToast();
    const confirm = useConfirm();
    const [inventory, setInventory] = useState<R2Inventory | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [busy, setBusy] = useState(false);

    const [version, setVersion] = useState(0);
    const reload = useCallback(() => setVersion((current) => current + 1), []);

    useEffect(() => {
        let cancelled = false;
        fetch('/api/admin/r2/inventory')
            .then(async (response) => {
                const body = (await response.json().catch(() => ({}))) as R2Inventory & { error?: string };
                if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
                return body;
            })
            .then((body) => {
                if (cancelled) return;
                setError(null);
                setInventory(body);
                setSelected(new Set());
            })
            .catch((loadError: unknown) => {
                if (!cancelled) setError(String((loadError as Error).message ?? loadError));
            });
        return () => {
            cancelled = true;
        };
    }, [version]);

    const groups = useMemo(() => {
        const byReason = new Map<string, R2Inventory['orphans']>();
        for (const orphan of inventory?.orphans ?? []) {
            byReason.set(orphan.reason, [...(byReason.get(orphan.reason) ?? []), orphan]);
        }
        return [...byReason.entries()];
    }, [inventory]);

    const toggle = (keys: string[], checked: boolean) => {
        setSelected((current) => {
            const next = new Set(current);
            for (const key of keys) {
                if (checked) next.add(key);
                else next.delete(key);
            }
            return next;
        });
    };

    const deleteSelected = async () => {
        const keys = [...selected];
        const accepted = await confirm({
            title: `Supprimer ${keys.length} fichier(s) de R2 ?`,
            message:
                'Suppression définitive dans le bucket de production. Le serveur vérifie de nouveau que ce sont bien des orphelins.',
            tone: 'danger',
            confirmLabel: 'Supprimer',
        });
        if (!accepted) return;
        setBusy(true);
        try {
            const response = await fetch('/api/admin/r2/orphans', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ keys }),
            });
            const body = (await response.json().catch(() => ({}))) as { deleted?: string[]; error?: string };
            if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
            toast.success(`${body.deleted?.length ?? 0} fichier(s) supprimé(s).`, { title: 'Orphelins supprimés' });
            reload();
        } catch (deleteError) {
            toast.error(String((deleteError as Error).message ?? deleteError), { title: 'Suppression impossible' });
        } finally {
            setBusy(false);
        }
    };

    if (error) {
        return (
            <div className="flex flex-col items-start gap-3">
                <p className="text-sm text-red-700 dark:text-red-400">Inventaire R2 indisponible : {error}</p>
                <button
                    type="button"
                    onClick={reload}
                    className="min-h-touch rounded-md border border-mp-glass-border px-4 text-sm text-mp-text-primary"
                >
                    Réessayer
                </button>
            </div>
        );
    }
    if (!inventory) {
        return (
            <p className="flex items-center gap-2 text-sm text-mp-text-muted">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Lecture du bucket…
            </p>
        );
    }

    return (
        <div className="flex flex-col gap-6">
            <section className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-3">
                    <h2 className="flex-1 font-serif text-xl font-light text-mp-text-heading">
                        Bucket : {inventory.totalCount.toLocaleString('fr-FR')} fichiers,{' '}
                        {formatBytes(inventory.totalBytes)}
                    </h2>
                    <button
                        type="button"
                        onClick={reload}
                        className="inline-flex min-h-touch items-center gap-2 rounded-md border border-mp-glass-border px-4 text-sm text-mp-text-primary"
                    >
                        <RefreshCw className="h-4 w-4" aria-hidden="true" /> Actualiser
                    </button>
                </div>
                <div className="overflow-x-auto rounded-xl border border-mp-glass-border">
                    <table className="w-full min-w-[420px] text-sm">
                        <thead>
                            <tr className="text-left text-xs text-mp-text-muted">
                                <th scope="col" className="px-4 py-2 font-medium">
                                    Dossier
                                </th>
                                <th scope="col" className="px-4 py-2 font-medium">
                                    Fichiers
                                </th>
                                <th scope="col" className="px-4 py-2 font-medium">
                                    Poids
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {inventory.prefixes.map((prefix) => (
                                <tr key={prefix.prefix} className="border-t border-mp-glass-border/60">
                                    <td className="px-4 py-2 font-mono text-xs text-mp-text-primary">
                                        {prefix.prefix}
                                    </td>
                                    <td className="px-4 py-2 text-mp-text-secondary">
                                        {prefix.count.toLocaleString('fr-FR')}
                                    </td>
                                    <td className="px-4 py-2 text-mp-text-secondary">
                                        {formatBytes(prefix.sizeBytes)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            <section className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-3">
                    <h2 className="flex-1 font-serif text-xl font-light text-mp-text-heading">
                        Fichiers orphelins ({inventory.orphans.length})
                    </h2>
                    {inventory.orphans.length > 0 && (
                        <button
                            type="button"
                            disabled={busy || selected.size === 0}
                            onClick={() => void deleteSelected()}
                            className="min-h-touch rounded-md bg-mp-astro-red px-4 text-sm font-semibold text-white disabled:opacity-50"
                        >
                            Supprimer la sélection ({selected.size})
                        </button>
                    )}
                </div>
                <p className="text-sm text-mp-text-secondary">
                    Fichiers de R2 que plus rien ne référence : photo absente du CSV ou restée sous son ancienne année,
                    article ou voyage supprimé, version web sans source, envoi temporaire abandonné.
                </p>
                {inventory.orphans.length === 0 ? (
                    <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
                        Aucun fichier orphelin.
                    </p>
                ) : (
                    groups.map(([reason, orphans]) => {
                        const keys = orphans.map((orphan) => orphan.key);
                        const allChecked = keys.every((key) => selected.has(key));
                        return (
                            <fieldset
                                key={reason}
                                className="flex flex-col gap-1 rounded-xl border border-mp-glass-border p-4"
                            >
                                <legend className="px-1 text-sm font-semibold text-mp-text-heading">
                                    {reason} ({orphans.length})
                                </legend>
                                <label className="flex min-h-touch cursor-pointer items-center gap-3 text-sm text-mp-text-secondary">
                                    <input
                                        type="checkbox"
                                        checked={allChecked}
                                        onChange={(event) => toggle(keys, event.target.checked)}
                                        className="h-4 w-4 accent-mp-accent"
                                    />
                                    Tout cocher
                                </label>
                                <ul className="flex flex-col">
                                    {orphans.map((orphan) => (
                                        <li key={orphan.key} className="block">
                                            <label className="flex min-h-touch cursor-pointer items-center gap-3">
                                                <input
                                                    type="checkbox"
                                                    checked={selected.has(orphan.key)}
                                                    onChange={(event) => toggle([orphan.key], event.target.checked)}
                                                    className="h-4 w-4 accent-mp-accent"
                                                />
                                                <span className="flex-1 font-mono text-xs break-all text-mp-text-primary">
                                                    {orphan.key}
                                                </span>
                                                <span className="text-xs text-mp-text-muted">
                                                    {formatBytes(orphan.size)}
                                                </span>
                                            </label>
                                        </li>
                                    ))}
                                </ul>
                            </fieldset>
                        );
                    })
                )}
            </section>
        </div>
    );
}
