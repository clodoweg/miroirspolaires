/**
 * @file src/components/Admin/CachePanel.tsx
 * @description Panneau de contrôle d'administration pour la gestion du Cache CDN et du Worker d'images.
 *
 * Responsabilité :
 * - Afficher l'état de santé du Cloudflare Worker CDN (latence, statut du Health Check).
 * - Superviser les variables de configuration critiques du CDN et de stockage R2.
 * - Expliquer visuellement les contraintes techniques du Worker (limites CPU, taille d'image, WebP).
 * - Offrir des boutons interactifs pour déclencher le préchauffage ou la purge complète du cache CDN.
 * - Streamer les logs des scripts en temps réel via la console intégrée ScriptConsole.
 */

import { useCallback, useEffect, useId, useState } from 'react';
import {
    Zap,
    RotateCw,
    Cpu,
    Server,
    Wifi,
    AlertTriangle,
    ShieldCheck,
    Activity,
    FileText,
    Info,
    CheckCircle,
    XCircle,
    RefreshCw,
} from 'lucide-react';
import AdminProviders from './AdminProviders';
import PageHeader from './PageHeader';
import ScriptConsole from './ScriptConsole';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmDialog';

interface CachePolicy {
    widths: number[];
    format: string;
    cpuLimitMs: number;
    sizeLimitKb: number;
    megapixelLimit: number;
    cachingMaxAge: string;
}

interface CacheStatusPayload {
    configured: boolean;
    workerUrl: string;
    purgeKeyConfigured: boolean;
    cdnPurgeConfigured?: boolean;
    r2Configured: boolean;
    online: boolean;
    pingStatus: number;
    pingStatusText: string;
    pingTime: number;
    errorMessage: string | null;
    cachePolicy: CachePolicy;
}

/**
 * Composant enveloppe principal pour le panneau d'administration du cache.
 * Fournit les contextes d'administration (Toasts, Boîtes de confirmation).
 *
 * @returns {JSX.Element} Panneau de contrôle enveloppé dans ses fournisseurs de contexte.
 */
export default function CachePanel() {
    return (
        <AdminProviders>
            <CachePanelInner />
        </AdminProviders>
    );
}

/**
 * Composant de panneau interne gérant l'état et l'interface utilisateur.
 *
 * @returns {JSX.Element} L'interface utilisateur du panneau de cache CDN.
 */
