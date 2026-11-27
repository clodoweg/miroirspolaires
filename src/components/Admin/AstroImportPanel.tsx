/**
 * Panneau « Importer » des astrophotos (`/admin/astrophotos/importer`).
 *
 * Responsabilité : un seul bouton « Mettre à jour les photos », avec ses options en cases à cocher, et le
 * suivi de l'exécution.
 *  - En local (`npm run dev`) : `update-photos.mjs`, case `--dry-run`, sortie en direct (`ScriptConsole`).
 *    Le scrape AstroBin se lance d'abord à la main dans le dépôt `astrobin`.
 *  - À distance : job GitHub Actions `update-photos-ci`, case `--force-media` (entrée `update-photos-ci-force`),
 *    suivi du job et de son journal (`useRemoteJobs`). Le scrape fait partie du job. Un second bouton redessine
 *    seulement les calques d'annotations (`update-annotations-ci`, case `--all`), sans retélécharger les photos.
 *
 * POURQUOI une case plutôt que deux boutons : « Tout recopier » n'est que la même mise à jour avec une option,
 * à cocher après avoir retraité des photos sur AstroBin ; deux boutons laissaient croire à deux workflows.
 */
import { useId, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import AdminProviders from './AdminProviders';
import { useConfirm } from './ConfirmDialog';
import RemoteJobHistory from './RemoteJobHistory';
import ScriptConsole from './ScriptConsole';
import { useToast } from './Toast';
import { useRemoteJobs } from './useRemoteJobs';
import { WEB_IMAGES_CHANGED_EVENT } from './WebImagesReminder';

/** Entrées de `SCRIPTS` lancées par ce panneau à distance. */
export const ASTRO_IMPORT_JOB_IDS = ['update-photos-ci', 'update-photos-ci-force', 'update-annotations-ci'] as const;

const LOCAL_SCRIPT_ID = 'update-photos';
const PANEL_ID = 'astro-import';

const IMPORT_STEPS = [
    'Import du CSV, du HTML et des médias absents ou modifiés',
    'Déplacement des photos dont l’année a changé',
    'Miniatures, alts (depuis le CSV), fiches techniques et descriptions Wikipedia',
    'Envoi sur R2 (absents ou modifiés, rien n’est supprimé)',
    'Dimensions et versions web',
];

interface Props {
    /** Admin distant : le panneau lance un job GitHub Actions au lieu d'un script local. */
    remote: boolean;
}

/**
 * Panneau d'import, avec ses propres fournisseurs (îlot autonome).
 *
 * @param props.remote - Mode de l'admin.
 * @returns Le panneau.
 */
export default function AstroImportPanel({ remote }: Props) {
    return (
        <AdminProviders>
            <div className="flex flex-col gap-6">
                {remote ? <RemoteImport /> : <LocalImport />}
                <NextSteps remote={remote} />
            </div>
        </AdminProviders>
    );
}

function OptionCheckbox({
    flag,
    label,
    help,
    warning,
    checked,
    onChange,
}: {
    flag: string;
    label: string;
    help: string;
    warning?: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
}) {
    const id = useId();
    return (
        <div
            className={`flex flex-col gap-2 rounded-xl border p-4 ${
                checked && warning ? 'border-mp-astro-red/50' : 'border-mp-glass-border'
            }`}
        >
            <label htmlFor={id} className="flex min-h-touch cursor-pointer items-center gap-3">
                <input
                    id={id}
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => onChange(event.target.checked)}
                    className="h-4 w-4 accent-mp-accent"
                />
                <code className="font-mono text-sm text-mp-accent">{flag}</code>
                <span className="text-sm text-mp-text-primary">{label}</span>
            </label>
            <p className="pl-7 text-sm text-mp-text-secondary">{help}</p>
            {checked && warning && <p className="pl-7 text-sm text-mp-astro-red">{warning}</p>}
        </div>
    );
}

