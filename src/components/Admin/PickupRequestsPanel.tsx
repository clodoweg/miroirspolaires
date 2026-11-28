/**
 * Tableau de bord des remises en main propre (`/admin/boutique`).
 *
 * Responsabilité : lister les demandes lues dans Turso (`GET /api/admin/shop/pickup-requests`), les filtrer par
 * statut, et les accepter (code tiré et envoyé à l'acheteur), refuser, révoquer ou renvoyer le code
 * (`POST /api/admin/shop/pickup-requests/:id`). Signale aussi la configuration e-mail manquante.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import AdminProviders from './AdminProviders';
import { useConfirm } from './ConfirmDialog';
import PageHeader from './PageHeader';
import SegmentedTabs from './SegmentedTabs';
import { useToast } from './Toast';
import type { PickupRequest, PickupRequestStatus } from '@/lib/shop/pickup-codes';

type Filter = 'pending' | 'approved' | 'closed' | 'all';
type Action = 'approve' | 'reject' | 'revoke' | 'resend';

interface EmailStatus {
    apiKey: boolean;
    notifyAddress: boolean;
    sender: boolean;
    webhook: boolean;
}

const STATUS_LABELS: Record<PickupRequestStatus, string> = {
    pending: 'En attente',
    approved: 'Code envoyé',
    used: 'Commandé',
    rejected: 'Refusée',
    revoked: 'Code révoqué',
};

const STATUS_CLASSES: Record<PickupRequestStatus, string> = {
    pending: 'border-mp-accent/40 bg-mp-accent/15 text-mp-accent',
    approved: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
    used: 'border-mp-glass-border bg-mp-glass-border/30 text-mp-text-body',
    rejected: 'border-mp-glass-border text-mp-text-muted',
    revoked: 'border-mp-glass-border text-mp-text-muted',
};

const FILTER_MATCHES: Record<Filter, (status: PickupRequestStatus) => boolean> = {
    pending: (status) => status === 'pending',
    approved: (status) => status === 'approved' || status === 'used',
    closed: (status) => status === 'rejected' || status === 'revoked',
    all: () => true,
};

const dateFormat = new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Europe/Paris',
});

type LoadResult = { requests: PickupRequest[]; email: EmailStatus | null } | { error: string };

async function fetchPickupRequests(): Promise<LoadResult> {
    try {
        const response = await fetch('/api/admin/shop/pickup-requests');
        const body = (await response.json()) as { requests?: PickupRequest[]; email?: EmailStatus; error?: string };
        if (!response.ok || !body.requests) return { error: body.error ?? `HTTP ${response.status}` };
        return { requests: body.requests, email: body.email ?? null };
    } catch (error) {
        return { error: String((error as Error).message ?? error) };
    }
}

/**
 * Panneau des demandes, avec ses propres fournisseurs (îlot autonome).
 *
 * @returns Le panneau.
 */
export default function PickupRequestsPanel() {
    return (
        <AdminProviders>
            <PickupRequestsInner />
        </AdminProviders>
    );
}