function CachePanelInner() {
    const toast = useToast();
    const confirm = useConfirm();

    const [status, setStatus] = useState<CacheStatusPayload | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // États d'exécution de script en arrière-plan
    const [activeScriptId, setActiveScriptId] = useState<string | null>(null);
    const [runNonce, setRunNonce] = useState(0);
    const [folders, setFolders] = useState<string[]>([]);
    // POURQUOI : chaque action porte sur un seul dossier, jamais sur tous les domaines à la fois.
    const [selectedFolder, setSelectedFolder] = useState<string>('astrophotographies');
    const folderSelectId = useId();

    /**
     * Récupère l'état complet du cache et du Worker depuis le point d'accès API Astro.
     */
    const fetchStatus = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/admin/cache/status');
            if (!res.ok) {
                throw new Error(`Échec du chargement : statut HTTP ${res.status}`);
            }
            const data: CacheStatusPayload = await res.json();
            setStatus(data);
        } catch (err: any) {
            setError(err.message || String(err));
            toast.error(err.message || 'Erreur réseau', { title: 'État CDN inaccessible' });
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        const saved = sessionStorage.getItem('script-console-cache');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (parsed.runId) {
                    setActiveScriptId(parsed.runId);
                    setRunNonce(parsed.runNonce || 0);
                    if (parsed.args && parsed.args.length > 0) {
                        setSelectedFolder(parsed.args[0]);
                    }
                }
            } catch {
                // POURQUOI : état sauvegardé corrompu, on repart d'une console vierge.
            }
        }
        fetchStatus();
    }, [fetchStatus]);

    /**
     * Récupère la liste de tous les dossiers d'assets locaux et distants.
     */
    const fetchFolders = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/r2/status');
            if (res.ok) {
                const data = await res.json();
                const keys = new Set([...Object.keys(data.local.categories), ...Object.keys(data.r2.categories)]);
                setFolders(Array.from(keys).sort());
            }
        } catch (e) {
            console.error("Erreur lors du scan des dossiers d'assets pour le cache :", e);
        }
    }, []);

    useEffect(() => {
        fetchFolders();
    }, [fetchFolders]);

    /**
     * Déclenche le script de préchauffage du CDN (Warm).
     */
    const handleWarmCdn = () => {
        const folderLabel = `le dossier "${selectedFolder}"`;
        toast.info(`Lancement du préchauffage pour ${folderLabel}. Suivez la console pour voir la progression.`, {
            title: 'Préchauffage CDN',
        });
        setActiveScriptId('warm-cache');
        setRunNonce((n) => n + 1);
    };

    /**
     * Déclenche le script de purge complète de cache après confirmation.
     */
    const handlePurgeCache = async () => {
        const folderLabel = `le dossier "${selectedFolder}"`;
        const ok = await confirm({
            title: `Purger le cache CDN pour ${folderLabel} ?`,
            message: (
                <div className="space-y-2">
                    <p className="text-sm text-mp-text-secondary">
                        Cette opération va invalider de manière destructive toutes les versions optimisées d'images
                        stockées sur les serveurs Edge de Cloudflare pour <strong>{folderLabel}</strong>.
                    </p>
                    <p className="text-sm font-semibold text-mp-accent">
                        Les requêtes suivantes subiront une augmentation temporaire de la latence (Cache Miss) le temps
                        que les images soient régénérées.
                    </p>
                </div>
            ),
            confirmLabel: 'Purger définitivement',
        });

        if (!ok) return;

        toast.info(`Lancement de la purge pour ${folderLabel}...`, { title: 'Purge CDN' });
        setActiveScriptId('purge-cache');
        setRunNonce((n) => n + 1);
    };

    return (
        <div className="flex flex-col gap-6 pb-12">
            <PageHeader
                breadcrumb={[{ label: 'Admin', href: '/admin' }, { label: 'Cache CDN & Worker' }]}
                title="Supervision du Cache CDN & Worker"
                description="Contrôlez l'état de santé du CDN Cloudflare, préchauffez les variantes d'images pour optimiser l'INP / LCP des visiteurs, ou videz instantanément le cache."
            />

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.5fr)]">
                {/* COLONNE GAUCHE : Statut, Configuration et Politiques */}
                <div className="flex flex-col gap-6">
                    {/* CARTE 1 : Diagnostic en direct */}
                    <section className="rounded-lg border border-mp-glass-border bg-mp-glass-solid p-5">
                        <div className="flex items-center justify-between border-b border-mp-glass-border pb-3">
                            <h2 className="flex items-center gap-2 text-sm font-semibold text-mp-text-primary">
                                <Activity className="h-4 w-4 text-mp-accent" />
                                Diagnostic en direct
                            </h2>
                            <button
                                onClick={fetchStatus}
                                disabled={loading}
                                className="rounded-sm p-1.5 text-mp-text-secondary hover:bg-mp-ui-black/60 hover:text-mp-accent disabled:opacity-50"
                                title="Actualiser le statut"
                            >
                                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                            </button>
                        </div>

                        {loading && !status ? (
                            <div className="py-8 text-center text-xs text-mp-text-muted">
                                Analyse du CDN et ping en cours...
                            </div>
                        ) : error ? (
                            <div className="mt-4 rounded-md border border-red-500/20 bg-red-500/5 p-4 text-xs text-red-400">
                                <p className="font-semibold">Erreur de diagnostic :</p>
                                <p className="mt-1 font-mono">{error}</p>
                            </div>
                        ) : status ? (
                            <div className="space-y-4 mt-4">
                                {/* État d'activité */}
                                <div className="flex items-center justify-between rounded-lg bg-mp-ui-black/35 p-3">
                                    <div className="flex items-center gap-3">
                                        <div className="relative flex h-3 w-3">
                                            {status.online ? (
                                                <>
                                                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                                                    <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500"></span>
                                                </>
                                            ) : (
                                                <>
                                                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"></span>
                                                    <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500"></span>
                                                </>
                                            )}
                                        </div>
                                        <div>
                                            <div className="text-xs font-semibold text-mp-text-primary">
                                                {status.online
                                                    ? 'En ligne (Worker actif)'
                                                    : 'Hors ligne ou injoignable'}
                                            </div>
                                            <div className="text-[10px] text-mp-text-muted">
                                                Health Check direct sur le CDN
                                            </div>
                                        </div>
                                    </div>
                                    {status.online && (
                                        <span className="rounded-sm bg-emerald-500/10 px-2 py-0.5 font-mono text-xs font-bold text-emerald-400">
                                            {status.pingTime} ms
                                        </span>
                                    )}
                                </div>

                                {/* Paramètres de configuration dans le .env */}
                                <div className="space-y-2">
                                    <h3 className="font-mono text-[11px] tracking-wider text-mp-text-muted uppercase">
                                        Configuration Système (.env)
                                    </h3>

                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                        <div className="flex items-center justify-between rounded-sm bg-mp-ui-black/20 p-2.5">
                                            <span className="flex items-center gap-1.5 text-xs text-mp-text-secondary">
                                                <Server className="h-3.5 w-3.5" />
                                                URL du Worker
                                            </span>
                                            <span
                                                className="max-w-[140px] truncate rounded-sm bg-mp-ui-black/60 px-1.5 py-0.5 font-mono text-[10px] text-mp-text-primary"
                                                title={status.workerUrl}
                                            >
                                                {status.workerUrl
                                                    ? status.workerUrl.replace(/^https?:\/\//, '')
                                                    : 'Non configurée'}
                                            </span>
                                        </div>

                                        <div className="flex items-center justify-between rounded-sm bg-mp-ui-black/20 p-2.5">
                                            <span className="flex items-center gap-1.5 text-xs text-mp-text-secondary">
                                                <ShieldCheck className="h-3.5 w-3.5" />
                                                Clé de Purge R2
                                            </span>
                                            {status.purgeKeyConfigured ? (
                                                <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400">
                                                    <CheckCircle className="h-3 w-3" /> Active
                                                </span>
                                            ) : (
                                                <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-400">
                                                    <AlertTriangle className="h-3 w-3" /> Absente
                                                </span>
                                            )}
                                        </div>

                                        <div className="flex items-center justify-between rounded-sm bg-mp-ui-black/20 p-2.5">
                                            <span className="flex items-center gap-1.5 text-xs text-mp-text-secondary">
                                                <ShieldCheck className="h-3.5 w-3.5" />
                                                Purge du CDN de R2 (images remplacées)
                                            </span>
                                            {status.cdnPurgeConfigured ? (
                                                <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400">
                                                    <CheckCircle className="h-3 w-3" /> Active
                                                </span>
                                            ) : (
                                                <span
                                                    className="flex items-center gap-1 text-[10px] font-semibold text-amber-400"
                                                    title="CLOUDFLARE_ZONE_ID, CLOUDFLARE_API_TOKEN et PUBLIC_R2_URL"
                                                >
                                                    <AlertTriangle className="h-3 w-3" /> Non configurée
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between rounded-sm bg-mp-ui-black/20 p-2.5">
                                        <span className="flex items-center gap-1.5 text-xs text-mp-text-secondary">
                                            <Wifi className="h-3.5 w-3.5" />
                                            Identifiants AWS/R2
                                        </span>
                                        {status.r2Configured ? (
                                            <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400">
                                                <CheckCircle className="h-3 w-3" /> Connectés
                                            </span>
                                        ) : (
                                            <span className="flex items-center gap-1 text-[10px] font-semibold text-red-400">
                                                <XCircle className="h-3 w-3" /> Manquants
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Boutons d'Action */}
                                <div className="flex flex-col gap-4 border-t border-mp-glass-border pt-4">
                                    <div>
                                        <label
                                            htmlFor={folderSelectId}
                                            className="mb-1.5 block font-mono text-[10px] tracking-wider text-mp-text-secondary uppercase"
                                        >
                                            Répertoire à Purger / Préchauffer
                                        </label>
                                        <select
                                            id={folderSelectId}
                                            value={selectedFolder}
                                            onChange={(e) => setSelectedFolder(e.target.value)}
                                            className="admin-input font-mono"
                                        >
                                            {folders.map((cat) => {
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

                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            type="button"
                                            onClick={handleWarmCdn}
                                            disabled={!status.online || activeScriptId !== null}
                                            className="flex items-center justify-center gap-2 rounded-md border border-mp-accent bg-mp-accent px-3 py-2 text-xs font-semibold text-mp-ui-black hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            <Zap className="h-3.5 w-3.5" />
                                            Préchauffer CDN
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handlePurgeCache}
                                            disabled={
                                                !status.online || !status.purgeKeyConfigured || activeScriptId !== null
                                            }
                                            className="flex items-center justify-center gap-2 rounded-md border border-red-500/30 bg-red-950/15 px-3 py-2 text-xs font-semibold text-red-400 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            <RotateCw className="h-3.5 w-3.5" />
                                            Purger le cache
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : null}
                    </section>

                    {/* CARTE 2 : Politiques de Redimensionnement (Aesthetics/Explications) */}
                    <section className="rounded-lg border border-mp-glass-border bg-mp-glass-solid p-5">
                        <h2 className="flex items-center gap-2 border-b border-mp-glass-border pb-3 text-sm font-semibold text-mp-text-primary">
                            <Info className="h-4 w-4 text-mp-accent" />
                            Politique d'Optimisation du CDN
                        </h2>

                        <div className="space-y-3.5 mt-4">
                            {/* Règle 1 */}
                            <div className="flex gap-3 rounded-sm bg-mp-ui-black/10 p-3">
                                <Cpu className="mt-0.5 h-4 w-4 shrink-0 text-mp-accent" />
                                <div>
                                    <h4 className="text-xs font-semibold text-mp-text-primary">
                                        Plan Workers Free & CPU Limit
                                    </h4>
                                    <p className="mt-1 text-[11px] leading-relaxed text-mp-text-secondary">
                                        Le redimensionnement d'images à la volée est une opération lourde. Le plan
                                        gratuit de Cloudflare impose un budget de **10ms de CPU** par requête.
                                    </p>
                                    <p className="mt-1.5 text-[10px] text-mp-text-muted">
                                        <strong>Conséquence :</strong> Les requêtes dépassant cette limite lèvent une
                                        erreur 503 temporaire. Le Worker est optimisé pour rester sous les 10ms.
                                    </p>
                                </div>
                            </div>

                            {/* Règle 2 */}
                            <div className="flex gap-3 rounded-sm bg-mp-ui-black/10 p-3">
                                <Server className="mt-0.5 h-4 w-4 shrink-0 text-mp-accent" />
                                <div>
                                    <h4 className="text-xs font-semibold text-mp-text-primary">
                                        Bypass Automatique (Images &gt; 500 Ko / 2.5 MP)
                                    </h4>
                                    <p className="mt-1 text-[11px] leading-relaxed text-mp-text-secondary">
                                        Toute image source stockée sur R2 qui pèse plus de **500 Ko** ou dont la
                                        définition dépasse **2.5 Mégapixels** contourne automatiquement le
                                        redimensionnement.
                                    </p>
                                    <p className="mt-1.5 text-[10px] text-mp-text-muted">
                                        <strong>Conséquence :</strong> Elle est servie directement depuis le stockage R2
                                        sans traitement (l'image s'affiche toujours, mais en taille originale).
                                    </p>
                                </div>
                            </div>

                            {/* Règle 3 */}
                            <div className="flex gap-3 rounded-sm bg-mp-ui-black/10 p-3">
                                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-mp-accent" />
                                <div>
                                    <h4 className="text-xs font-semibold text-mp-text-primary">
                                        Contournement WebP vs JPEG
                                    </h4>
                                    <p className="mt-1 text-[11px] leading-relaxed text-mp-text-secondary">
                                        La bibliothèque `@cf-wasm/photon` exporte du WebP *sans perte* (lossless), ce
                                        qui gonfle le poids des photos par 5 par rapport au JPEG d'origine.
                                    </p>
                                    <p className="mt-1.5 text-[10px] text-mp-text-muted">
                                        <strong>Conséquence :</strong> Le Worker force un rendu en JPEG compressé de
                                        haute qualité pour les requêtes d'images afin de conserver un poids extrêmement
                                        optimisé.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>

                {/* COLONNE DROITE : Console de Script Interactive */}
                <div className="flex flex-col gap-3 lg:sticky lg:top-16 lg:self-start">
                    {activeScriptId ? (
                        <>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="min-w-0">
                                    <div className="font-mono text-[11px] tracking-wider text-mp-text-muted uppercase">
                                        Console CDN · {activeScriptId === 'warm-cache' ? 'Préchauffage' : 'Purge'}
                                    </div>
                                    <div className="truncate font-mono text-[10px] text-mp-text-secondary">
                                        $ node scripts/r2/
                                        {activeScriptId === 'warm-cache' ? 'warm-cache.mjs' : 'purge-cache.mjs'}{' '}
                                        {selectedFolder}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setRunNonce((n) => n + 1);
                                        toast.info("Relancement de l'action...", { title: 'Console réinitialisée' });
                                    }}
                                    className="rounded-sm border border-mp-glass-border px-2 py-1 text-[10px] text-mp-text-secondary hover:border-mp-accent hover:text-mp-accent"
                                >
                                    ↻ Réexécuter
                                </button>
                            </div>
                            <ScriptConsole
                                runId={activeScriptId}
                                args={[selectedFolder]}
                                runNonce={runNonce}
                                panelId="cache"
                                onClose={() => {
                                    setActiveScriptId(null);
                                    sessionStorage.removeItem('script-console-cache');
                                }}
                            />
                        </>
                    ) : (
                        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-mp-glass-border bg-mp-glass-solid/40 p-12 text-center">
                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-mp-accent/10 text-mp-accent">
                                <Zap className="h-6 w-6" />
                            </div>
                            <h3 className="mt-4 text-sm font-semibold text-mp-text-primary">Console CDN inactive</h3>
                            <p className="mt-2 max-w-[280px] text-xs leading-relaxed text-mp-text-secondary">
                                Lancez une action de préchauffage ou de purge pour visualiser les logs et le traitement
                                du cache en direct.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