/**
 * Lit la liste d'ID AstroBin saisie (séparés par des virgules ou des espaces).
 *
 * @param input - Saisie.
 * @returns Les ID sans doublon, ou `null` si une valeur n'est pas un ID ou s'il y en a plus de 50.
 */
export function parseRefreshIds(input: string): string[] | null {
    const ids = [...new Set(input.split(/[\s,]+/).filter(Boolean))];
    if (ids.length > 50 || ids.some((id) => !/^\d{1,12}$/.test(id))) return null;
    return ids;
}

function RefreshIdsField({
    value,
    onChange,
    invalid,
}: {
    value: string;
    onChange: (value: string) => void;
    invalid: boolean;
}) {
    const id = useId();
    return (
        <div className="flex flex-col gap-2 rounded-xl border border-mp-glass-border p-4">
            <label htmlFor={id} className="flex flex-wrap items-center gap-3">
                <code className="font-mono text-sm text-mp-accent">--refresh-ids</code>
                <span className="text-sm text-mp-text-primary">Photos retraitées (ID AstroBin)</span>
                <input
                    id={id}
                    type="text"
                    inputMode="numeric"
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    placeholder="ex. 1213620"
                    aria-invalid={invalid}
                    className="admin-input max-w-xs font-mono"
                />
            </label>
            <p className="text-sm text-mp-text-secondary">
                Pour une ou quelques photos retraitées sur AstroBin : tous leurs médias sont retéléchargés et remplacés,
                sans recopier toute la galerie. Laisser vide pour une mise à jour simple.
            </p>
            {invalid && <p className="text-sm text-mp-astro-red">Des ID AstroBin (chiffres), 50 au plus.</p>}
        </div>
    );
}

function StepsList({ firstStep }: { firstStep: string }) {
    return (
        <ol className="grid list-decimal gap-1 pl-5 text-sm text-mp-text-secondary md:grid-cols-2">
            {[firstStep, ...IMPORT_STEPS].map((step) => (
                <li key={step}>{step}</li>
            ))}
        </ol>
    );
}

const primaryButtonClass =
    'inline-flex min-h-touch items-center justify-center gap-2 rounded-md bg-mp-accent px-5 text-sm font-semibold text-mp-bg transition-opacity hover:opacity-90 disabled:opacity-50';

