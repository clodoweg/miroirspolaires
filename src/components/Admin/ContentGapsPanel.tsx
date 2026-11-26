/**
 * Textes manquants du blog ou des voyages (alts, descriptions SEO), article par article.
 *
 * Responsabilité : lire `/api/admin/content-gaps` (disque en local, branche dev à distance), dire s'il reste des
 * textes à écrire, donner la commande Claude Code à lancer et le détail par contenu. Le panneau se relit quand une
 * mise à jour des images se termine (`WEB_IMAGES_CHANGED_EVENT`).
 *
 * POURQUOI rien n'est généré ici : sans le récit, un modèle se trompe de lieu ou de sujet ; ces textes s'écrivent
 * dans Claude Code (`/generate-alts`, `/generate-seo`).
 */
import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import ClaudeCodeNotice from './ClaudeCodeNotice';
import { WEB_IMAGES_CHANGED_EVENT } from './WebImagesReminder';
import type { ContentGaps, ContentGapsScope } from '@/lib/admin/content-gaps-reader';

/**
 * Décrit les textes manquants.
 *
 * @param gaps - Textes manquants du domaine.
 * @returns La phrase à afficher, vide si rien ne manque.
 */
export function describeGaps({
    missingAltCount,
    missingSeo,
}: Pick<ContentGaps, 'missingAltCount' | 'missingSeo'>): string {
    const parts = [];
    if (missingSeo.length > 0) {
        parts.push(`${missingSeo.length} description${missingSeo.length > 1 ? 's' : ''} SEO manquante(s)`);
    }
    if (missingAltCount > 0) parts.push(`${missingAltCount} image(s) sans alt`);
    return parts.join(' et ');
}

type LoadState = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; gaps: ContentGaps };

/**
 * Panneau des textes manquants d'un domaine.
 *
 * @param props.scope - Domaine de la page.
 * @returns Le panneau.
 */
export default function ContentGapsPanel({ scope }: { scope: ContentGapsScope }) {
    const [state, setState] = useState<LoadState>({ kind: 'loading' });
    const [version, setVersion] = useState(0);

    useEffect(() => {
        const reload = () => setVersion((current) => current + 1);
        window.addEventListener(WEB_IMAGES_CHANGED_EVENT, reload);
        return () => window.removeEventListener(WEB_IMAGES_CHANGED_EVENT, reload);
    }, []);

    useEffect(() => {
        let cancelled = false;
        fetch(`/api/admin/content-gaps?scope=${scope}`)
            .then(async (response) => {
                const body = (await response.json().catch(() => ({}))) as ContentGaps & { error?: string };
                if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
                return body;
            })
            .then((gaps) => {
                if (!cancelled) setState({ kind: 'ready', gaps });
            })
            .catch((error: unknown) => {
                if (!cancelled) setState({ kind: 'error', message: String((error as Error).message ?? error) });
            });
        return () => {
            cancelled = true;
        };
    }, [scope, version]);

    if (state.kind === 'loading') {
        return (
            <p className="flex items-center gap-2 text-sm text-mp-text-muted">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Recherche des textes manquants…
            </p>
        );
    }
    if (state.kind === 'error') {
        return (
            <p className="text-sm text-red-700 dark:text-red-400">Textes manquants indisponibles : {state.message}</p>
        );
    }

    const { gaps } = state;
    const message = describeGaps(gaps);
    if (!message) {
        return (
            <p role="status" className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Tous les alts et descriptions SEO sont écrits.
            </p>
        );
    }

    const commands = [
        ...(gaps.missingAltCount > 0 ? [`/generate-alts ${scope}`] : []),
        ...(gaps.missingSeo.length > 0 ? [`/generate-seo ${scope}`] : []),
    ];
    const entries = [...new Set([...Object.keys(gaps.missingAltsByEntry), ...gaps.missingSeo])].sort().reverse();

    return (
        <section className="flex flex-col gap-3">
            <ClaudeCodeNotice message={message} commands={commands} />
            <div className="overflow-x-auto rounded-xl border border-mp-glass-border">
                <table className="w-full min-w-[480px] text-sm">
                    <thead>
                        <tr className="text-left text-xs text-mp-text-muted">
                            <th scope="col" className="px-4 py-2 font-medium">
                                Contenu
                            </th>
                            <th scope="col" className="px-4 py-2 font-medium">
                                Images sans alt
                            </th>
                            {scope === 'voyages' && (
                                <th scope="col" className="px-4 py-2 font-medium">
                                    Description SEO
                                </th>
                            )}
                        </tr>
                    </thead>
                    <tbody>
                        {entries.map((entry) => (
                            <tr key={entry} className="border-t border-mp-glass-border/60">
                                <td className="px-4 py-2 font-mono text-xs text-mp-text-primary">{entry}</td>
                                <td className="px-4 py-2 text-mp-text-secondary">
                                    {gaps.missingAltsByEntry[entry] ?? 0}
                                </td>
                                {scope === 'voyages' && (
                                    <td className="px-4 py-2 text-mp-text-secondary">
                                        {gaps.missingSeo.includes(entry) ? 'manquante' : 'ok'}
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}
