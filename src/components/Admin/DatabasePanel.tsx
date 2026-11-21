import { useEffect, useState, useMemo } from 'react';
import AdminProviders from './AdminProviders';
import PageHeader from './PageHeader';
import SegmentedTabs from './SegmentedTabs';
import ScriptConsole from './ScriptConsole';
import CatalogueSnapshotsSection from './CatalogueSnapshotsSection';
import type { CatalogueSnapshotStatus } from '@/lib/admin/catalogue-snapshots';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmDialog';

type ActiveTab = 'exoplanets' | 'variableStars' | 'comets' | 'asteroids';

interface StatRange {
    min: number;
    max: number;
    avg: number;
}

interface DBStats {
    progress: {
        currentBandIdx: number;
        currentSliceIdx: number;
        totalInserted: number;
    } | null;
    catalogueSnapshots: CatalogueSnapshotStatus;
    exoplanets: {
        exists: boolean;
        sizeBytes: number;
        mtime: string;
        count: number;
        confirmedCount: number;
        candidateCount: number;
        topConstellations: { name: string; count: number }[];
        stats: {
            distance: StatRange;
            period: StatRange;
            mass: StatRange;
            radius: StatRange;
            vMag: StatRange;
        };
        historicalCount: number;
    };
    variableStars: {
        exists: boolean;
        sizeBytes: number;
        mtime: string;
        maxMagLimit: number;
        count: number;
        typesDistribution: Record<string, number>;
        topConstellations: { name: string; count: number }[];
        stats: {
            distance: StatRange;
            period: StatRange;
            vMagMin: StatRange;
            vMagMax: StatRange;
            amplitude: StatRange;
        };
    };
    comets: {
        exists: boolean;
        sizeBytes: number;
        mtime: string;
        count: number;
        periodicCount: number;
        nonPeriodicCount: number;
        stats: {
            q: StatRange;
            e: StatRange;
            mag: StatRange;
        };
    };
    asteroids: {
        exists: boolean;
        sizeBytes: number;
        mtime: string;
        count: number;
        stats: {
            a: StatRange;
            e: StatRange;
            h: StatRange;
        };
    };
}

const TYPE_LABELS: Record<string, string> = {
    eclipsing: 'Binaires à éclipses',
    cepheid: 'Céphéides',
    mira: 'Miras / Longue période',
    semiregular: 'Semi-régulières',
    cataclysmique: 'Cataclysmiques / UG',
    other: 'Autres / Non-classés',
};

const TYPE_COLORS: Record<string, string> = {
    eclipsing: 'bg-amber-500',
    cepheid: 'bg-emerald-500',
    mira: 'bg-sky-500',
    semiregular: 'bg-indigo-500',
    cataclysmique: 'bg-red-500',
    other: 'bg-gray-500',
};

export default function DatabasePanel() {
    return (
        <AdminProviders>
            <DatabasePanelInner />
        </AdminProviders>
    );
}