function PickupRequestsInner() {
    const toast = useToast();
    const confirm = useConfirm();
    const [requests, setRequests] = useState<PickupRequest[] | null>(null);
    const [emailStatus, setEmailStatus] = useState<EmailStatus | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [filter, setFilter] = useState<Filter>('pending');
    const [busyId, setBusyId] = useState<string | null>(null);

    const applyResult = useCallback((result: LoadResult) => {
        if ('error' in result) {
            setLoadError(result.error);
            return;
        }
        setRequests(result.requests);
        setEmailStatus(result.email);
        setLoadError(null);
    }, []);

    useEffect(() => {
        let cancelled = false;
        fetchPickupRequests().then((result) => {
            if (!cancelled) applyResult(result);
        });
        return () => {
            cancelled = true;
        };
    }, [applyResult]);

    const reload = () => {
        void fetchPickupRequests().then(applyResult);
    };

    const counts = useMemo(() => {
        const list = requests ?? [];
        return Object.fromEntries(
            (Object.keys(FILTER_MATCHES) as Filter[]).map((key) => [
                key,
                list.filter((request) => FILTER_MATCHES[key](request.status)).length,
            ]),
        ) as Record<Filter, number>;
    }, [requests]);

    const visible = (requests ?? []).filter((request) => FILTER_MATCHES[filter](request.status));

    const runAction = async (request: PickupRequest, action: Action) => {
        if (action !== 'resend') {
            const texts = {
                approve: {
                    title: `Accepter la demande de ${request.name} ?`,
                    message: `Un code à usage unique est envoyé à ${request.email}. Il ouvre la remise en main propre gratuite sur le site.`,
                    confirmLabel: 'Accepter et envoyer le code',
                    tone: 'default' as const,
                },
                reject: {
                    title: `Refuser la demande de ${request.name} ?`,
                    message: 'Aucun e-mail n’est envoyé : prévenez la personne vous-même si besoin.',
                    confirmLabel: 'Refuser',
                    tone: 'danger' as const,
                },
                revoke: {
                    title: `Révoquer le code ${request.code ?? ''} ?`,
                    message:
                        'Le code ne pourra plus servir à commander. Une session de paiement déjà ouverte reste payable.',
                    confirmLabel: 'Révoquer',
                    tone: 'danger' as const,
                },
            }[action];
            if (!(await confirm(texts))) return;
        }
        setBusyId(request.id);
        try {
            const response = await fetch(`/api/admin/shop/pickup-requests/${request.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action }),
            });
            const body = (await response.json().catch(() => ({}))) as {
                request?: PickupRequest;
                emailSent?: boolean;
                error?: string;
            };
            if (!response.ok || !body.request) throw new Error(body.error ?? `HTTP ${response.status}`);
            const updated = body.request;
            setRequests((list) => (list ?? []).map((item) => (item.id === updated.id ? updated : item)));
            if (updated.status === 'approved') {
                if (body.emailSent) toast.success(`Code ${updated.code} envoyé à ${updated.email}.`);
                else
                    toast.error(`E-mail non envoyé : transmettez le code ${updated.code} vous-même.`, {
                        title: 'Code créé',
                    });
            } else {
                toast.success(STATUS_LABELS[updated.status]);
            }
        } catch (error) {
            toast.error(String((error as Error).message ?? error), { title: 'Action impossible' });
        } finally {
            setBusyId(null);
        }
    };

    const missingConfig = emailStatus
        ? [
              !emailStatus.apiKey && 'RESEND_API_KEY (aucun e-mail ne part)',
              !emailStatus.notifyAddress && 'SHOP_NOTIFY_EMAIL (vous ne recevez pas les demandes)',
              !emailStatus.sender && 'SHOP_EMAIL_FROM (expéditeur de test Resend, qui n’écrit qu’à votre adresse)',
              !emailStatus.webhook && 'STRIPE_WEBHOOK_SECRET (les codes utilisés ne passent pas en « Commandé »)',
          ].filter((item): item is string => Boolean(item))
        : [];

    return (
        <div className="flex flex-col gap-6">
            <PageHeader
                title="Remises en main propre"
                actions={
                    <button
                        type="button"
                        onClick={reload}
                        className="min-h-touch rounded-md border border-mp-glass-border px-3 text-sm text-mp-text-secondary hover:text-mp-text-primary"
                    >
                        Actualiser
                    </button>
                }
            />

            {missingConfig.length > 0 && (
                <section className="rounded-xl border border-mp-accent/30 bg-mp-accent/5 p-4 text-sm text-mp-text-body">
                    <p className="font-semibold text-mp-text-heading">Configuration incomplète sur ce déploiement</p>
                    <ul className="mt-2 list-disc pl-5 text-mp-text-secondary">
                        {missingConfig.map((item) => (
                            <li key={item}>{item}</li>
                        ))}
                    </ul>
                    <p className="mt-2 text-xs text-mp-text-muted">
                        Les e-mails partent de l’environnement qui traite l’action : production pour les demandes, admin
                        pour les codes. Voir docs/conception-boutique.md.
                    </p>
                </section>
            )}

            <SegmentedTabs<Filter>
                value={filter}
                onChange={setFilter}
                options={[
                    { value: 'pending', label: 'En attente', count: counts.pending },
                    { value: 'approved', label: 'Acceptées', count: counts.approved },
                    { value: 'closed', label: 'Refusées / révoquées', count: counts.closed },
                    { value: 'all', label: 'Toutes', count: counts.all },
                ]}
            />

            {loadError ? (
                <p className="text-mp-astro-red">{loadError}</p>
            ) : requests === null ? (
                <p className="text-mp-text-muted">Chargement…</p>
            ) : visible.length === 0 ? (
                <p className="text-mp-text-muted">Aucune demande dans cette catégorie.</p>
            ) : (
                <ul className="flex flex-col gap-3">
                    {visible.map((request) => (
                        <li
                            key={request.id}
                            className="flex flex-col gap-3 rounded-xl border border-mp-glass-border p-4 sm:flex-row sm:items-start sm:justify-between"
                        >
                            <div className="space-y-1 min-w-0 flex-1 text-sm">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-semibold text-mp-text-heading">{request.name}</span>
                                    <span
                                        className={`rounded-full border px-2 py-0.5 text-[11px] ${STATUS_CLASSES[request.status]}`}
                                    >
                                        {STATUS_LABELS[request.status]}
                                    </span>
                                    <span className="text-xs text-mp-text-muted">
                                        {dateFormat.format(new Date(request.createdAt))}
                                    </span>
                                </div>
                                <p className="break-all text-mp-text-body">
                                    <a href={`mailto:${request.email}`} className="text-mp-accent hover:underline">
                                        {request.email}
                                    </a>
                                </p>
                                <p className="text-mp-text-body">Lieu : {request.place}</p>
                                {request.message && (
                                    <p className="whitespace-pre-line text-mp-text-secondary">{request.message}</p>
                                )}
                                {request.code && (
                                    <p className="text-xs text-mp-text-muted">
                                        Code <span className="font-mono text-mp-text-body">{request.code}</span>
                                        {request.expiresAt &&
                                            request.status === 'approved' &&
                                            `, valable jusqu’au ${dateFormat.format(new Date(request.expiresAt))}`}
                                        {request.usedAt &&
                                            `, utilisé le ${dateFormat.format(new Date(request.usedAt))}`}
                                    </p>
                                )}
                            </div>
                            <div className="flex shrink-0 flex-wrap gap-2">
                                {request.status === 'pending' && (
                                    <>
                                        <ActionButton
                                            label="Accepter"
                                            primary
                                            disabled={busyId !== null}
                                            onClick={() => void runAction(request, 'approve')}
                                        />
                                        <ActionButton
                                            label="Refuser"
                                            disabled={busyId !== null}
                                            onClick={() => void runAction(request, 'reject')}
                                        />
                                    </>
                                )}
                                {request.status === 'approved' && (
                                    <>
                                        <ActionButton
                                            label="Renvoyer le code"
                                            disabled={busyId !== null}
                                            onClick={() => void runAction(request, 'resend')}
                                        />
                                        <ActionButton
                                            label="Révoquer"
                                            disabled={busyId !== null}
                                            onClick={() => void runAction(request, 'revoke')}
                                        />
                                    </>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function ActionButton({
    label,
    onClick,
    disabled,
    primary = false,
}: {
    label: string;
    onClick: () => void;
    disabled: boolean;
    primary?: boolean;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={`min-h-touch rounded-md border px-4 text-sm font-semibold disabled:opacity-50 ${
                primary
                    ? 'border-mp-border-accent bg-mp-accent/15 text-mp-accent'
                    : 'border-mp-glass-border text-mp-text-secondary hover:text-mp-text-primary'
            }`}
        >
            {label}
        </button>
    );
}
