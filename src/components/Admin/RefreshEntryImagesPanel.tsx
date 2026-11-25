/**
 * « Une image a été remplacée ? » : régénère les versions web d'un seul article ou voyage (admin local).
 *
 * Responsabilité : choisir l'article ou le voyage, puis lancer, après confirmation, l'entrée `refresh-web-images`
 * de `SCRIPTS` (`generate-web-images.mjs --force --upload --purge`) limitée à son dossier (`--only`, `--prefix`).
 *
 * POURQUOI : le renvoi d'une image sous le même nom la remet sur R2 et purge le cache du worker, mais ses versions
 * web ne sont refaites que si elles manquent ; sans ce bouton, il faudrait tout régénérer.
 */
import { useEffect, useId, useState } from 'react';
import AdminProviders from './AdminProviders';
import { useConfirm } from './ConfirmDialog';
import ScriptConsole from './ScriptConsole';
import { useToast } from './Toast';

type Scope = 'blog' | 'voyages';

interface Entry {
    year: string;
    slug: string;
    title?: string;
}

const LIST_URLS: Record<Scope, string> = { blog: '/api/admin/posts', voyages: '/api/admin/voyages' };

/**
 * Arguments du script pour une entrée.
 *
 * @param scope - Domaine.
 * @param entry - `<année>/<slug>`.
 * @returns Les arguments `--only` et `--prefix`.
 */
export function refreshArgs(scope: Scope, entry: string): string[] {
    return [`--only=${scope}`, `--prefix=${scope}/${entry}/`];
}

export default function RefreshEntryImagesPanel({ scope }: { scope: Scope }) {
    return (
        <AdminProviders>
            <RefreshEntryImagesInner scope={scope} />
        </AdminProviders>
    );
}

function RefreshEntryImagesInner({ scope }: { scope: Scope }) {
    const toast = useToast();
    const confirm = useConfirm();
    const selectId = useId();
    const [entries, setEntries] = useState<Entry[]>([]);
    const [selected, setSelected] = useState('');
    const [run, setRun] = useState<{ nonce: number; args: string[] } | null>(null);

    useEffect(() => {
        let cancelled = false;
        fetch(LIST_URLS[scope])
            .then((response) => (response.ok ? (response.json() as Promise<Entry[]>) : []))
            .then((list) => {
                if (!cancelled)
                    setEntries([...list].sort((a, b) => `${b.year}/${b.slug}`.localeCompare(`${a.year}/${a.slug}`)));
            })
            .catch(() => {
                // POURQUOI : liste secondaire ; sans elle, le bouton reste simplement inutilisable.
            });
        return () => {
            cancelled = true;
        };
    }, [scope]);

    const start = async () => {
        const accepted = await confirm({
            title: 'Régénérer les versions web de ce dossier ?',
            message: `Les versions web de ${scope}/${selected}/ sont refaites et réécrites sur R2, puis le cache du worker est purgé. Commit ensuite src/data/web-images.json.`,
            confirmLabel: 'Régénérer',
        });
        if (!accepted) return;
        setRun((previous) => ({ nonce: (previous?.nonce ?? 0) + 1, args: refreshArgs(scope, selected) }));
    };

    return (
        <section className="mt-8 flex flex-col gap-3 rounded-xl border border-dashed border-mp-border-light p-4">
            <h2 className="font-semibold text-mp-text-heading">Une image a été remplacée sous le même nom ?</h2>
            <p className="text-sm text-mp-text-secondary">
                L’enregistrement la renvoie sur R2 et purge le cache du worker, mais ses versions web restent anciennes
                : régénère-les pour ce seul dossier.
            </p>
            <div className="flex flex-wrap items-center gap-3">
                <label htmlFor={selectId} className="text-sm text-mp-text-secondary">
                    {scope === 'blog' ? 'Article' : 'Voyage'}
                </label>
                <select
                    id={selectId}
                    value={selected}
                    onChange={(event) => setSelected(event.target.value)}
                    className="admin-input max-w-md"
                >
                    <option value="">Choisir…</option>
                    {entries.map((entry) => (
                        <option key={`${entry.year}/${entry.slug}`} value={`${entry.year}/${entry.slug}`}>
                            {entry.year} · {entry.title || entry.slug}
                        </option>
                    ))}
                </select>
                <button
                    type="button"
                    disabled={!selected}
                    onClick={() => void start()}
                    className="min-h-touch rounded-md border border-mp-border-accent px-4 text-sm text-mp-accent disabled:opacity-50"
                >
                    Régénérer
                </button>
            </div>
            {run && (
                <ScriptConsole
                    runId="refresh-web-images"
                    args={run.args}
                    runNonce={run.nonce}
                    panelId={`refresh-web-images-${scope}`}
                    onExit={(code) => {
                        if (code === 0)
                            toast.success('Pensez à committer src/data/web-images.json.', {
                                title: 'Versions web refaites',
                            });
                        else toast.error('Voir le détail dans la console.', { title: 'Régénération incomplète' });
                    }}
                    onClose={() => setRun(null)}
                />
            )}
        </section>
    );
}