function LocalImport() {
    const toast = useToast();
    const confirm = useConfirm();
    const [dryRun, setDryRun] = useState(false);
    const [run, setRun] = useState<{ nonce: number; args: string[] } | null>(null);
    const [isRunning, setIsRunning] = useState(false);

    const start = async () => {
        const accepted = await confirm({
            title: dryRun ? 'Simuler la mise à jour des photos ?' : 'Mettre à jour les photos ?',
            message: dryRun
                ? 'Rien n’est écrit, ni en local ni sur R2 : le script indique seulement ce qu’il ferait.'
                : 'Le script écrit dans src/assets/, src/data/ et sur le R2 de production. Rien n’est supprimé sur R2.',
            tone: dryRun ? 'default' : 'danger',
            confirmLabel: 'Lancer',
        });
        if (!accepted) return;
        setIsRunning(true);
        setRun((previous) => ({ nonce: (previous?.nonce ?? 0) + 1, args: dryRun ? ['--dry-run'] : [] }));
    };

    return (
        <section className="flex flex-col gap-4 rounded-xl border border-mp-border-accent bg-mp-accent/5 p-5">
            <h2 className="font-serif text-xl font-light text-mp-text-heading">Mettre à jour les photos</h2>
            <div className="flex flex-col gap-1 text-sm text-mp-text-secondary">
                <p>Avant, dans le dépôt astrobin, à la main :</p>
                <code className="self-start rounded bg-mp-ui-black/40 px-2 py-1 font-mono text-mp-text-primary">
                    python3 scrape_astrobin.py --incremental
                </code>
            </div>
            <StepsList firstStep="Import depuis le dépôt astrobin voisin" />
            <OptionCheckbox
                flag="--dry-run"
                label="Simulation"
                help="Rien n’est écrit, ni en local ni sur R2 (R2 est seulement interrogé). Les étapes sans simulation (miniatures, SEO, dimensions) sont signalées et sautées."
                checked={dryRun}
                onChange={setDryRun}
            />
            <div className="flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => void start()} disabled={isRunning} className={primaryButtonClass}>
                    <RefreshCw
                        className={`h-4 w-4 ${isRunning ? 'motion-safe:animate-spin' : ''}`}
                        aria-hidden="true"
                    />
                    {dryRun ? 'Simuler la mise à jour' : 'Mettre à jour les photos'}
                </button>
                <code className="font-mono text-xs text-mp-text-muted">
                    node scripts/pipeline/update-photos.mjs{dryRun ? ' --dry-run' : ''}
                </code>
            </div>
            {run && (
                <ScriptConsole
                    runId={LOCAL_SCRIPT_ID}
                    args={run.args}
                    runNonce={run.nonce}
                    panelId={PANEL_ID}
                    onExit={(code) => {
                        setIsRunning(false);
                        // POURQUOI : le rappel des versions web est un îlot séparé, à rafraîchir lui aussi.
                        window.dispatchEvent(new Event(WEB_IMAGES_CHANGED_EVENT));
                        if (code === 0) {
                            toast.success('Pensez à committer les fichiers listés dans la console.', {
                                title: 'Photos à jour',
                            });
                        } else {
                            toast.error('Voir le détail dans la console.', { title: 'Mise à jour incomplète' });
                        }
                    }}
                    onClose={() => {
                        setRun(null);
                        sessionStorage.removeItem(`script-console-${PANEL_ID}`);
                    }}
                />
            )}
        </section>
    );
}

