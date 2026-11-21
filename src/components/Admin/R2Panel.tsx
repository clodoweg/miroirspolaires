import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Cloud, HardDrive, RefreshCw, CheckCircle, AlertTriangle, ArrowDown, ArrowUp } from 'lucide-react';
import AdminProviders from './AdminProviders';
import PageHeader from './PageHeader';
import ScriptConsole from './ScriptConsole';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmDialog';

interface CategoryStats {
    files: number;
    size: number;
    hasNewerLocal?: boolean;
    hasMissingR2?: boolean;
    hasMissingLocal?: boolean;
    isIdentical?: boolean;
}

interface R2StatusPayload {
    local: {
        totalFiles: number;
        totalSize: number;
        categories: Record<string, CategoryStats>;
    };
    r2: {
        totalFiles: number;
        totalSize: number;
        categories: Record<string, CategoryStats>;
    };
}

/**
 * Composant de tableau de bord principal pour la console de gestion Cloudflare R2 & Assets.
 * Enveloppe le panneau interactif dans les fournisseurs de contexte d'administration.
 *
 * @returns {JSX.Element} Le panneau R2 complet enveloppé de ses contextes.
 */
export default function R2Panel() {
    return (
        <AdminProviders>
            <R2PanelInner />
        </AdminProviders>
    );
}

