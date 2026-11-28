/**
 * Bouton « Reprendre la photo » d'une ligne de la liste des astrophotos (`AstroPhotosPanel.tsx`).
 *
 * Responsabilité : à distance, lancer directement le job GitHub Actions `update-photos-ci` avec
 * `--refresh-ids=<id>` (scrape de ses médias depuis la révision finale d'AstroBin, calque d'annotations,
 * miniature, versions web, dimensions, envoi sur R2), après confirmation. En local, le scrape se lance à la
 * main dans le dépôt astrobin : le bouton reste un lien vers la page Importer, pré-remplie avec l'ID.
 */
import { useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { useConfirm } from './ConfirmDialog';
import { useToast } from './Toast';

interface Props {
    photoId: string;
    title: string;
    remote: boolean;
}

const linkClass = 'inline-flex items-center gap-1 text-mp-text-muted transition-colors hover:text-mp-accent';

export default function AstroRefreshButton({ photoId, title, remote }: Props) {
    const confirm = useConfirm();
    const toast = useToast();
    const [launching, setLaunching] = useState(false);
    const importerHref = `/admin/astrophotos/importer?refresh=${encodeURIComponent(photoId)}`;

    if (!remote) {
        return (
            <a
                href={importerHref}
                className={linkClass}
                title="Photo retraitée sur AstroBin : la reprendre"
                aria-label={`Reprendre la photo ${photoId} depuis AstroBin`}
            >
                <RefreshCw className="h-3 w-3 shrink-0" aria-hidden="true" />
            </a>
        );
    }

    const launch = async () => {
        const accepted = await confirm({
            title: `Reprendre « ${title} » ?`,
            message:
                'Le job retélécharge les médias de cette photo depuis AstroBin (révision finale), redessine son calque d’annotations, régénère sa miniature, ses versions web et ses dimensions, envoie ce qui a changé sur R2 puis committe sur dev. Quelques minutes.',
            tone: 'danger',
            confirmLabel: 'Lancer',
        });
        if (!accepted) return;
        setLaunching(true);
        try {
            const response = await fetch('/api/admin/jobs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ scriptId: 'update-photos-ci', options: { refreshIds: [photoId] } }),
            });
            const payload = (await response.json().catch(() => ({}))) as { error?: string };
            if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
            toast.success(`Job lancé pour ${photoId} : son suivi est sur la page Importer.`);
        } catch (error) {
            toast.error(String((error as Error).message ?? error), { title: 'Lancement impossible' });
        } finally {
            setLaunching(false);
        }
    };

    return (
        <button
            type="button"
            onClick={() => void launch()}
            disabled={launching}
            className={`${linkClass} disabled:opacity-50`}
            title="Reprendre la photo : médias, annotation, miniature, versions web"
            aria-label={`Reprendre la photo ${photoId} depuis AstroBin`}
        >
            {launching ? (
                <Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-hidden="true" />
            ) : (
                <RefreshCw className="h-3 w-3 shrink-0" aria-hidden="true" />
            )}
        </button>
    );
}
