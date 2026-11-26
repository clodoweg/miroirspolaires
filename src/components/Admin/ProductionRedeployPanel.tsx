/**
 * Bouton « Redéployer la production » (admin distant).
 *
 * Responsabilité : expliquer pourquoi un redéploiement est utile (pages générées au build à partir de Turso), le
 * lancer après confirmation par `POST /api/admin/release/redeploy`, et dire s'il n'est pas configuré.
 */
import { useEffect, useState } from 'react';
import AdminProviders from './AdminProviders';
import { useConfirm } from './ConfirmDialog';
import { useToast } from './Toast';

/**
 * Bouton de redéploiement, avec ses propres fournisseurs (îlot autonome).
 *
 * @param props.compact - Version courte, pour les pages de données.
 * @returns Le panneau.
 */
export default function ProductionRedeployPanel({ compact = false }: { compact?: boolean }) {
    return (
        <AdminProviders>
            <ProductionRedeployInner compact={compact} />
        </AdminProviders>
    );
}

function ProductionRedeployInner({ compact }: { compact: boolean }) {
    const toast = useToast();
    const confirm = useConfirm();
    const [configured, setConfigured] = useState<boolean | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        let cancelled = false;
        fetch('/api/admin/release/redeploy')
            .then((response) => (response.ok ? (response.json() as Promise<{ configured: boolean }>) : null))
            .then((body) => {
                if (!cancelled) setConfigured(body?.configured ?? false);
            })
            .catch(() => {
                if (!cancelled) setConfigured(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const redeploy = async () => {
        const accepted = await confirm({
            title: 'Redéployer la production ?',
            message:
                'Vercel reconstruit le site public à partir de la branche de production, sans changement de code. Les pages générées à partir de Turso (exoplanètes, comètes, astéroïdes) reprennent les données actuelles. Comptez quelques minutes.',
            tone: 'danger',
            confirmLabel: 'Redéployer',
        });
        if (!accepted) return;
        setBusy(true);
        try {
            const response = await fetch('/api/admin/release/redeploy', { method: 'POST' });
            const body = (await response.json().catch(() => ({}))) as { error?: string };
            if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
            toast.success('Le build de production démarre ; le site sera à jour dans quelques minutes.', {
                title: 'Redéploiement lancé',
            });
        } catch (error) {
            toast.error(String((error as Error).message ?? error), { title: 'Redéploiement impossible' });
        } finally {
            setBusy(false);
        }
    };

    return (
        <section className="flex flex-col gap-3 rounded-xl border border-mp-glass-border p-4">
            <h2 className="font-sans text-base font-semibold text-mp-text-heading">Redéployer la production</h2>
            <p className="text-sm text-mp-text-secondary">
                {compact
                    ? 'Ces pages du site sont générées au build : après une mise à jour de la base, redéploie la production pour qu’elles en tiennent compte.'
                    : 'Sans changement de code : utile après une mise à jour des données Turso, que les pages Exoplanètes, Comètes et Astéroïdes ne reprennent qu’au prochain build.'}
            </p>
            {configured === false ? (
                <p className="text-sm text-mp-text-muted">
                    Non configuré : ajouter un deploy hook Vercel de la branche de production dans la variable
                    VERCEL_PRODUCTION_DEPLOY_HOOK (environnement Preview).
                </p>
            ) : (
                <div>
                    <button
                        type="button"
                        onClick={() => void redeploy()}
                        disabled={busy || configured !== true}
                        className="min-h-touch rounded-md border border-mp-border-accent px-4 text-sm font-semibold text-mp-accent disabled:opacity-50"
                    >
                        {busy ? 'Lancement…' : 'Redéployer la production'}
                    </button>
                </div>
            )}
        </section>
    );
}