function R2PanelInner() {
    const toast = useToast();
    const confirm = useConfirm();

    const [status, setStatus] = useState<R2StatusPayload | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Dynamic execution state
    const [isRunning, setIsRunning] = useState(false);
    const [runId, setRunId] = useState<string | null>(null);
    const [runArgs, setRunArgs] = useState<string[]>([]);
    const [runNonce, setRunNonce] = useState(0);
    const fieldId = useId();

    // Download form states
    // POURQUOI : chaque action porte sur un seul dossier, jamais sur tous les domaines à la fois.
    const [downloadFolder, setDownloadFolder] = useState<string>('astrophotographies');
    const [downloadForce, setDownloadForce] = useState<boolean>(false);
    const [downloadSkipRaw, setDownloadSkipRaw] = useState<boolean>(true);

    // Upload form states
    const [uploadFolder, setUploadFolder] = useState<string>('astrophotographies');
    const [uploadForce, setUploadForce] = useState<boolean>(false);
    const [uploadDeleteFirst, setUploadDeleteFirst] = useState<boolean>(false);

    // Fetch live status mapping
    const fetchStatus = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/admin/r2/status');
            if (!res.ok) {
                throw new Error(`Erreur HTTP ${res.status}`);
            }
            const data: R2StatusPayload = await res.json();
            setStatus(data);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const saved = sessionStorage.getItem('script-console-r2');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (parsed.runId) {
                    setRunId(parsed.runId);
                    setRunArgs(parsed.args || []);
                    setRunNonce(parsed.runNonce || 0);
                }
            } catch {
                // POURQUOI : état sauvegardé corrompu, on repart d'une console vierge.
            }
        }
        fetchStatus();
    }, [fetchStatus]);

    const formatSize = (bytes: number): string => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const handleRunDownload = async () => {
        const folderLabel = `le dossier "${downloadFolder}"`;
        const args: string[] = [downloadFolder];
        if (downloadForce) args.push('--force');
        if (downloadSkipRaw) args.push('--skip-raw');

        const ok = await confirm({
            title: `Lancer le téléchargement depuis R2 ?`,
            message: (
                <div className="space-y-3 text-sm leading-relaxed text-mp-text-secondary">
                    <p>
                        Cette action va rapatrier les fichiers depuis Cloudflare R2 vers votre stockage local pour{' '}
                        <strong>{folderLabel}</strong>.
                    </p>
                    <div className="rounded-sm border border-mp-accent/20 bg-mp-accent/5 p-3 font-mono text-xs text-mp-accent">
                        $ node scripts/r2/download_r2_to_local.js {args.join(' ')}
                    </div>
                </div>
            ),
            confirmLabel: 'Lancer le téléchargement',
        });

        if (!ok) return;

        setRunId('download-r2');
        setRunArgs(args);
        setIsRunning(true);
        setRunNonce((n) => n + 1);
    };

    const handleRunUpload = async () => {
        const folderLabel = `le dossier "${uploadFolder}"`;
        const args: string[] = [uploadFolder];
        if (uploadForce) args.push('--force');

        const targetScript = uploadDeleteFirst ? 'mirror-r2' : 'upload-missing-r2';
        const commandPreview = uploadDeleteFirst
            ? `node scripts/r2/upload_local_to_r2.js --delete-first ${args.join(' ')}`
            : `node scripts/r2/upload_local_to_r2.js --incremental ${args.join(' ')}`;

        const warningMsg = uploadDeleteFirst
            ? "⚠️ ATTENTION : L'option 'Delete first' videra préalablement les dossiers distants correspondants sur R2 avant de renvoyer le contenu local."
            : 'Les fichiers locaux manquants ou modifiés seront envoyés vers R2 de manière incrémentale.';

        const ok = await confirm({
            title: `Lancer l'envoi vers R2 ?`,
            message: (
                <div className="space-y-3 text-sm leading-relaxed text-mp-text-secondary">
                    <p>
                        Cette action va envoyer vos médias locaux vers Cloudflare R2 pour <strong>{folderLabel}</strong>
                        .
                    </p>
                    <p className="text-xs font-semibold text-amber-400">{warningMsg}</p>
                    <div className="rounded-sm border border-mp-accent/20 bg-mp-accent/5 p-3 font-mono text-xs text-mp-accent">
                        $ {commandPreview}
                    </div>
                </div>
            ),
            confirmLabel: "Lancer l'envoi",
        });

        if (!ok) return;

        setRunId(targetScript);
        setRunArgs(args);
        setIsRunning(true);
        setRunNonce((n) => n + 1);
    };

    const handleExit = (code: number | null) => {
        setIsRunning(false);
        if (code === 0) {
            let title = 'Synchronisation réussie';
            let msg = "L'opération R2 s'est terminée avec succès. Les volumes ont été actualisés.";

            // POURQUOI: Permet d'afficher des messages de succès spécifiques et haut de gamme
            // pour les actions de préchauffage (warm) et de purge (purge) exécutées sur un dossier.
            if (runId === 'warm-cache') {
                title = 'Préchauffage CDN réussi';
                msg = 'Le cache CDN a été entièrement préchauffé pour le dossier sélectionné.';
            } else if (runId === 'purge-cache') {
                title = 'Purge CDN réussie';
                msg = 'Le cache CDN a été purgé avec succès pour le dossier sélectionné.';
            }

            toast.success(msg, { title });
            fetchStatus();
        } else {
            toast.error('Le script a renvoyé une erreur. Veuillez consulter la console ci-dessous.', {
                title: "Échec de l'opération",
            });
        }
    };

    const handleDeleteR2 = async (folder: string) => {
        const ok = await confirm({
            title: `Supprimer le dossier R2 ?`,
            message: (
                <div className="space-y-3 text-sm leading-relaxed text-mp-text-secondary">
                    <p>
                        Cette action va supprimer définitivement TOUT le contenu du répertoire distant{' '}
                        <strong>"{folder}"</strong> dans le bucket Cloudflare R2.
                    </p>
                    <p className="text-xs font-semibold text-red-400">
                        ⚠️ Attention : Cette opération est irréversible et supprimera tous les fichiers associés sur R2.
                    </p>
                </div>
            ),
            confirmLabel: 'Supprimer du R2',
        });

        if (!ok) return;

        try {
            setLoading(true);
            const res = await fetch('/api/admin/r2/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ target: 'r2', folder }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || `Erreur HTTP ${res.status}`);
            }

            toast.success(`Le dossier R2 "${folder}" a été vidé.`, { title: 'Suppression R2 réussie' });
            fetchStatus();
        } catch (e) {
            toast.error((e as Error).message, { title: 'Échec de la suppression R2' });
            setLoading(false);
        }
    };

    const handleDeleteLocal = async (folder: string) => {
        const ok = await confirm({
            title: `Supprimer le dossier local ?`,
            message: (
                <div className="space-y-3 text-sm leading-relaxed text-mp-text-secondary">
                    <p>
                        Cette action va supprimer définitivement le répertoire local <strong>"{folder}"</strong> et ses
                        sous-dossiers de votre disque local.
                    </p>
                    <p className="text-xs font-semibold text-red-400">
                        ⚠️ Attention : Les fichiers locaux associés seront définitivement perdus.
                    </p>
                </div>
            ),
            confirmLabel: 'Supprimer localement',
        });

        if (!ok) return;

        try {
            setLoading(true);
            const res = await fetch('/api/admin/r2/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ target: 'local', folder }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || `Erreur HTTP ${res.status}`);
            }

            toast.success(`Le dossier local "${folder}" a été supprimé.`, { title: 'Suppression locale réussie' });
            fetchStatus();
        } catch (e) {
            toast.error((e as Error).message, { title: 'Échec de la suppression locale' });
            setLoading(false);
        }
    };

    /**
     * Déclenche l'exécution du script de préchauffage du cache CDN (warm-cache.mjs)
     * pour un répertoire spécifique de médias.
     *
     * POURQUOI: Permet de réchauffer sélectivement un dossier sans surcharger le CDN
     * et l'origine avec toutes les catégories.
     *
     * Options disponibles dans le script warm-cache.mjs:
     * - `[folder]` : Nom du sous-dossier à réchauffer (ex: 'blog', 'astrophotographies/ciel-profond')
     * - `--force`  : Optionnel. Force le préchauffage même si déjà considéré comme chaud.
     *
     * Exemple d'utilisation dans la console:
     *   handleWarmFolder('blog/2025') -> lance le script avec l'argument correspondant.
     *
     * @param {string} folder - Le chemin relatif du dossier cible (ex: 'blog').
     * @returns {Promise<void>}
     */
    const handleWarmFolder = async (folder: string): Promise<void> => {
        const ok = await confirm({
            title: `Réchauffer le CDN pour ce dossier ?`,
            message: (
                <div className="space-y-3 text-sm leading-relaxed text-mp-text-secondary">
                    <p>
                        Cette action va interroger systématiquement le CDN Cloudflare pour toutes les variantes d'images
                        sous le répertoire <strong>"{folder}"</strong> afin de remplir le cache.
                    </p>
                    <div className="rounded-sm border border-mp-accent/20 bg-mp-accent/5 p-3 font-mono text-xs text-mp-accent">
                        $ node scripts/r2/warm-cache.mjs {folder}
                    </div>
                </div>
            ),
            confirmLabel: 'Lancer le préchauffage',
        });

        if (!ok) return;

        setRunId('warm-cache');
        setRunArgs([folder]);
        setIsRunning(true);
        setRunNonce((n) => n + 1);
    };

    /**
     * Déclenche l'exécution du script de purge du cache (purge-cache.mjs)
     * pour un répertoire spécifique de médias.
     *
     * POURQUOI: Permet de vider sélectivement le cache d'images du Worker sans invalider
     * tout le reste du site. Demande une confirmation car le premier accès suivant
     * subira une pénalité de latence lors de la régénération à la volée.
     *
     * Options disponibles dans le script purge-cache.mjs:
     * - `[folder]` : Nom du sous-dossier à purger (ex: 'blog', 'astrophotographies/systeme-solaire')
     *
     * Exemple d'utilisation dans la console:
     *   handlePurgeFolder('voyages') -> purge les variantes du cache associées.
     *
     * @param {string} folder - Le chemin relatif du dossier cible (ex: 'voyages').
     * @returns {Promise<void>}
     */
    const handlePurgeFolder = async (folder: string): Promise<void> => {
        const ok = await confirm({
            title: `Purger le cache CDN pour ce dossier ?`,
            message: (
                <div className="space-y-3 text-sm leading-relaxed text-mp-text-secondary">
                    <p>
                        Cette action va envoyer des requêtes de purge de cache au Worker d'images pour toutes les images
                        du répertoire local <strong>"{folder}"</strong>.
                    </p>
                    <p className="text-xs font-semibold text-amber-400">
                        ⚠️ Attention : Le premier chargement ultérieur de ces images sera ralenti le temps de
                        reconstruire le cache.
                    </p>
                    <div className="rounded-sm border border-mp-accent/20 bg-mp-accent/5 p-3 font-mono text-xs text-mp-accent">
                        $ node scripts/r2/purge-cache.mjs {folder}
                    </div>
                </div>
            ),
            confirmLabel: 'Purger le cache',
        });

        if (!ok) return;

        setRunId('purge-cache');
        setRunArgs([folder]);
        setIsRunning(true);
        setRunNonce((n) => n + 1);
    };

    // Calculate dynamic sync completeness rate
    const syncStatus = useMemo(() => {
        if (!status) return null;
        const keys = new Set([...Object.keys(status.local.categories), ...Object.keys(status.r2.categories)]);
        const matches: Record<string, boolean> = {};
        for (const key of keys) {
            const loc = status.local.categories[key] || { files: 0, size: 0 };
            const r2c = status.r2.categories[key] || { files: 0, size: 0 };
            matches[key] = loc.files === r2c.files && loc.size === r2c.size;
        }
        const allMatch = Object.values(matches).every(Boolean);
        return { matches, allMatch };
    }, [status]);

    const categoriesKeys = useMemo(() => {
        if (!status) return [];
        const keys = new Set([...Object.keys(status.local.categories), ...Object.keys(status.r2.categories)]);
        return Array.from(keys).sort();
    }, [status]);

    if (loading && !status) {
        return (
            <div className="flex h-64 items-center justify-center">
                <span className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-mp-accent border-t-transparent" />
            </div>
        );
    }

    if (error || !status) {
        return (
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-6 text-center text-red-400">
                <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-red-500" />
                <h3 className="mb-2 font-serif text-lg font-bold">Impossible de se connecter à Cloudflare R2</h3>
                <p className="mb-4 text-xs">{error || 'Une erreur de communication est survenue.'}</p>
                <button
                    onClick={fetchStatus}
                    className="rounded-md border border-mp-accent bg-mp-accent px-4 py-2 text-xs font-semibold text-mp-ui-black hover:opacity-90"
                >
                    Réessayer
                </button>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6 pb-12">
            <PageHeader
                breadcrumb={[{ label: 'Admin', href: '/admin' }, { label: 'Cloudflare R2' }]}
                title="Synchronisation & Stockage R2"
                description="Visualisez l'alignement entre le stockage de médias locaux et le bucket Cloudflare R2, et pilotez les tâches de transfert."
            />

            {runId && (
                <div className="flex flex-col gap-3">
                    {isRunning && (
                        <div className="rounded-lg border border-mp-accent/20 bg-mp-accent/5 p-4 text-xs leading-relaxed text-mp-accent">
                            <strong>Synchronisation en cours de traitement :</strong> Le script interagit avec
                            Cloudflare R2. Ne fermez pas cette page. Les volumes locaux et distants seront
                            automatiquement recalculés à la fin du processus.
                        </div>
                    )}
                    <ScriptConsole
                        runId={runId}
                        args={runArgs}
                        runNonce={runNonce}
                        panelId="r2"
                        onExit={handleExit}
                        onClose={() => {
                            setRunId(null);
                            setRunArgs([]);
                            sessionStorage.removeItem('script-console-r2');
                        }}
                    />
                </div>
            )}

            {/* Synthese Globale */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {/* Carte Local */}
                <div className="flex items-center gap-4 rounded-xl border border-mp-glass-border bg-mp-glass-solid/40 p-5">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
                        <HardDrive className="h-5 w-5" />
                    </div>
                    <div>
                        <span className="font-mono text-[10px] tracking-wider text-mp-text-secondary uppercase">
                            Stockage Local
                        </span>
                        <div className="mt-1 font-serif text-2xl font-bold text-mp-text-heading">
                            {formatSize(status.local.totalSize)}
                        </div>
                        <p className="mt-0.5 text-[10px] text-mp-text-secondary">
                            {status.local.totalFiles} fichiers dans src/assets
                        </p>
                    </div>
                </div>

                {/* Carte R2 */}
                <div className="flex items-center gap-4 rounded-xl border border-mp-glass-border bg-mp-glass-solid/40 p-5">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400">
                        <Cloud className="h-5 w-5" />
                    </div>
                    <div>
                        <span className="font-mono text-[10px] tracking-wider text-mp-text-secondary uppercase">
                            Stockage Cloudflare R2
                        </span>
                        <div className="mt-1 font-serif text-2xl font-bold text-mp-text-heading">
                            {formatSize(status.r2.totalSize)}
                        </div>
                        <p className="mt-0.5 text-[10px] text-mp-text-secondary">
                            {status.r2.totalFiles} fichiers dans le bucket
                        </p>
                    </div>
                </div>

                {/* Alignement status */}
                <div
                    className={`flex items-center gap-4 rounded-xl border p-5 ${syncStatus?.allMatch ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400' : 'border-amber-500/20 bg-amber-500/5 text-amber-400'}`}
                >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
                        {syncStatus?.allMatch ? (
                            <CheckCircle className="h-5 w-5" />
                        ) : (
                            <AlertTriangle className="h-5 w-5" />
                        )}
                    </div>
                    <div>
                        <span className="font-mono text-[10px] tracking-wider text-mp-text-secondary uppercase">
                            Statut de Cohérence
                        </span>
                        <div className="mt-1 font-serif text-lg font-bold text-mp-text-heading">
                            {syncStatus?.allMatch ? 'Entièrement Synchrone' : 'Désalignements Détectés'}
                        </div>
                        <p className="mt-0.5 text-[10px] text-mp-text-secondary">
                            {syncStatus?.allMatch
                                ? 'Tous les fichiers R2 et locaux coïncident.'
                                : 'Certains volumes diffèrent.'}
                        </p>
                    </div>
                </div>
            </div>

            {/* Actions de Synchronisation */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {/* R2 -> Local (Download) */}
                <div className="flex flex-col gap-4 rounded-xl border border-mp-glass-border bg-mp-glass-solid/40 p-5">
                    <div className="flex items-center gap-2 border-b border-mp-glass-border/40 pb-2 font-serif text-base font-bold text-mp-text-heading">
                        <ArrowDown className="h-5 w-5 text-blue-400" />
                        Téléchargement : R2 ➔ Local
                    </div>
                    <p className="text-xs leading-relaxed text-mp-text-secondary">
                        Rapatrie les médias stockés en ligne sur Cloudflare R2 vers votre stockage local `src/assets`.
                        Pratique pour synchroniser un nouvel environnement de développement.
                    </p>

                    <div className="mt-2 flex flex-col gap-3.5">
                        <div>
                            <label
                                htmlFor={`${fieldId}-download-folder`}
                                className="mb-1.5 block font-mono text-[10px] tracking-wider text-mp-text-secondary uppercase"
                            >
                                Répertoire Cible
                            </label>
                            <select
                                id={`${fieldId}-download-folder`}
                                value={downloadFolder}
                                onChange={(e) => setDownloadFolder(e.target.value)}
                                className="admin-input font-mono"
                            >
                                {categoriesKeys.map((cat) => {
                                    const isSubDir = cat.includes('/');
                                    const displayLabel = isSubDir ? `↳ /${cat}` : `Dossier /${cat}`;
                                    const indent = isSubDir ? '\u00A0\u00A0\u00A0\u00A0' : '';
                                    return (
                                        <option key={cat} value={cat}>
                                            {indent}
                                            {displayLabel}
                                        </option>
                                    );
                                })}
                            </select>
                        </div>

                        <div className="mt-1 flex flex-col gap-2">
                            <label className="flex cursor-pointer items-center gap-2 select-none">
                                <input
                                    type="checkbox"
                                    checked={downloadForce}
                                    onChange={(e) => setDownloadForce(e.target.checked)}
                                    className="h-4 w-4 rounded-sm border-mp-glass-border bg-mp-ui-black/60 text-mp-accent focus:ring-0"
                                />
                                <span className="text-xs text-mp-text-primary">
                                    Écraser les fichiers locaux existants (`--force`)
                                </span>
                            </label>

                            <label className="flex cursor-pointer items-center gap-2 select-none">
                                <input
                                    type="checkbox"
                                    checked={downloadSkipRaw}
                                    onChange={(e) => setDownloadSkipRaw(e.target.checked)}
                                    className="h-4 w-4 rounded-sm border-mp-glass-border bg-mp-ui-black/60 text-mp-accent focus:ring-0"
                                />
                                <span className="text-xs text-mp-text-primary">
                                    Exclure les originaux RAW astrophotos (`--skip-raw`)
                                </span>
                            </label>
                        </div>
                    </div>

                    <button
                        type="button"
                        disabled={isRunning}
                        onClick={handleRunDownload}
                        className="mt-auto flex items-center justify-center gap-1.5 rounded-md border border-mp-accent bg-mp-accent px-4 py-2.5 text-xs font-semibold text-mp-ui-black hover:opacity-90 disabled:opacity-50"
                    >
                        <RefreshCw className={`h-4 w-4 ${isRunning ? 'animate-spin' : ''}`} />
                        Lancer le téléchargement
                    </button>
                </div>

                {/* Local -> R2 (Upload) */}
                <div className="flex flex-col gap-4 rounded-xl border border-mp-glass-border bg-mp-glass-solid/40 p-5">
                    <div className="flex items-center gap-2 border-b border-mp-glass-border/40 pb-2 font-serif text-base font-bold text-mp-text-heading">
                        <ArrowUp className="h-5 w-5 text-purple-400" />
                        Téléversement : Local ➔ R2
                    </div>
                    <p className="text-xs leading-relaxed text-mp-text-secondary">
                        Envoie vos médias locaux de `src/assets` vers le stockage Cloudflare R2. Idéal après avoir
                        rédigé de nouveaux articles ou inséré de nouvelles images astrophotos.
                    </p>

                    <div className="mt-2 flex flex-col gap-3.5">
                        <div>
                            <label
                                htmlFor={`${fieldId}-upload-folder`}
                                className="mb-1.5 block font-mono text-[10px] tracking-wider text-mp-text-secondary uppercase"
                            >
                                Répertoire Cible
                            </label>
                            <select
                                id={`${fieldId}-upload-folder`}
                                value={uploadFolder}
                                onChange={(e) => setUploadFolder(e.target.value)}
                                className="admin-input font-mono"
                            >
                                {categoriesKeys.map((cat) => {
                                    const isSubDir = cat.includes('/');
                                    const displayLabel = isSubDir ? `↳ /${cat}` : `Dossier /${cat}`;
                                    const indent = isSubDir ? '\u00A0\u00A0\u00A0\u00A0' : '';
                                    return (
                                        <option key={cat} value={cat}>
                                            {indent}
                                            {displayLabel}
                                        </option>
                                    );
                                })}
                            </select>
                        </div>

                        <div>
                            <span
                                id={`${fieldId}-upload-mode`}
                                className="mb-1.5 block font-mono text-[10px] tracking-wider text-mp-text-secondary uppercase"
                            >
                                Mode de Transfert
                            </span>
                            <div
                                role="radiogroup"
                                aria-labelledby={`${fieldId}-upload-mode`}
                                className="flex flex-col gap-2 rounded-lg border border-mp-glass-border bg-mp-ui-black/20 p-3"
                            >
                                <label className="flex cursor-pointer items-center gap-2.5 select-none">
                                    <input
                                        type="radio"
                                        name="uploadMode"
                                        checked={!uploadDeleteFirst}
                                        aria-labelledby={`${fieldId}-incremental-title`}
                                        aria-describedby={`${fieldId}-incremental-desc`}
                                        onChange={() => setUploadDeleteFirst(false)}
                                        className="h-4 w-4 border-mp-glass-border bg-mp-ui-black/60 text-mp-accent focus:ring-0"
                                    />
                                    <div className="text-xs">
                                        <div
                                            id={`${fieldId}-incremental-title`}
                                            className="font-semibold text-mp-text-primary"
                                        >
                                            Mode Incrémentiel (--incremental)
                                        </div>
                                        <div
                                            id={`${fieldId}-incremental-desc`}
                                            className="text-[10px] text-mp-text-muted"
                                        >
                                            Détecte et téléverse uniquement les nouveaux fichiers locaux (recommandé).
                                        </div>
                                    </div>
                                </label>

                                <div className="my-1 h-px bg-mp-glass-border/30"></div>

                                <label className="flex cursor-pointer items-center gap-2.5 select-none">
                                    <input
                                        type="radio"
                                        name="uploadMode"
                                        checked={uploadDeleteFirst}
                                        aria-labelledby={`${fieldId}-full-title`}
                                        aria-describedby={`${fieldId}-full-desc`}
                                        onChange={() => setUploadDeleteFirst(true)}
                                        className="h-4 w-4 border-mp-glass-border bg-mp-ui-black/60 text-mp-accent focus:ring-0"
                                    />
                                    <div className="text-xs">
                                        <div id={`${fieldId}-full-title`} className="font-semibold text-amber-400">
                                            Mode Complet (Effacement + Synchro)
                                        </div>
                                        <div id={`${fieldId}-full-desc`} className="text-[10px] text-mp-text-muted">
                                            Vide les dossiers distants avant d'envoyer le contenu local.
                                        </div>
                                    </div>
                                </label>
                            </div>
                        </div>

                        <div className="mt-1 flex flex-col gap-2">
                            <label
                                className={`flex items-center gap-2 select-none ${uploadDeleteFirst ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
                            >
                                <input
                                    type="checkbox"
                                    checked={uploadForce && !uploadDeleteFirst}
                                    onChange={(e) => setUploadForce(e.target.checked)}
                                    disabled={uploadDeleteFirst}
                                    className="h-4 w-4 rounded-sm border-mp-glass-border bg-mp-ui-black/60 text-mp-accent focus:ring-0"
                                />
                                <span className="text-xs text-mp-text-primary">
                                    Forcer l'envoi même si identique (`--force`)
                                </span>
                            </label>
                        </div>
                    </div>

                    <button
                        type="button"
                        disabled={isRunning}
                        onClick={handleRunUpload}
                        className="mt-auto flex items-center justify-center gap-1.5 rounded-md border border-mp-accent bg-mp-accent px-4 py-2.5 text-xs font-semibold text-mp-ui-black hover:opacity-90 disabled:opacity-50"
                    >
                        <RefreshCw className={`h-4 w-4 ${isRunning ? 'animate-spin' : ''}`} />
                        Lancer le téléversement
                    </button>
                </div>
            </div>

            {/* Comparatif par dossiers */}
            <section className="flex flex-col gap-3">
                <h2 className="font-mono text-xs tracking-wider text-mp-text-muted uppercase">
                    Inventaire Détaillé des Répertoires
                </h2>
                <div className="overflow-hidden rounded-lg border border-mp-glass-border bg-mp-glass-solid/20">
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-xs">
                            <thead>
                                <tr className="border-b border-mp-glass-border bg-mp-glass-solid text-left tracking-wider text-mp-text-muted uppercase">
                                    <th className="w-1/4 px-4 py-3 font-medium">Dossier</th>
                                    <th className="px-4 py-3 text-center font-medium">Fichiers (Local)</th>
                                    <th className="px-4 py-3 text-center font-medium">Taille (Local)</th>
                                    <th className="px-4 py-3 text-center font-medium">Fichiers (R2)</th>
                                    <th className="px-4 py-3 text-center font-medium">Taille (R2)</th>
                                    <th className="w-24 px-4 py-3 text-center font-medium">Cohérence</th>
                                    <th className="w-[340px] px-4 py-3 text-center font-medium">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-mp-glass-border/40">
                                {categoriesKeys.map((cat) => {
                                    const loc = status.local.categories[cat] || {
                                        files: 0,
                                        size: 0,
                                        hasNewerLocal: false,
                                        hasMissingR2: false,
                                        hasMissingLocal: false,
                                        isIdentical: true,
                                    };
                                    const r2c = status.r2.categories[cat] || {
                                        files: 0,
                                        size: 0,
                                        hasNewerLocal: false,
                                        hasMissingR2: false,
                                        hasMissingLocal: false,
                                        isIdentical: true,
                                    };

                                    // Calcul dynamique des étiquettes de cohérence fine
                                    let coherenceLabel = '🟢 Conforme';
                                    let coherenceColorClass =
                                        'bg-emerald-500/10 border-emerald-500/20 text-emerald-400';
                                    let coherenceTooltip =
                                        'Tous les fichiers sont strictement identiques en taille, quantité et horodatage.';

                                    if (loc.hasNewerLocal) {
                                        coherenceLabel = '🔵 Récents Local';
                                        coherenceColorClass = 'bg-blue-500/10 border-blue-500/20 text-blue-400';
                                        coherenceTooltip =
                                            'Des fichiers locaux ont été modifiés plus récemment ou sont absents de R2.';
                                    } else if (loc.hasMissingR2) {
                                        coherenceLabel = '🟡 Manque R2';
                                        coherenceColorClass = 'bg-amber-500/10 border-amber-500/20 text-amber-400';
                                        coherenceTooltip = 'Des fichiers locaux ne sont pas présents sur R2.';
                                    } else if (loc.hasMissingLocal) {
                                        coherenceLabel = '🟣 Manque Local';
                                        coherenceColorClass = 'bg-purple-500/10 border-purple-500/20 text-purple-400';
                                        coherenceTooltip = 'Des fichiers R2 ne sont pas présents sur votre machine.';
                                    } else if (!loc.isIdentical) {
                                        coherenceLabel = '🟠 Écart';
                                        coherenceColorClass = 'bg-orange-500/10 border-orange-500/20 text-orange-400';
                                        coherenceTooltip =
                                            'Des écarts de tailles ou de noms de fichiers ont été détectés.';
                                    }

                                    const isSubDir = cat.includes('/');
                                    const displayLabel = isSubDir ? cat.split('/')[1] : cat;

                                    return (
                                        <tr
                                            key={cat}
                                            className={`transition-colors hover:bg-mp-accent/5 ${isSubDir ? 'bg-mp-ui-black/10' : 'bg-mp-ui-black/25 font-semibold'}`}
                                        >
                                            <td
                                                className={`flex items-center gap-1.5 px-4 py-3 text-xs ${
                                                    isSubDir
                                                        ? 'pl-8 font-mono text-mp-text-secondary'
                                                        : 'font-semibold text-mp-text-heading capitalize'
                                                }`}
                                            >
                                                {isSubDir && (
                                                    <span className="font-sans text-mp-text-muted/40">└──</span>
                                                )}
                                                {displayLabel}
                                            </td>
                                            <td className="px-4 py-3 text-center text-mp-text-primary">{loc.files}</td>
                                            <td className="px-4 py-3 text-center text-mp-text-secondary">
                                                {formatSize(loc.size)}
                                            </td>
                                            <td className="px-4 py-3 text-center text-mp-text-primary">{r2c.files}</td>
                                            <td className="px-4 py-3 text-center text-mp-text-secondary">
                                                {formatSize(r2c.size)}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span
                                                    className={`inline-flex cursor-help items-center gap-1 rounded-sm border px-2 py-0.5 text-[10px] font-semibold transition-all ${coherenceColorClass}`}
                                                    title={coherenceTooltip}
                                                >
                                                    {coherenceLabel}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <div className="flex flex-nowrap items-center justify-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleWarmFolder(cat)}
                                                        disabled={r2c.files === 0 || isRunning}
                                                        className="rounded-sm border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold whitespace-nowrap text-emerald-400 transition-colors hover:bg-emerald-500/20 hover:text-emerald-300 disabled:pointer-events-none disabled:opacity-30"
                                                        title="Préchauffer (Warm) le cache CDN pour ce répertoire"
                                                    >
                                                        Warm CDN
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handlePurgeFolder(cat)}
                                                        disabled={loc.files === 0 || isRunning}
                                                        className="rounded-sm border border-purple-500/40 bg-purple-500/10 px-2 py-1 text-[10px] font-semibold whitespace-nowrap text-purple-400 transition-colors hover:bg-purple-500/20 hover:text-purple-300 disabled:pointer-events-none disabled:opacity-30"
                                                        title="Purger (Purge) le cache CDN pour ce répertoire"
                                                    >
                                                        Purge CDN
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteR2(cat)}
                                                        disabled={r2c.files === 0 || isRunning}
                                                        className="rounded-sm border border-red-500/40 bg-red-500/10 px-2 py-1 text-[10px] font-semibold whitespace-nowrap text-red-400 transition-colors hover:bg-red-500/20 hover:text-red-300 disabled:pointer-events-none disabled:opacity-30"
                                                        title="Supprimer le contenu de ce dossier sur R2"
                                                    >
                                                        Suppr R2
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteLocal(cat)}
                                                        disabled={loc.files === 0 || isRunning}
                                                        className="rounded-sm border border-orange-500/40 bg-orange-500/10 px-2 py-1 text-[10px] font-semibold whitespace-nowrap text-orange-400 transition-colors hover:bg-orange-500/20 hover:text-orange-300 disabled:pointer-events-none disabled:opacity-30"
                                                        title="Supprimer le dossier local et son contenu"
                                                    >
                                                        Suppr Local
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>
        </div>
    );
}
