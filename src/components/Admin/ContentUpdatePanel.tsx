/**
 * Bouton de mise à jour d'un domaine de contenu (blog ou voyages)
 *
 * Responsabilité : lancer, après confirmation, `scripts/pipeline/update-content.mjs` sur le seul domaine
 * de la page et afficher sa console. Les textes manquants sont affichés par `ContentGapsPanel.tsx`, que la fin
 * d'exécution rafraîchit (`WEB_IMAGES_CHANGED_EVENT`). Îlot autonome, avec ses propres fournisseurs.
 */

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import AdminProviders from './AdminProviders';
import ScriptConsole from './ScriptConsole';
import { useConfirm } from './ConfirmDialog';
import { useToast } from './Toast';
import { WEB_IMAGES_CHANGED_EVENT } from './WebImagesReminder';

type ContentScope = 'blog' | 'voyages';

const SCOPE_LABELS: Record<ContentScope, string> = { blog: 'du blog', voyages: 'des voyages' };

/**
 * Lit l'exécution sauvegardée, pour restaurer la console après un F5 comme les autres panneaux.
 *
 * @param panelId - Identifiant du panneau.
 * @returns Le numéro d'exécution sauvegardé, ou `null` s'il n'y en a pas.
 */
function readSavedNonce(panelId: string): number | null {
    try {
        const saved = JSON.parse(sessionStorage.getItem(`script-console-${panelId}`) ?? 'null');
        return saved?.runId ? (saved.runNonce ?? 0) : null;
    } catch {
        // POURQUOI : état sauvegardé corrompu, on repart d'une console vierge.
        return null;
    }
}

/**
 * Bouton et console de mise à jour.
 *
 * @param props.scope - Domaine de la page.
 * @returns Le panneau.
 */
export default function ContentUpdatePanel({ scope }: { scope: ContentScope }) {
    return (
        <AdminProviders>
            <ContentUpdatePanelInner scope={scope} />
        </AdminProviders>
    );
}

function ContentUpdatePanelInner({ scope }: { scope: ContentScope }) {
    const toast = useToast();
    const confirm = useConfirm();
    const runId = `update-${scope}`;
    const panelId = `update-${scope}`;
    const [savedNonce] = useState(() => readSavedNonce(panelId));
    const [isOpen, setIsOpen] = useState(savedNonce !== null);
    const [isRunning, setIsRunning] = useState(false);
    const [runNonce, setRunNonce] = useState(savedNonce ?? 0);
    const handleRun = async () => {
        const ok = await confirm({
            title: `Mettre à jour les images ${SCOPE_LABELS[scope]} ?`,
            message: (
                <div className="space-y-3 text-sm leading-relaxed text-mp-text-secondary">
                    <p>
                        Envoie sur R2 les fichiers absents ou modifiés, puis met à jour les dimensions et les versions
                        web. Rien n’est supprimé, et seul ce domaine est concerné. Les alts et les descriptions SEO
                        manquants sont seulement signalés : ils s’écrivent via Claude Code.
                    </p>
                    <div className="rounded-sm border border-mp-accent/20 bg-mp-accent/5 p-3 font-mono text-xs text-mp-accent">
                        $ node scripts/pipeline/update-content.mjs --scope={scope}
                    </div>
                </div>
            ),
            confirmLabel: 'Lancer',
        });
        if (!ok) return;
        setIsOpen(true);
        setIsRunning(true);
        setRunNonce((nonce) => nonce + 1);
    };

    const handleExit = (code: number | null) => {
        setIsRunning(false);
        window.dispatchEvent(new Event(WEB_IMAGES_CHANGED_EVENT));
        if (code === 0) {
            toast.success('Pensez à committer les fichiers listés dans la console.', { title: 'Mise à jour terminée' });
        } else {
            toast.error('Voir le détail dans la console.', { title: 'Mise à jour incomplète' });
        }
    };

    return (
        <div className="mb-6 flex flex-col gap-3">
            <div className="flex justify-end">
                <button
                    type="button"
                    onClick={handleRun}
                    disabled={isRunning}
                    className="inline-flex min-h-touch items-center justify-center gap-2 rounded-md bg-mp-accent px-4 text-sm font-semibold text-mp-bg transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                    <RefreshCw
                        className={`h-4 w-4 ${isRunning ? 'motion-safe:animate-spin' : ''}`}
                        aria-hidden="true"
                    />
                    {isRunning ? 'Mise à jour en cours…' : `Mettre à jour les images ${SCOPE_LABELS[scope]}`}
                </button>
            </div>
            {isOpen && (
                <ScriptConsole
                    runId={runId}
                    runNonce={runNonce}
                    panelId={panelId}
                    onExit={handleExit}
                    onClose={() => {
                        setIsOpen(false);
                        sessionStorage.removeItem(`script-console-${panelId}`);
                    }}
                />
            )}
        </div>
    );
}