function RemoteImport() {
    const toast = useToast();
    const confirm = useConfirm();
    const { data, loadError, selectedJob, logs, selectJob, launch, cancel, hasActiveJob } =
        useRemoteJobs(ASTRO_IMPORT_JOB_IDS);
    const [forceMedia, setForceMedia] = useState(false);
    const [astrobinAnnotations, setAstrobinAnnotations] = useState(false);
    const [redrawAll, setRedrawAll] = useState(false);
    // POURQUOI : la fiche d'une photo renvoie ici avec ?refresh=<ID> pour la reprendre après retraitement.
    const [refreshInput, setRefreshInput] = useState(() =>
        typeof window === 'undefined' ? '' : (new URLSearchParams(window.location.search).get('refresh') ?? ''),
    );
    const [busy, setBusy] = useState(false);
    const refreshIds = parseRefreshIds(refreshInput);
    const hasInvalidIds = refreshIds === null;
    const scriptId = forceMedia ? 'update-photos-ci-force' : 'update-photos-ci';

    const start = async () => {
        const accepted = await confirm({
            title: forceMedia ? 'Tout recopier depuis AstroBin ?' : 'Mettre à jour les photos ?',
            message: forceMedia
                ? 'Le job retélécharge tous les médias (environ 2,8 Go) et régénère miniatures et versions web. Seuls les fichiers qui diffèrent sont remplacés sur R2. Durée : 30 min à 1 h.'
                : 'Le job télécharge les photos absentes de R2, les traite, les envoie sur R2, puis committe le CSV et les manifestes sur dev.',
            tone: 'danger',
            confirmLabel: 'Lancer',
        });
        if (!accepted) return;
        setBusy(true);
        try {
            await launch(scriptId, {
                ...(!forceMedia && refreshIds && refreshIds.length > 0 ? { refreshIds } : {}),
                ...(astrobinAnnotations ? { astrobinAnnotations: true } : {}),
            });
            toast.success('Job lancé : le run GitHub Actions démarre dans quelques secondes.');
        } catch (error) {
            toast.error(String((error as Error).message ?? error), { title: 'Lancement impossible' });
        } finally {
            setBusy(false);
        }
    };

    const startAnnotations = async () => {
        const accepted = await confirm({
            title: redrawAll ? 'Redessiner toutes les annotations ?' : 'Redessiner les annotations manquantes ?',
            message: redrawAll
                ? 'Le job redessine le calque de chaque photo, l’envoie sur R2 et purge le CDN. Quelques minutes.'
                : 'Le job redessine les calques absents ou venant encore d’AstroBin, les envoie sur R2 et purge le CDN. Quelques minutes.',
            tone: 'danger',
            confirmLabel: 'Lancer',
        });
        if (!accepted) return;
        setBusy(true);
        try {
            await launch('update-annotations-ci', redrawAll ? { all: true } : undefined);
            toast.success('Job lancé : le run GitHub Actions démarre dans quelques secondes.');
        } catch (error) {
            toast.error(String((error as Error).message ?? error), { title: 'Lancement impossible' });
        } finally {
            setBusy(false);
        }
    };

    const cancelJob = async (job: Parameters<typeof cancel>[0]) => {
        if (!(await confirm({ title: 'Annuler ce job ?', tone: 'danger', confirmLabel: 'Annuler le job' }))) return;
        const error = await cancel(job);
        if (error) toast.error(error, { title: 'Annulation impossible' });
    };

    if (loadError) return <p className="text-sm text-red-700 dark:text-red-400">Chargement impossible : {loadError}</p>;
    if (!data) {
        return (
            <p className="flex items-center gap-2 text-sm text-mp-text-muted">
                <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
            </p>
        );
    }

    const scriptLabel = (id: string) => data.scripts.find((script) => script.id === id)?.label ?? id;

    return (
        <>
            <section className="flex flex-col gap-4 rounded-xl border border-mp-border-accent bg-mp-accent/5 p-5">
                <h2 className="font-serif text-xl font-light text-mp-text-heading">Mettre à jour les photos</h2>
                <p className="text-sm text-mp-text-secondary">
                    Tout se fait dans GitHub Actions ; le CSV et les manifestes sont committés sur dev si le job
                    réussit.
                </p>
                <StepsList firstStep="Scrape AstroBin (photos absentes de R2)" />
                <OptionCheckbox
                    flag="--force-media"
                    label="Tout recopier depuis AstroBin"
                    help="À cocher après avoir retraité des photos sur AstroBin : sans cette case, seules les photos absentes de R2 sont téléchargées et une image retraitée n’est jamais reprise. Retélécharge tout (environ 2,8 Go), régénère miniatures et versions web et purge le cache des images remplacées."
                    warning="Durée : 30 min à 1 h. Une mise à jour simple lancée entre-temps attendra la fin de celle-ci."
                    checked={forceMedia}
                    onChange={setForceMedia}
                />
                {!forceMedia && (
                    <RefreshIdsField value={refreshInput} onChange={setRefreshInput} invalid={hasInvalidIds} />
                )}
                <OptionCheckbox
                    flag="--astrobin-annotations"
                    label="Garder les annotations d’AstroBin"
                    help="Sans cette case, le job dessine les calques d’annotations (anneaux et étiquettes, style InstaSlice) à partir de la résolution astrométrique d’AstroBin. Cochée : il télécharge les SVG PixInsight d’AstroBin, comme avant. Avec « Tout recopier », toute la galerie passe dans le style choisi."
                    checked={astrobinAnnotations}
                    onChange={setAstrobinAnnotations}
                />
                {data.error && <p className="text-sm text-red-700 dark:text-red-400">{data.error}</p>}
                <div className="flex flex-wrap items-center gap-3">
                    <button
                        type="button"
                        onClick={() => void start()}
                        disabled={busy || hasActiveJob || Boolean(data.error) || (!forceMedia && hasInvalidIds)}
                        className={primaryButtonClass}
                    >
                        <RefreshCw className="h-4 w-4" aria-hidden="true" />
                        {forceMedia ? 'Tout recopier (30 min à 1 h)' : 'Mettre à jour les photos'}
                    </button>
                    <code className="font-mono text-xs text-mp-text-muted">
                        update-photos.mjs --ci{forceMedia ? ' --force-media' : ''}
                        {!forceMedia && refreshIds && refreshIds.length > 0
                            ? ` --refresh-ids=${refreshIds.join(',')}`
                            : ''}
                        {astrobinAnnotations ? ' --astrobin-annotations' : ''}
                    </code>
                    {hasActiveJob && <span className="text-sm text-mp-text-muted">Un import est déjà en cours.</span>}
                </div>
            </section>
            <section className="flex flex-col gap-4 rounded-xl border border-mp-glass-border p-5">
                <h2 className="font-serif text-xl font-light text-mp-text-heading">Redessiner les annotations</h2>
                <p className="text-sm text-mp-text-secondary">
                    Seulement les calques d’annotations, sans retélécharger les photos : utile après un import où
                    nova.astrometry.net a refusé des requêtes. Le résultat de chaque photo apparaît dans la colonne «
                    Annotation » de la{' '}
                    <a href="/admin/astrophotos?filtre=annotation-not-miroirs" className="text-mp-accent underline">
                        liste des astrophotos
                    </a>
                    .
                </p>
                <OptionCheckbox
                    flag="--all"
                    label="Tout redessiner"
                    help="Sans cette case, seuls les calques absents ou venant encore d’AstroBin sont refaits. Cochée : toutes les photos, même celles déjà dessinées par Miroirs Polaires."
                    checked={redrawAll}
                    onChange={setRedrawAll}
                />
                <div className="flex flex-wrap items-center gap-3">
                    <button
                        type="button"
                        onClick={() => void startAnnotations()}
                        disabled={busy || hasActiveJob || Boolean(data.error)}
                        className={primaryButtonClass}
                    >
                        <RefreshCw className="h-4 w-4" aria-hidden="true" />
                        {redrawAll ? 'Redessiner toutes les annotations' : 'Redessiner les annotations manquantes'}
                    </button>
                    <code className="font-mono text-xs text-mp-text-muted">
                        update-annotations.mjs{redrawAll ? ' --all' : ''}
                    </code>
                    {hasActiveJob && <span className="text-sm text-mp-text-muted">Un job est déjà en cours.</span>}
                </div>
            </section>
            <RemoteJobHistory
                title="Derniers imports"
                jobs={data.jobs}
                selectedJob={selectedJob}
                logs={logs}
                scriptLabel={scriptLabel}
                onSelect={selectJob}
                onCancel={(job) => void cancelJob(job)}
            />
        </>
    );
}