function DatabasePanelInner() {
    const toast = useToast();
    const confirm = useConfirm();

    const [stats, setStats] = useState<DBStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<ActiveTab>('exoplanets');
    const [activeScript, setActiveScript] = useState<string | null>(null);
    const [runNonce, setRunNonce] = useState(0);
    const [maxMag, setMaxMag] = useState<number>(25.0);
    const [extraArgs, setExtraArgs] = useState<string[]>([]);

    const scriptArgs = useMemo(() => {
        if (activeScript === 'update-variable-stars') {
            return ['--max-mag', String(maxMag), ...extraArgs];
        }
        return extraArgs;
    }, [activeScript, maxMag, extraArgs]);

    const fetchStats = async () => {
        try {
            const res = await fetch('/api/admin/database/stats');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = (await res.json()) as DBStats;
            setStats(data);
        } catch (e) {
            toast.error(String(e), { title: 'Erreur de chargement des statistiques' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        // Restauration d'un éventuel script en cours d'exécution
        const saved = sessionStorage.getItem('script-console-database');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (parsed.runId) {
                    setActiveScript(parsed.runId);
                    setRunNonce(parsed.runNonce || 0);
                    if (parsed.args) {
                        if (parsed.args.includes('--max-mag')) {
                            const idx = parsed.args.indexOf('--max-mag');
                            const val = parseFloat(parsed.args[idx + 1]);
                            if (!isNaN(val)) setMaxMag(val);
                        }
                        const extra = parsed.args.filter((arg: string, idx: number) => {
                            if (arg === '--max-mag') return false;
                            if (idx > 0 && parsed.args[idx - 1] === '--max-mag') return false;
                            return true;
                        });
                        setExtraArgs(extra);
                    }
                }
            } catch {
                // POURQUOI : état sauvegardé corrompu, on repart d'une console vierge.
            }
        }
        fetchStats();
    }, []);

    // Polling si une importation est en cours pour rafraîchir en temps réel
    useEffect(() => {
        if (!stats?.progress) return;
        const interval = setInterval(() => {
            fetchStats();
        }, 3000);
        return () => clearInterval(interval);
    }, [stats?.progress]);

    const runScript = async (scriptId: string, label: string, extra: string[] = []) => {
        const titleLabel = scriptId === 'update-variable-stars' ? `${label} (Mag ≤ ${maxMag})` : label;

        let confirmTitle = `Lancer la mise à jour des ${titleLabel} ?`;
        let confirmMessage = (
            <div className="space-y-2 text-sm leading-relaxed text-mp-text-secondary">
                <p>
                    Ce script va interroger les services de données astronomiques distants (NASA Exoplanet Archive,
                    AAVSO, VizieR TAP).
                </p>
                <p className="font-semibold text-mp-accent">
                    L'opération peut prendre entre 30 secondes et 2 minutes selon la vitesse du réseau.
                </p>
            </div>
        );

        if (scriptId === 'update-variable-stars') {
            if (extra.includes('--fresh')) {
                confirmTitle = `Lancer un nouvel import complet des ${titleLabel} ?`;
                confirmMessage = (
                    <div className="space-y-2 text-sm leading-relaxed text-mp-text-secondary">
                        <p className="font-semibold text-mp-astro-red">
                            ⚠️ Attention : Cette action va effacer l'intégralité du catalogue local d'étoiles variables
                            et tout réimporter depuis zéro.
                        </p>
                        <p>
                            Ce script va interroger le service VizieR TAP pour charger l'ensemble des données de
                            pulsation.
                        </p>
                    </div>
                );
            } else if (extra.includes('--no-clean')) {
                confirmTitle = `Remplir les trous des ${titleLabel} ?`;
                confirmMessage = (
                    <div className="space-y-2 text-sm leading-relaxed text-mp-text-secondary">
                        <p>
                            Le script va reparcourir toutes les magnitudes et tranches d'Ascension Droite depuis le
                            début pour insérer les étoiles manquantes.
                        </p>
                        <p className="font-semibold text-mp-accent">
                            Les données d'étoiles existantes dans la base ne seront PAS effacées.
                        </p>
                    </div>
                );
            } else {
                confirmTitle = `Reprendre l'importation des ${titleLabel} ?`;
                confirmMessage = (
                    <div className="space-y-2 text-sm leading-relaxed text-mp-text-secondary">
                        <p>
                            L'importation va reprendre là où elle s'était arrêtée (Bande de magnitude et tranche RA
                            sauvegardées) <strong>sans effacer</strong> les données déjà insérées.
                        </p>
                    </div>
                );
            }
        } else if (scriptId === 'update-catalogues') {
            const isMissingOnly = extra.includes('--missing');
            confirmTitle = isMissingOnly ? 'Générer les catalogues manquants ?' : 'Régénérer tous les catalogues ?';
            confirmMessage = (
                <div className="space-y-2 text-sm leading-relaxed text-mp-text-secondary">
                    <p>
                        {isMissingOnly
                            ? 'Le script va télécharger depuis SIMBAD et VizieR les catalogues sans instantané.'
                            : "Le script va retélécharger tous les catalogues depuis SIMBAD et VizieR. Ce n'est utile que si les requêtes ou la normalisation ont changé."}
                    </p>
                    <p>
                        Un catalogue qui échoue ou revient tronqué garde son instantané actuel. Comptez quelques minutes
                        si le CDS ne répond pas.
                    </p>
                </div>
            );
        } else if (scriptId === 'check-variable-stars') {
            confirmTitle = `Lancer l'audit des ${label} ?`;
            confirmMessage = (
                <div className="space-y-2 text-sm leading-relaxed text-mp-text-secondary">
                    <p>
                        Ce script va comparer le nombre d'étoiles dans votre base locale avec les données en direct de
                        VizieR TAP pour chaque magnitude.
                    </p>
                    <p>Il mesurera également le taux de couverture des données de distance Gaia DR3.</p>
                </div>
            );
        } else if (scriptId === 'crossmatch-variable-stars') {
            confirmTitle = `Lancer le cross-match Gaia des ${label} ?`;
            confirmMessage = (
                <div className="space-y-2 text-sm leading-relaxed text-mp-text-secondary">
                    <p>
                        Ce script va effectuer une requête de cross-match spatial auprès du service CDS XMatch pour
                        associer toutes les étoiles de votre base locale n'ayant pas encore de distance à leur parallaxe
                        Gaia DR3.
                    </p>
                    <p className="font-semibold text-mp-accent">
                        L'opération s'exécute par lots de 15 000 étoiles de manière incrémentielle. Elle peut être
                        interrompue et reprise à tout moment.
                    </p>
                </div>
            );
        }

        const ok = await confirm({
            title: confirmTitle,
            message: confirmMessage,
            confirmLabel: extra.includes('--fresh') ? 'Effacer et démarrer' : 'Lancer la mise à jour',
        });
        if (!ok) return;

        setExtraArgs(extra);
        setActiveScript(scriptId);
        setRunNonce((n) => n + 1);
    };

    const handleScriptExit = (code: number | null) => {
        if (activeScript === 'update-catalogues') {
            // POURQUOI : même en échec, les catalogues déjà écrits comptent, l'état affiché doit les refléter.
            fetchStats();
            if (code === 0) {
                toast.success('Pensez à committer src/data/catalogues/ pour que la production les utilise.', {
                    title: 'Instantanés générés',
                });
            } else {
                toast.error('Certains catalogues ont échoué et gardent leur état précédent. Détail dans la console.', {
                    title: 'Génération incomplète',
                });
            }
            return;
        }
        if (code === 0) {
            toast.success('La base de données a été mise à jour avec succès.', { title: 'Mise à jour réussie' });
            fetchStats();
        } else {
            toast.error("Une erreur est survenue lors de l'exécution du script de synchronisation.", {
                title: 'Échec de la mise à jour',
            });
        }
    };

    const formatBytes = (bytes: number): string => {
        if (bytes === 0) return '0 Ko';
        const k = 1024;
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        const sizes = ['Octets', 'Ko', 'Mo', 'Go'];
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
    };

    const formatDate = (dateStr: string): string => {
        if (!dateStr) return 'Jamais';
        return new Date(dateStr).toLocaleDateString('fr-FR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <span className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-mp-accent border-t-transparent" />
            </div>
        );
    }

    if (!stats) {
        return (
            <div className="py-12 text-center text-mp-text-muted">
                Impossible de charger les statistiques de la base de données.
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6 pb-12">
            <PageHeader
                breadcrumb={[{ label: 'Admin', href: '/admin' }, { label: 'Base de données' }]}
                title="Supervision de la Base de Données"
                description="Visualisation des statistiques d'objets célestes locaux et gestion des pipelines de synchronisation."
            />

            {/* Indicateur de progression en arrière-plan */}
            {stats.progress && (
                <div className="flex flex-col gap-3 rounded-xl border border-mp-accent/30 bg-mp-accent/10 p-5">
                    <div className="flex items-center justify-between font-mono text-xs font-semibold text-mp-accent">
                        <span className="flex items-center gap-2">
                            <span className="h-2 w-2 animate-ping rounded-full bg-mp-accent" />
                            Importation en cours (Magnitudes 12 à 25)
                        </span>
                        <span>{stats.progress.totalInserted.toLocaleString('fr-FR')} étoiles insérées</span>
                    </div>
                    <div className="flex flex-col gap-1 text-xs leading-relaxed text-mp-text-secondary">
                        <p>
                            Bande de magnitude actuelle :{' '}
                            <span className="font-mono font-semibold text-mp-accent">
                                Bande #{stats.progress.currentBandIdx + 1}
                            </span>{' '}
                            (par tranches d'une magnitude).
                        </p>
                        <p>
                            Tranche d'Ascension Droite en cours d'insertion :{' '}
                            <span className="font-mono font-semibold text-mp-accent">
                                {stats.progress.currentSliceIdx} / 24
                            </span>{' '}
                            (Slices RA de 15°).
                        </p>
                    </div>
                    <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-mp-ui-black/50">
                        <div
                            className="h-full rounded-full bg-mp-accent transition-all duration-500"
                            style={{ width: `${(stats.progress.currentSliceIdx / 24) * 100}%` }}
                        />
                    </div>
                </div>
            )}

            {/* Console de script SSE intégrée */}
            {activeScript && (
                <div className="flex flex-col gap-2 rounded-lg border border-mp-accent/20 bg-mp-accent/5 p-4">
                    <div className="flex items-center justify-between text-xs text-mp-accent">
                        <span className="font-semibold">
                            {activeScript === 'update-catalogues'
                                ? 'Génération des instantanés de catalogues'
                                : 'Mise à jour en direct de la base de données'}
                        </span>
                        <span className="animate-pulse">Veuillez patienter...</span>
                    </div>
                    <ScriptConsole
                        runId={activeScript}
                        args={scriptArgs}
                        runNonce={runNonce}
                        panelId="database"
                        onExit={handleScriptExit}
                        onClose={() => {
                            setActiveScript(null);
                            sessionStorage.removeItem('script-console-database');
                        }}
                    />
                </div>
            )}

            {/* KPI Cards Grid */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                {/* Exoplanets Card */}
                <div className="rounded-xl border border-mp-glass-border bg-mp-glass-solid p-5 transition-colors hover:border-mp-accent/30">
                    <div className="flex items-start justify-between">
                        <div>
                            <span className="font-mono text-[10px] tracking-wider text-mp-text-muted uppercase">
                                Catalogue Exoplanètes
                            </span>
                            <h3 className="mt-1 font-serif text-3xl font-light text-mp-accent">
                                {stats.exoplanets.count.toLocaleString()}
                            </h3>
                            <p className="mt-1 text-xs text-mp-text-secondary">
                                {stats.exoplanets.confirmedCount?.toLocaleString() || 0} confirmées ·{' '}
                                {stats.exoplanets.candidateCount?.toLocaleString() || 0} candidates TESS
                            </p>
                        </div>
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-mp-accent/20 bg-mp-accent/10 text-mp-accent">
                            <svg
                                width="20"
                                height="20"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                            >
                                <circle cx="12" cy="12" r="10" />
                                <circle cx="12" cy="12" r="4" />
                            </svg>
                        </div>
                    </div>
                    <div className="mt-6 grid grid-cols-2 gap-4 border-t border-mp-glass-border/40 pt-4 font-mono text-xs">
                        <div>
                            <span className="block text-[10px] text-mp-text-muted">Taille estimée :</span>
                            <span className="text-mp-text-primary">{formatBytes(stats.exoplanets.sizeBytes)}</span>
                        </div>
                        <div>
                            <span className="block text-[10px] text-mp-text-muted">Dernier sync :</span>
                            <span
                                className="block truncate text-mp-text-primary"
                                title={formatDate(stats.exoplanets.mtime)}
                            >
                                {formatDate(stats.exoplanets.mtime)}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Variable Stars Card */}
                <div className="rounded-xl border border-mp-glass-border bg-mp-glass-solid p-5 transition-colors hover:border-mp-accent/30">
                    <div className="flex items-start justify-between">
                        <div>
                            <span className="font-mono text-[10px] tracking-wider text-mp-text-muted uppercase">
                                Catalogue Étoiles Variables
                            </span>
                            <h3 className="mt-1 font-serif text-3xl font-light text-mp-accent">
                                {stats.variableStars.count.toLocaleString()}
                            </h3>
                            <p className="mt-1 text-xs text-mp-text-secondary">
                                Cibles VSX (magnitude ≤ {stats.variableStars.maxMagLimit.toFixed(1)})
                            </p>
                        </div>
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-mp-accent/20 bg-mp-accent/10 text-mp-accent">
                            <svg
                                width="20"
                                height="20"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                            >
                                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                            </svg>
                        </div>
                    </div>
                    <div className="mt-6 grid grid-cols-2 gap-4 border-t border-mp-glass-border/40 pt-4 font-mono text-xs">
                        <div>
                            <span className="block text-[10px] text-mp-text-muted">Taille estimée :</span>
                            <span className="text-mp-text-primary">{formatBytes(stats.variableStars.sizeBytes)}</span>
                        </div>
                        <div>
                            <span className="block text-[10px] text-mp-text-muted">Dernier sync :</span>
                            <span
                                className="block truncate text-mp-text-primary"
                                title={formatDate(stats.variableStars.mtime)}
                            >
                                {formatDate(stats.variableStars.mtime)}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Comets Card */}
                <div className="rounded-xl border border-mp-glass-border bg-mp-glass-solid p-5 transition-colors hover:border-mp-accent/30">
                    <div className="flex items-start justify-between">
                        <div>
                            <span className="font-mono text-[10px] tracking-wider text-mp-text-muted uppercase">
                                Catalogue Comètes
                            </span>
                            <h3 className="mt-1 font-serif text-3xl font-light text-mp-accent">
                                {stats.comets.count.toLocaleString()}
                            </h3>
                            <p className="mt-1 text-xs text-mp-text-secondary">
                                {stats.comets.periodicCount?.toLocaleString() || 0} périodiques ·{' '}
                                {stats.comets.nonPeriodicCount?.toLocaleString() || 0} non-périodiques
                            </p>
                        </div>
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-mp-accent/20 bg-mp-accent/10 text-mp-accent">
                            <svg
                                width="20"
                                height="20"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                            >
                                <circle cx="12" cy="12" r="9" />
                                <path d="M18.36 5.64L12 12M12 12l-6.36 6.36M12 12l6.36 6.36M12 12L5.64 5.64" />
                            </svg>
                        </div>
                    </div>
                    <div className="mt-6 grid grid-cols-2 gap-4 border-t border-mp-glass-border/40 pt-4 font-mono text-xs">
                        <div>
                            <span className="block text-[10px] text-mp-text-muted">Taille estimée :</span>
                            <span className="text-mp-text-primary">{formatBytes(stats.comets.sizeBytes)}</span>
                        </div>
                        <div>
                            <span className="block text-[10px] text-mp-text-muted">Dernier sync :</span>
                            <span
                                className="block truncate text-mp-text-primary"
                                title={formatDate(stats.comets.mtime)}
                            >
                                {formatDate(stats.comets.mtime)}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Asteroids Card */}
                <div className="rounded-xl border border-mp-glass-border bg-mp-glass-solid p-5 transition-colors hover:border-mp-accent/30">
                    <div className="flex items-start justify-between">
                        <div>
                            <span className="font-mono text-[10px] tracking-wider text-mp-text-muted uppercase">
                                Catalogue Astéroïdes
                            </span>
                            <h3 className="mt-1 font-serif text-3xl font-light text-mp-accent">
                                {stats.asteroids.count.toLocaleString()}
                            </h3>
                            <p className="mt-1 text-xs text-mp-text-secondary">
                                Géocroiseurs (NEA), inhabituels et distants
                            </p>
                        </div>
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-mp-accent/20 bg-mp-accent/10 text-mp-accent">
                            <svg
                                width="20"
                                height="20"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                            >
                                <circle cx="12" cy="12" r="10" />
                                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                                <path d="M2 12h20" />
                            </svg>
                        </div>
                    </div>
                    <div className="mt-6 grid grid-cols-2 gap-4 border-t border-mp-glass-border/40 pt-4 font-mono text-xs">
                        <div>
                            <span className="block text-[10px] text-mp-text-muted">Taille estimée :</span>
                            <span className="text-mp-text-primary">{formatBytes(stats.asteroids.sizeBytes)}</span>
                        </div>
                        <div>
                            <span className="block text-[10px] text-mp-text-muted">Dernier sync :</span>
                            <span
                                className="block truncate text-mp-text-primary"
                                title={formatDate(stats.asteroids.mtime)}
                            >
                                {formatDate(stats.asteroids.mtime)}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <CatalogueSnapshotsSection
                status={stats.catalogueSnapshots}
                isDisabled={activeScript !== null}
                onGenerate={(args) => runScript('update-catalogues', 'Catalogues', args)}
                formatBytes={formatBytes}
                formatDate={formatDate}
            />

            {/* Segmented Tab Selector */}
            <div className="flex justify-start border-b border-mp-glass-border/60 pb-4">
                <SegmentedTabs<ActiveTab>
                    value={activeTab}
                    onChange={setActiveTab}
                    options={[
                        { value: 'exoplanets', label: 'Exoplanètes' },
                        { value: 'variableStars', label: 'Étoiles Variables' },
                        { value: 'comets', label: 'Comètes' },
                        { value: 'asteroids', label: 'Astéroïdes' },
                    ]}
                />
            </div>

            {/* Tab content area */}
            <div>
                {activeTab === 'exoplanets' ? (
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                        {/* Physical attributes table */}
                        <div className="flex flex-col gap-4 rounded-xl border border-mp-glass-border bg-mp-glass-solid p-5 lg:col-span-2">
                            <h4 className="font-serif text-lg font-light text-mp-text-primary">
                                Valeurs Physiques Extrêmes
                            </h4>
                            <div className="scrollbar-thin overflow-x-auto">
                                <table className="w-full text-left text-xs">
                                    <thead>
                                        <tr className="border-b border-mp-glass-border/60 font-mono text-[10px] text-mp-text-muted uppercase">
                                            <th className="pb-2">Paramètre physique</th>
                                            <th className="pb-2 text-right">Minimum</th>
                                            <th className="pb-2 text-right">Maximum</th>
                                            <th className="pb-2 text-right">Moyenne</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-mp-glass-border/30">
                                        <tr className="hover:bg-mp-ui-black/10">
                                            <td className="py-2.5 font-medium text-mp-text-primary">
                                                Distance (années-lumière)
                                            </td>
                                            <td className="py-2.5 text-right font-mono">
                                                {stats.exoplanets.stats.distance.min.toFixed(1)} al
                                            </td>
                                            <td className="py-2.5 text-right font-mono">
                                                {stats.exoplanets.stats.distance.max.toLocaleString('fr-FR')} al
                                            </td>
                                            <td className="py-2.5 text-right font-mono">
                                                {stats.exoplanets.stats.distance.avg.toFixed(1)} al
                                            </td>
                                        </tr>
                                        <tr className="hover:bg-mp-ui-black/10">
                                            <td className="py-2.5 font-medium text-mp-text-primary">
                                                Période Orbitale (jours)
                                            </td>
                                            <td className="py-2.5 text-right font-mono">
                                                {stats.exoplanets.stats.period.min.toFixed(4)} j
                                            </td>
                                            <td className="py-2.5 text-right font-mono">
                                                {stats.exoplanets.stats.period.max.toLocaleString('fr-FR')} j
                                            </td>
                                            <td className="py-2.5 text-right font-mono">
                                                {stats.exoplanets.stats.period.avg.toFixed(2)} j
                                            </td>
                                        </tr>
                                        <tr className="hover:bg-mp-ui-black/10">
                                            <td className="py-2.5 font-medium text-mp-text-primary">
                                                Masse relative (M<sub>Jup</sub>)
                                            </td>
                                            <td className="py-2.5 text-right font-mono">
                                                {stats.exoplanets.stats.mass.min.toFixed(4)} M<sub>J</sub>
                                            </td>
                                            <td className="py-2.5 text-right font-mono">
                                                {stats.exoplanets.stats.mass.max.toFixed(2)} M<sub>J</sub>
                                            </td>
                                            <td className="py-2.5 text-right font-mono">
                                                {stats.exoplanets.stats.mass.avg.toFixed(2)} M<sub>J</sub>
                                            </td>
                                        </tr>
                                        <tr className="hover:bg-mp-ui-black/10">
                                            <td className="py-2.5 font-medium text-mp-text-primary">
                                                Rayon relatif (R<sub>Jup</sub>)
                                            </td>
                                            <td className="py-2.5 text-right font-mono">
                                                {stats.exoplanets.stats.radius.min.toFixed(3)} R<sub>J</sub>
                                            </td>
                                            <td className="py-2.5 text-right font-mono">
                                                {stats.exoplanets.stats.radius.max.toFixed(2)} R<sub>J</sub>
                                            </td>
                                            <td className="py-2.5 text-right font-mono">
                                                {stats.exoplanets.stats.radius.avg.toFixed(2)} R<sub>J</sub>
                                            </td>
                                        </tr>
                                        <tr className="hover:bg-mp-ui-black/10">
                                            <td className="py-2.5 font-medium text-mp-text-primary">
                                                Magnitude de l'étoile hôte (V)
                                            </td>
                                            <td className="py-2.5 text-right font-mono">
                                                {stats.exoplanets.stats.vMag.min.toFixed(2)} V
                                            </td>
                                            <td className="py-2.5 text-right font-mono">
                                                {stats.exoplanets.stats.vMag.max.toFixed(2)} V
                                            </td>
                                            <td className="py-2.5 text-right font-mono">
                                                {stats.exoplanets.stats.vMag.avg.toFixed(2)} V
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                            <div className="mt-4 flex flex-col gap-3 border-t border-mp-glass-border/40 pt-4 sm:flex-row sm:items-center sm:justify-between">
                                <span className="text-xs text-mp-text-secondary">
                                    Cibles historiques avec traduction de nom :{' '}
                                    <strong className="text-mp-accent">{stats.exoplanets.historicalCount}</strong>{' '}
                                    cibles.
                                </span>
                                <button
                                    type="button"
                                    disabled={activeScript !== null}
                                    onClick={() => runScript('update-exoplanets', 'Exoplanètes')}
                                    className="self-start rounded-md border border-mp-accent bg-mp-accent px-4 py-2 text-xs font-semibold text-mp-ui-black hover:opacity-90 disabled:opacity-50 sm:self-auto"
                                >
                                    ▶ Relancer l'importation exoplanètes
                                </button>
                            </div>
                        </div>

                        {/* Top Constellations */}
                        <div className="flex flex-col gap-4 rounded-xl border border-mp-glass-border bg-mp-glass-solid p-5">
                            <h4 className="font-serif text-lg font-light text-mp-text-primary">Top 5 Constellations</h4>
                            <ul className="space-y-4">
                                {stats.exoplanets.topConstellations.map((constellation) => (
                                    <li key={constellation.name} className="flex flex-col gap-1.5">
                                        <div className="flex items-center justify-between font-mono text-xs">
                                            <span className="text-mp-text-primary">{constellation.name}</span>
                                            <span className="text-mp-text-muted">{constellation.count} cibles</span>
                                        </div>
                                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-mp-ui-black/50">
                                            <div
                                                className="h-full rounded-full bg-mp-accent"
                                                style={{
                                                    width: `${(constellation.count / stats.exoplanets.topConstellations[0].count) * 100}%`,
                                                }}
                                            />
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* Catalogues Sources */}
                        <div className="flex flex-col gap-4 rounded-xl border border-mp-glass-border bg-mp-glass-solid p-5 lg:col-span-3">
                            <h4 className="font-serif text-lg font-light text-mp-text-primary">
                                Catalogues Sources &amp; Provenance
                            </h4>
                            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                                <div className="flex gap-4 rounded-lg border border-mp-glass-border/30 bg-mp-ui-black/20 p-4">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-mp-accent/20 bg-mp-accent/10 font-serif text-sm font-semibold text-mp-accent">
                                        NASA
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <span className="font-mono text-xs font-semibold text-mp-text-primary">
                                            NASA Exoplanet Archive
                                        </span>
                                        <p className="text-xs leading-relaxed text-mp-text-secondary">
                                            Base de données de référence mondiale pour les exoplanètes confirmées.
                                            Fournit les paramètres physiques des planètes, les magnitudes des étoiles
                                            hôtes, les méthodes de découverte et les coordonnées équatoriales (RA/Dec).
                                        </p>
                                        <div className="mt-1 flex items-center gap-2">
                                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                            <span className="font-mono text-[10px] text-mp-text-muted">
                                                Filtre : confirmées + candidats TESS
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex gap-4 rounded-lg border border-mp-glass-border/30 bg-mp-ui-black/20 p-4">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-mp-accent/20 bg-mp-accent/10 font-serif text-sm font-semibold text-mp-accent">
                                        MP
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <span className="font-mono text-xs font-semibold text-mp-text-primary">
                                            Profils Historiques Miroirs Polaires
                                        </span>
                                        <p className="text-xs leading-relaxed text-mp-text-secondary">
                                            Set de 16 planètes clés (ex: 51 Peg b, HD 189733 b) enrichies avec des
                                            descriptions rédigées manuellement en français et des traductions des
                                            dénominations astronomiques en noms d'usage conviviaux.
                                        </p>
                                        <div className="mt-1 flex items-center gap-2">
                                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                            <span className="font-mono text-[10px] text-mp-text-muted">
                                                Fusion automatique par identification
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : activeTab === 'variableStars' ? (
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                        {/* Physical attributes table */}
                        <div className="flex flex-col gap-4 rounded-xl border border-mp-glass-border bg-mp-glass-solid p-5 lg:col-span-2">
                            <h4 className="font-serif text-lg font-light text-mp-text-primary">
                                Valeurs Physiques Extrêmes
                            </h4>
                            <div className="scrollbar-thin overflow-x-auto">
                                <table className="w-full text-left text-xs">
                                    <thead>
                                        <tr className="border-b border-mp-glass-border/60 font-mono text-[10px] text-mp-text-muted uppercase">
                                            <th className="pb-2">Paramètre physique</th>
                                            <th className="pb-2 text-right">Minimum</th>
                                            <th className="pb-2 text-right">Maximum</th>
                                            <th className="pb-2 text-right">Moyenne</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-mp-glass-border/30">
                                        <tr className="hover:bg-mp-ui-black/10">
                                            <td className="py-2.5 font-medium text-mp-text-primary">
                                                Distance (années-lumière)
                                            </td>
                                            <td className="py-2.5 text-right font-mono">
                                                {stats.variableStars.stats.distance.min.toFixed(1)} al
                                            </td>
                                            <td className="py-2.5 text-right font-mono">
                                                {stats.variableStars.stats.distance.max.toLocaleString('fr-FR')} al
                                            </td>
                                            <td className="py-2.5 text-right font-mono">
                                                {stats.variableStars.stats.distance.avg.toFixed(1)} al
                                            </td>
                                        </tr>
                                        <tr className="hover:bg-mp-ui-black/10">
                                            <td className="py-2.5 font-medium text-mp-text-primary">
                                                Période de variabilité (jours)
                                            </td>
                                            <td className="py-2.5 text-right font-mono">
                                                {stats.variableStars.stats.period.min.toFixed(4)} j
                                            </td>
                                            <td className="py-2.5 text-right font-mono">
                                                {stats.variableStars.stats.period.max.toLocaleString('fr-FR')} j
                                            </td>
                                            <td className="py-2.5 text-right font-mono">
                                                {stats.variableStars.stats.period.avg.toFixed(2)} j
                                            </td>
                                        </tr>
                                        <tr className="hover:bg-mp-ui-black/10">
                                            <td className="py-2.5 font-medium text-mp-text-primary">
                                                Éclat maximum (Magnitude max)
                                            </td>
                                            <td className="py-2.5 text-right font-mono">
                                                {stats.variableStars.stats.vMagMin.min.toFixed(2)} V
                                            </td>
                                            <td className="py-2.5 text-right font-mono">
                                                {stats.variableStars.stats.vMagMin.max.toFixed(2)} V
                                            </td>
                                            <td className="py-2.5 text-right font-mono">
                                                {stats.variableStars.stats.vMagMin.avg.toFixed(2)} V
                                            </td>
                                        </tr>
                                        <tr className="hover:bg-mp-ui-black/10">
                                            <td className="py-2.5 font-medium text-mp-text-primary">
                                                Éclat minimum (Magnitude min)
                                            </td>
                                            <td className="py-2.5 text-right font-mono">
                                                {stats.variableStars.stats.vMagMax.min.toFixed(2)} V
                                            </td>
                                            <td className="py-2.5 text-right font-mono">
                                                {stats.variableStars.stats.vMagMax.max.toFixed(2)} V
                                            </td>
                                            <td className="py-2.5 text-right font-mono">
                                                {stats.variableStars.stats.vMagMax.avg.toFixed(2)} V
                                            </td>
                                        </tr>
                                        <tr className="hover:bg-mp-ui-black/10">
                                            <td className="py-2.5 font-medium text-mp-text-primary">
                                                Amplitude de variation (Δm)
                                            </td>
                                            <td className="py-2.5 text-right font-mono">
                                                {stats.variableStars.stats.amplitude.min.toFixed(2)} mag
                                            </td>
                                            <td className="py-2.5 text-right font-mono">
                                                {stats.variableStars.stats.amplitude.max.toFixed(2)} mag
                                            </td>
                                            <td className="py-2.5 text-right font-mono">
                                                {stats.variableStars.stats.amplitude.avg.toFixed(2)} mag
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                            <div className="mt-4 flex flex-col gap-4 border-t border-mp-glass-border/40 pt-4 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex items-center gap-3">
                                    <label
                                        htmlFor="max-mag-input"
                                        className="text-xs whitespace-nowrap text-mp-text-secondary"
                                    >
                                        Magnitude maximale à importer :
                                    </label>
                                    <input
                                        id="max-mag-input"
                                        type="number"
                                        step="0.5"
                                        min="1"
                                        max="25"
                                        disabled={activeScript !== null}
                                        value={maxMag}
                                        onChange={(e) => setMaxMag(parseFloat(e.target.value) || 25.0)}
                                        className="w-16 rounded-sm border border-mp-glass-border bg-mp-ui-black/60 px-2 py-1 text-center font-mono text-xs text-mp-text-primary focus:border-mp-accent focus:ring-0"
                                    />
                                </div>
                                <div className="flex flex-wrap gap-2 self-start sm:self-auto">
                                    <button
                                        type="button"
                                        disabled={activeScript !== null}
                                        onClick={() =>
                                            runScript('update-variable-stars', 'Étoiles Variables', ['--fresh'])
                                        }
                                        className="rounded-md border border-mp-astro-red/50 bg-mp-astro-red/10 px-4 py-2 text-xs font-semibold text-mp-astro-red hover:bg-mp-astro-red/20 disabled:opacity-50"
                                    >
                                        🗑️ Nouvel import complet (efface tout)
                                    </button>
                                    <button
                                        type="button"
                                        disabled={activeScript !== null}
                                        onClick={() => runScript('update-variable-stars', 'Étoiles Variables', [])}
                                        className="rounded-md border border-mp-accent bg-mp-accent px-4 py-2 text-xs font-semibold text-mp-ui-black hover:opacity-90 disabled:opacity-50"
                                    >
                                        🔁 Reprendre l'importation (en cours)
                                    </button>
                                    <button
                                        type="button"
                                        disabled={activeScript !== null}
                                        onClick={() =>
                                            runScript('update-variable-stars', 'Étoiles Variables', ['--no-clean'])
                                        }
                                        className="rounded-md border border-mp-accent/60 bg-mp-accent/10 px-4 py-2 text-xs font-semibold text-mp-accent hover:bg-mp-accent/20 disabled:opacity-50"
                                    >
                                        🔄 Remplir les trous (sans effacer)
                                    </button>
                                    <button
                                        type="button"
                                        disabled={activeScript !== null}
                                        onClick={() => runScript('crossmatch-variable-stars', 'Étoiles Variables', [])}
                                        className="rounded-md border border-mp-accent/60 bg-mp-accent/10 px-4 py-2 text-xs font-semibold text-mp-accent hover:bg-mp-accent/20 disabled:opacity-50"
                                    >
                                        📡 Lancer le cross-match Gaia
                                    </button>
                                    <button
                                        type="button"
                                        disabled={activeScript !== null}
                                        onClick={() => runScript('check-variable-stars', 'Étoiles Variables', [])}
                                        className="rounded-md border border-mp-glass-border bg-mp-glass-solid px-4 py-2 text-xs font-semibold text-mp-text-primary hover:border-mp-accent/30 disabled:opacity-50"
                                    >
                                        🔍 Auditer la base d'étoiles
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Types breakdown & top constellations */}
                        <div className="flex flex-col gap-6">
                            {/* Variable star types distribution */}
                            <div className="flex flex-col gap-4 rounded-xl border border-mp-glass-border bg-mp-glass-solid p-5">
                                <h4 className="font-serif text-lg font-light text-mp-text-primary">
                                    Distribution par Famille
                                </h4>
                                <ul className="space-y-4">
                                    {Object.entries(stats.variableStars.typesDistribution)
                                        .sort((a, b) => b[1] - a[1])
                                        .map(([type, count]) => {
                                            const pct =
                                                stats.variableStars.count > 0
                                                    ? (count / stats.variableStars.count) * 100
                                                    : 0;
                                            return (
                                                <li key={type} className="flex flex-col gap-1.5">
                                                    <div className="flex items-center justify-between font-mono text-xs">
                                                        <span className="text-mp-text-primary">
                                                            {TYPE_LABELS[type] || type}
                                                        </span>
                                                        <span className="text-mp-text-muted">
                                                            {count} ({pct.toFixed(1)}%)
                                                        </span>
                                                    </div>
                                                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-mp-ui-black/50">
                                                        <div
                                                            className={`h-full rounded-full ${TYPE_COLORS[type] || 'bg-mp-accent'}`}
                                                            style={{ width: `${pct}%` }}
                                                        />
                                                    </div>
                                                </li>
                                            );
                                        })}
                                </ul>
                            </div>

                            {/* Top Constellations */}
                            <div className="flex flex-col gap-4 rounded-xl border border-mp-glass-border bg-mp-glass-solid p-5">
                                <h4 className="font-serif text-lg font-light text-mp-text-primary">
                                    Top 5 Constellations
                                </h4>
                                <ul className="space-y-4">
                                    {stats.variableStars.topConstellations.map((constellation) => (
                                        <li key={constellation.name} className="flex flex-col gap-1.5">
                                            <div className="flex items-center justify-between font-mono text-xs">
                                                <span className="text-mp-text-primary">{constellation.name}</span>
                                                <span className="text-mp-text-muted">{constellation.count} cibles</span>
                                            </div>
                                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-mp-ui-black/50">
                                                <div
                                                    className="h-full rounded-full bg-mp-accent"
                                                    style={{
                                                        width: `${(constellation.count / stats.variableStars.topConstellations[0].count) * 100}%`,
                                                    }}
                                                />
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>

                        {/* Catalogues Sources */}
                        <div className="flex flex-col gap-4 rounded-xl border border-mp-glass-border bg-mp-glass-solid p-5 lg:col-span-3">
                            <h4 className="font-serif text-lg font-light text-mp-text-primary">
                                Catalogues Sources &amp; Provenance
                            </h4>
                            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                                <div className="flex gap-4 rounded-lg border border-mp-glass-border/30 bg-mp-ui-black/20 p-4">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-mp-accent/20 bg-mp-accent/10 font-serif text-sm font-semibold text-mp-accent">
                                        AAVSO
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <span className="font-mono text-xs font-semibold text-mp-text-primary">
                                            AAVSO VSX (catalogue B/vsx)
                                        </span>
                                        <p className="text-xs leading-relaxed text-mp-text-secondary">
                                            Le catalogue VSX (International Variable Star Index) géré par l'AAVSO
                                            fournit les types de variabilité (éclipses, céphéides, miras,
                                            cataclysmiques), les amplitudes de magnitude, les époques et les périodes de
                                            pulsation précises.
                                        </p>
                                        <div className="mt-1 flex items-center gap-2">
                                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                            <span className="font-mono text-[10px] text-mp-text-muted">
                                                Filtre : mag ≤ 12.0 &amp; Période connue
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex gap-4 rounded-lg border border-mp-glass-border/30 bg-mp-ui-black/20 p-4">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-mp-accent/20 bg-mp-accent/10 font-serif text-sm font-semibold text-mp-accent">
                                        Gaia
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <span className="font-mono text-xs font-semibold text-mp-text-primary">
                                            Gaia DR3 (catalogue I/355)
                                        </span>
                                        <p className="text-xs leading-relaxed text-mp-text-secondary">
                                            Catalogue d'astrométrie de l'ESA. Le pipeline interroge le service CDS
                                            XMatch pour associer chaque étoile variable à sa parallaxe Gaia DR3 et
                                            calculer sa distance tridimensionnelle réelle en années-lumière.
                                        </p>
                                        <div className="mt-1 flex items-center gap-2">
                                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                            <span className="font-mono text-[10px] text-mp-text-muted">
                                                Cross-match spatial (rayon = 3")
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex gap-4 rounded-lg border border-mp-glass-border/30 bg-mp-ui-black/20 p-4">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-mp-accent/20 bg-mp-accent/10 font-serif text-sm font-semibold text-mp-accent">
                                        LC
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <span className="font-mono text-xs font-semibold text-mp-text-primary">
                                            ASAS-SN / ZTF / AAVSO LCG
                                        </span>
                                        <p className="text-xs leading-relaxed text-mp-text-secondary">
                                            Relevés photométriques externes connectés dynamiquement dans l'application.
                                            Les coordonnées RA/Dec et noms de cible génèrent des passerelles vers les
                                            courbes de lumière de suivi réelles.
                                        </p>
                                        <div className="mt-1 flex items-center gap-2">
                                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                            <span className="font-mono text-[10px] text-mp-text-muted">
                                                Génération de liens dynamiques
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : activeTab === 'comets' ? (
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                        {/* Physical attributes table */}
                        <div className="flex flex-col gap-4 rounded-xl border border-mp-glass-border bg-mp-glass-solid p-5 lg:col-span-2">
                            <h4 className="font-serif text-lg font-light text-mp-text-primary">
                                Paramètres Orbitaux Extrêmes
                            </h4>
                            <div className="scrollbar-thin overflow-x-auto">
                                <table className="w-full text-left text-xs">
                                    <thead>
                                        <tr className="border-b border-mp-glass-border/60 font-mono text-[10px] text-mp-text-muted uppercase">
                                            <th className="pb-2">Paramètre orbital</th>
                                            <th className="pb-2 text-right">Minimum</th>
                                            <th className="pb-2 text-right">Maximum</th>
                                            <th className="pb-2 text-right">Moyenne</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-mp-glass-border/30">
                                        <tr className="hover:bg-mp-ui-black/10">
                                            <td className="py-2.5 font-medium text-mp-text-primary">
                                                Distance au périhélie (q)
                                            </td>
                                            <td className="py-2.5 text-right font-mono">
                                                {stats.comets.stats.q.min.toFixed(3)} UA
                                            </td>
                                            <td className="py-2.5 text-right font-mono">
                                                {stats.comets.stats.q.max.toFixed(2)} UA
                                            </td>
                                            <td className="py-2.5 text-right font-mono">
                                                {stats.comets.stats.q.avg.toFixed(2)} UA
                                            </td>
                                        </tr>
                                        <tr className="hover:bg-mp-ui-black/10">
                                            <td className="py-2.5 font-medium text-mp-text-primary">
                                                Excentricité (e)
                                            </td>
                                            <td className="py-2.5 text-right font-mono">
                                                {stats.comets.stats.e.min.toFixed(4)}
                                            </td>
                                            <td className="py-2.5 text-right font-mono">
                                                {stats.comets.stats.e.max.toFixed(4)}
                                            </td>
                                            <td className="py-2.5 text-right font-mono">
                                                {stats.comets.stats.e.avg.toFixed(4)}
                                            </td>
                                        </tr>
                                        <tr className="hover:bg-mp-ui-black/10">
                                            <td className="py-2.5 font-medium text-mp-text-primary">
                                                Magnitude absolue (g)
                                            </td>
                                            <td className="py-2.5 text-right font-mono">
                                                {stats.comets.stats.mag.min.toFixed(1)}
                                            </td>
                                            <td className="py-2.5 text-right font-mono">
                                                {stats.comets.stats.mag.max.toFixed(1)}
                                            </td>
                                            <td className="py-2.5 text-right font-mono">
                                                {stats.comets.stats.mag.avg.toFixed(1)}
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                            <div className="mt-4 flex flex-col gap-4 border-t border-mp-glass-border/40 pt-4 sm:flex-row sm:items-center sm:justify-between">
                                <span className="text-xs text-mp-text-secondary">
                                    Mis à jour depuis le Minor Planet Center pour garantir la précision des calculs.
                                </span>
                                <button
                                    type="button"
                                    disabled={activeScript !== null}
                                    onClick={() => runScript('update-comets', 'Comètes')}
                                    className="self-start rounded-md border border-mp-accent bg-mp-accent px-4 py-2 text-xs font-semibold text-mp-ui-black hover:opacity-90 disabled:opacity-50 sm:self-auto"
                                >
                                    ▶ Relancer l'importation comètes
                                </button>
                            </div>
                        </div>

                        {/* Distribution periodic / non-periodic */}
                        <div className="flex flex-col gap-6">
                            <div className="flex flex-col gap-4 rounded-xl border border-mp-glass-border bg-mp-glass-solid p-5">
                                <h4 className="font-serif text-lg font-light text-mp-text-primary">Classification</h4>
                                <ul className="space-y-4">
                                    <li className="flex flex-col gap-1.5">
                                        <div className="flex items-center justify-between font-mono text-xs">
                                            <span className="text-mp-text-primary">
                                                Comètes Périodiques (e &lt; 0.9)
                                            </span>
                                            <span className="text-mp-text-muted">
                                                {stats.comets.periodicCount} (
                                                {stats.comets.count > 0
                                                    ? ((stats.comets.periodicCount / stats.comets.count) * 100).toFixed(
                                                          1,
                                                      )
                                                    : 0}
                                                %)
                                            </span>
                                        </div>
                                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-mp-ui-black/50">
                                            <div
                                                className="h-full rounded-full bg-mp-accent"
                                                style={{
                                                    width: `${stats.comets.count > 0 ? (stats.comets.periodicCount / stats.comets.count) * 100 : 0}%`,
                                                }}
                                            />
                                        </div>
                                    </li>
                                    <li className="flex flex-col gap-1.5">
                                        <div className="flex items-center justify-between font-mono text-xs">
                                            <span className="text-mp-text-primary">
                                                Comètes Non-Périodiques (e ≥ 0.9)
                                            </span>
                                            <span className="text-mp-text-muted">
                                                {stats.comets.nonPeriodicCount} (
                                                {stats.comets.count > 0
                                                    ? (
                                                          (stats.comets.nonPeriodicCount / stats.comets.count) *
                                                          100
                                                      ).toFixed(1)
                                                    : 0}
                                                %)
                                            </span>
                                        </div>
                                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-mp-ui-black/50">
                                            <div
                                                className="h-full rounded-full bg-amber-500"
                                                style={{
                                                    width: `${stats.comets.count > 0 ? (stats.comets.nonPeriodicCount / stats.comets.count) * 100 : 0}%`,
                                                }}
                                            />
                                        </div>
                                    </li>
                                </ul>
                            </div>
                        </div>

                        {/* Catalogues Sources */}
                        <div className="flex flex-col gap-4 rounded-xl border border-mp-glass-border bg-mp-glass-solid p-5 lg:col-span-3">
                            <h4 className="font-serif text-lg font-light text-mp-text-primary">
                                Catalogues Sources &amp; Provenance
                            </h4>
                            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                                <div className="flex gap-4 rounded-lg border border-mp-glass-border/30 bg-mp-ui-black/20 p-4">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-mp-accent/20 bg-mp-accent/10 font-serif text-sm font-semibold text-mp-accent">
                                        MPC
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <span className="font-mono text-xs font-semibold text-mp-text-primary">
                                            Minor Planet Center (IAU)
                                        </span>
                                        <p className="text-xs leading-relaxed text-mp-text-secondary">
                                            Organisme officiel chargé de la collecte des données d'observation des
                                            petites planètes et comètes. Le fichier CometEls.txt fournit les éléments
                                            képlériens requis pour modéliser les orbites.
                                        </p>
                                        <div className="mt-1 flex items-center gap-2">
                                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                            <span className="font-mono text-[10px] text-mp-text-muted">
                                                Format : 1-line orbital elements
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex gap-4 rounded-lg border border-mp-glass-border/30 bg-mp-ui-black/20 p-4">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-mp-accent/20 bg-mp-accent/10 font-serif text-sm font-semibold text-mp-accent">
                                        JPL
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <span className="font-mono text-xs font-semibold text-mp-text-primary">
                                            JPL Small-Body Database (NASA)
                                        </span>
                                        <p className="text-xs leading-relaxed text-mp-text-secondary">
                                            Base de données du Jet Propulsion Laboratory pour les corps mineurs du
                                            système solaire, utilisée pour les liens de référence croisée de chaque
                                            comète.
                                        </p>
                                        <div className="mt-1 flex items-center gap-2">
                                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                            <span className="font-mono text-[10px] text-mp-text-muted">
                                                Passerelle dynamique de validation
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                        {/* Physical attributes table */}
                        <div className="flex flex-col gap-4 rounded-xl border border-mp-glass-border bg-mp-glass-solid p-5 lg:col-span-2">
                            <h4 className="font-serif text-lg font-light text-mp-text-primary">
                                Paramètres Orbitaux Extrêmes
                            </h4>
                            <div className="scrollbar-thin overflow-x-auto">
                                <table className="w-full text-left text-xs">
                                    <thead>
                                        <tr className="border-b border-mp-glass-border/60 font-mono text-[10px] text-mp-text-muted uppercase">
                                            <th className="pb-2">Paramètre orbital</th>
                                            <th className="pb-2 text-right">Minimum</th>
                                            <th className="pb-2 text-right">Maximum</th>
                                            <th className="pb-2 text-right">Moyenne</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-mp-glass-border/30">
                                        <tr className="hover:bg-mp-ui-black/10">
                                            <td className="py-2.5 font-medium text-mp-text-primary">
                                                Demi-grand axe (a)
                                            </td>
                                            <td className="py-2.5 text-right font-mono">
                                                {stats.asteroids.stats.a.min.toFixed(3)} UA
                                            </td>
                                            <td className="py-2.5 text-right font-mono">
                                                {stats.asteroids.stats.a.max.toFixed(2)} UA
                                            </td>
                                            <td className="py-2.5 text-right font-mono">
                                                {stats.asteroids.stats.a.avg.toFixed(2)} UA
                                            </td>
                                        </tr>
                                        <tr className="hover:bg-mp-ui-black/10">
                                            <td className="py-2.5 font-medium text-mp-text-primary">
                                                Excentricité (e)
                                            </td>
                                            <td className="py-2.5 text-right font-mono">
                                                {stats.asteroids.stats.e.min.toFixed(4)}
                                            </td>
                                            <td className="py-2.5 text-right font-mono">
                                                {stats.asteroids.stats.e.max.toFixed(4)}
                                            </td>
                                            <td className="py-2.5 text-right font-mono">
                                                {stats.asteroids.stats.e.avg.toFixed(4)}
                                            </td>
                                        </tr>
                                        <tr className="hover:bg-mp-ui-black/10">
                                            <td className="py-2.5 font-medium text-mp-text-primary">
                                                Magnitude absolue (H)
                                            </td>
                                            <td className="py-2.5 text-right font-mono">
                                                {stats.asteroids.stats.h.min.toFixed(1)}
                                            </td>
                                            <td className="py-2.5 text-right font-mono">
                                                {stats.asteroids.stats.h.max.toFixed(1)}
                                            </td>
                                            <td className="py-2.5 text-right font-mono">
                                                {stats.asteroids.stats.h.avg.toFixed(1)}
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                            <div className="mt-4 flex flex-col gap-4 border-t border-mp-glass-border/40 pt-4 sm:flex-row sm:items-center sm:justify-between">
                                <span className="text-xs text-mp-text-secondary">
                                    Mis à jour depuis le Minor Planet Center pour garantir la précision des éphémérides
                                    de passage.
                                </span>
                                <button
                                    type="button"
                                    disabled={activeScript !== null}
                                    onClick={() => runScript('update-asteroids', 'Astéroïdes')}
                                    className="self-start rounded-md border border-mp-accent bg-mp-accent px-4 py-2 text-xs font-semibold text-mp-ui-black hover:opacity-90 disabled:opacity-50 sm:self-auto"
                                >
                                    ▶ Relancer l'importation astéroïdes
                                </button>
                            </div>
                        </div>

                        {/* Description / Information */}
                        <div className="flex flex-col gap-6">
                            <div className="flex flex-col gap-4 rounded-xl border border-mp-glass-border bg-mp-glass-solid p-5">
                                <h4 className="font-serif text-lg font-light text-mp-text-primary">
                                    Catalogue Élargi d'Astéroïdes
                                </h4>
                                <p className="text-xs leading-relaxed text-mp-text-secondary">
                                    Ce catalogue comprend les astéroïdes géocroiseurs (NEAs/NEOs), les objets distants
                                    (Centaures et objets transneptuniens) ainsi que les orbites inhabituelles référencés
                                    par le Minor Planet Center de l'IAU.
                                </p>
                            </div>
                        </div>

                        {/* Catalogues Sources */}
                        <div className="flex flex-col gap-4 rounded-xl border border-mp-glass-border bg-mp-glass-solid p-5 lg:col-span-3">
                            <h4 className="font-serif text-lg font-light text-mp-text-primary">
                                Catalogues Sources &amp; Provenance
                            </h4>
                            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                                <div className="flex gap-4 rounded-lg border border-mp-glass-border/30 bg-mp-ui-black/20 p-4">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-mp-accent/20 bg-mp-accent/10 font-serif text-sm font-semibold text-mp-accent">
                                        MPC
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <span className="font-mono text-xs font-semibold text-mp-text-primary">
                                            Minor Planet Center (IAU)
                                        </span>
                                        <p className="text-xs leading-relaxed text-mp-text-secondary">
                                            L'IAU Minor Planet Center est le centre mondial chargé de la désignation et
                                            du calcul des orbites des planètes mineures. Le fichier PHA.txt contient les
                                            éléments orbitaux de référence.
                                        </p>
                                        <div className="mt-1 flex items-center gap-2">
                                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                            <span className="font-mono text-[10px] text-mp-text-muted">
                                                Format : 1-line orbital elements
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex gap-4 rounded-lg border border-mp-glass-border/30 bg-mp-ui-black/20 p-4">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-mp-accent/20 bg-mp-accent/10 font-serif text-sm font-semibold text-mp-accent">
                                        JPL
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <span className="font-mono text-xs font-semibold text-mp-text-primary">
                                            JPL Small-Body Database (NASA)
                                        </span>
                                        <p className="text-xs leading-relaxed text-mp-text-secondary">
                                            Le système de recherche de corps mineurs de la NASA/JPL sert à valider et à
                                            lier les orbites des astéroïdes à des éphémérides et modèles 3D interactifs
                                            externes.
                                        </p>
                                        <div className="mt-1 flex items-center gap-2">
                                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                            <span className="font-mono text-[10px] text-mp-text-muted">
                                                Passerelle dynamique de validation
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
