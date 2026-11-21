/**
 * Rappel des versions web manquantes
 *
 * Responsabilité : afficher, en tête des pages de l'admin, le nombre d'images locales qui n'ont pas
 * encore de versions web sur R2 (`/api/admin/web-images/status`), et lancer
 * `generate-web-images.mjs --upload` sur un seul domaine à la fois. Sur les pages d'un domaine, `scope`
 * limite le bandeau à ce domaine ; ailleurs, chaque domaine a son bouton. Sans ces versions, le site
 * sert les nouvelles images par le worker, qui renvoie l'original entier au-delà de 500 Ko.
 */

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';
import AdminProviders from './AdminProviders';
import ScriptConsole from './ScriptConsole';
import { useConfirm } from './ConfirmDialog';
import { useToast } from './Toast';

type WebImageScope = 'astro' | 'blog' | 'voyages';

interface WebImagesStatus {
    total: number;
    pending: number;
    totalByScope: Record<WebImageScope, number>;
    pendingByScope: Record<WebImageScope, number>;
    pendingSamples: string[];
}

const SCOPE_LABELS: Record<WebImageScope, string> = {
    astro: 'astrophotos',
    blog: 'blog',
    voyages: 'voyages',
};

const PANEL_ID = 'web-images';

/** Événement `window` à émettre quand un autre îlot de l'admin a mis à jour les versions web. */
export const WEB_IMAGES_CHANGED_EVENT = 'admin:web-images-changed';

/**
 * Bandeau de rappel, avec ses propres fournisseurs de toast et de confirmation (îlot autonome).
 *
 * @param props.scope - Domaine de la page ; absent, le bandeau propose un bouton par domaine.
 * @returns Le bandeau, ou rien tant que l'état n'est pas chargé.
 */
export default function WebImagesReminder({ scope }: { scope?: WebImageScope }) {
    return (
        <AdminProviders>
            <WebImagesReminderInner scope={scope} />
        </AdminProviders>
    );
}

function WebImagesReminderInner({ scope }: { scope?: WebImageScope }) {
    const toast = useToast();
    const confirm = useConfirm();
    const [status, setStatus] = useState<WebImagesStatus | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [runArgs, setRunArgs] = useState<string[] | null>(null);
    const [runNonce, setRunNonce] = useState(0);
    const [isRunning, setIsRunning] = useState(false);

    const fetchStatus = useCallback(async () => {
        setError(null);
        try {
            const response = await fetch('/api/admin/web-images/status');
            if (!response.ok) throw new Error(`Erreur HTTP ${response.status}`);
            setStatus((await response.json()) as WebImagesStatus);
        } catch (fetchError) {
            setError((fetchError as Error).message);
        }
    }, []);

    useEffect(() => {
        fetchStatus();
        window.addEventListener(WEB_IMAGES_CHANGED_EVENT, fetchStatus);
        return () => window.removeEventListener(WEB_IMAGES_CHANGED_EVENT, fetchStatus);
    }, [fetchStatus]);

    const visibleScopes = status ? (scope ? [scope] : (Object.keys(status.pendingByScope) as WebImageScope[])) : [];
    const pendingScopes = visibleScopes.filter((visibleScope) => status!.pendingByScope[visibleScope] > 0);
    const pendingCount = pendingScopes.reduce((sum, pendingScope) => sum + status!.pendingByScope[pendingScope], 0);
    const totalCount = visibleScopes.reduce((sum, visibleScope) => sum + status!.totalByScope[visibleScope], 0);
    const panelId = `${PANEL_ID}-${scope ?? 'all'}`;

    const handleGenerate = async (targetScope: WebImageScope) => {
        const args = [`--only=${targetScope}`];
        const ok = await confirm({
            title: 'Générer et envoyer les versions web ?',
            message: (
                <div className="space-y-3 text-sm leading-relaxed text-mp-text-secondary">
                    <p>
                        Le script crée les versions 400, 800 et 1200 px des images sans version web, les envoie sur R2
                        sous <strong>web/</strong> (les originaux ne sont pas touchés), puis met à jour{' '}
                        <strong>src/data/web-images.json</strong>.
                    </p>
                    <div className="rounded-sm border border-mp-accent/20 bg-mp-accent/5 p-3 font-mono text-xs text-mp-accent">
                        $ node scripts/build/generate-web-images.mjs --upload {args.join(' ')}
                    </div>
                </div>
            ),
            confirmLabel: 'Générer et envoyer',
        });
        if (!ok) return;
        setRunArgs(args);
        setIsRunning(true);
        setRunNonce((nonce) => nonce + 1);
    };

    const handleExit = (code: number | null) => {
        setIsRunning(false);
        if (code === 0) {
            toast.success('Pensez à committer src/data/web-images.json pour que le site les utilise.', {
                title: 'Versions web envoyées',
            });
        } else {
            toast.error('Le script a renvoyé une erreur : consultez la console ci-dessous.', {
                title: 'Échec des versions web',
            });
        }
        fetchStatus();
    };

    if (error) {
        return (
            <div className="mb-6 rounded-lg border border-mp-border bg-mp-bg-secondary p-4 text-xs text-mp-text-muted">
                État des versions web indisponible ({error}).
            </div>
        );
    }
    if (!status) return null;

    return (
        <div className="mb-6 flex flex-col gap-3">
            {pendingCount > 0 ? (
                <div
                    role="status"
                    className="flex flex-col gap-3 rounded-lg border border-mp-accent/30 bg-mp-accent/5 p-4 text-sm text-mp-text-body sm:flex-row sm:items-center sm:justify-between"
                >
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-mp-accent" aria-hidden="true" />
                        <div>
                            <p className="font-semibold text-mp-text-heading">
                                {pendingCount} image{pendingCount > 1 ? 's' : ''} sans version web
                            </p>
                            <p className="text-xs text-mp-text-muted">
                                {pendingScopes
                                    .map(
                                        (pendingScope) =>
                                            `${SCOPE_LABELS[pendingScope]} : ${status.pendingByScope[pendingScope]}`,
                                    )
                                    .join(' · ')}
                                . Sans elles, le site sert l’original entier.
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {pendingScopes.map((pendingScope) => (
                            <button
                                key={pendingScope}
                                type="button"
                                onClick={() => handleGenerate(pendingScope)}
                                disabled={isRunning}
                                className="inline-flex min-h-touch items-center justify-center gap-2 rounded-md bg-mp-accent px-4 text-sm font-semibold text-mp-bg transition-opacity hover:opacity-90 disabled:opacity-50"
                            >
                                <RefreshCw
                                    className={`h-4 w-4 ${isRunning ? 'motion-safe:animate-spin' : ''}`}
                                    aria-hidden="true"
                                />
                                {isRunning
                                    ? 'En cours…'
                                    : scope
                                      ? 'Générer et envoyer'
                                      : `Générer et envoyer : ${SCOPE_LABELS[pendingScope]}`}
                            </button>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="flex items-center gap-2 text-xs text-mp-text-muted">
                    <CheckCircle className="h-4 w-4 text-mp-accent" aria-hidden="true" />
                    Toutes les images ({totalCount}) ont leurs versions web.
                </div>
            )}

            {runArgs && (
                <ScriptConsole
                    runId="generate-web-images"
                    args={runArgs}
                    runNonce={runNonce}
                    panelId={panelId}
                    onExit={handleExit}
                    onClose={() => {
                        setRunArgs(null);
                        setIsRunning(false);
                        sessionStorage.removeItem(`script-console-${panelId}`);
                    }}
                />
            )}
        </div>
    );
}