function NextSteps({ remote }: { remote: boolean }) {
    return (
        <section className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2 rounded-xl border border-mp-glass-border p-4">
                <h2 className="font-serif text-lg font-light text-mp-text-heading">Ensuite : compléter les textes</h2>
                <p className="text-sm text-mp-text-secondary">
                    Le bilan liste les photos incomplètes. Les descriptions SEO s’écrivent dans Claude Code
                    {remote ? ', sur la branche dev' : ''} :
                </p>
                <code className="self-start rounded bg-mp-ui-black/40 px-2 py-1 font-mono text-sm text-mp-text-primary">
                    /generate-seo astro
                </code>
            </div>
            <div className="flex flex-col gap-2 rounded-xl border border-mp-glass-border p-4">
                <h2 className="font-serif text-lg font-light text-mp-text-heading">Puis : mettre en production</h2>
                <p className="text-sm text-mp-text-secondary">
                    {remote
                        ? 'Le job a déjà committé sur dev : il ne reste qu’à publier.'
                        : 'Committer le CSV et les fichiers modifiés de src/data/, puis publier.'}
                </p>
                {remote && (
                    <a href="/admin/publication" className="text-sm text-mp-accent underline">
                        Mise en production
                    </a>
                )}
            </div>
        </section>
    );
}
