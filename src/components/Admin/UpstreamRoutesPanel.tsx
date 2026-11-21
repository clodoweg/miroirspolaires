/**
 * Panneau « Routes amont » de `/admin/upstream`.
 *
 * Responsabilité : tester les routes vers le CDS et ses miroirs, les réordonner, les activer ou les couper,
 * et appliquer le préréglage de panne. Chaque action écrit `src/data/upstream-priority.json`.
 *
 * WARNING: ce fichier n'atteint la production qu'une fois committé et déployé. Le panneau doit le rappeler
 * en permanence, car rien d'autre ne signale qu'un choix fait ici reste sans effet sur le site public.
 */

import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import AdminProviders from './AdminProviders';
import PageHeader from './PageHeader';
import { useToast } from './Toast';
import { CDS_DOWN_PRESET, type UpstreamPriorityFile, type UpstreamServiceId } from '@/config/upstream-routes';
import type { ProbeResult, UpstreamServiceState } from '@/lib/admin/upstream-routes';

const PRIORITY_FILE = 'src/data/upstream-priority.json';

type RouteTestState = ProbeResult | 'pending';

interface UpstreamState {
    updatedAt: string | null;
    services: UpstreamServiceState[];
}

const routeKey = (serviceId: string, routeId: string) => `${serviceId}:${routeId}`;

/** Décrit un résultat de test, avec sa couleur d'état. */
function describeTestState(state: RouteTestState | undefined): { label: string; className: string } {
    if (!state) return { label: 'Non testée', className: 'text-mp-text-muted' };
    if (state === 'pending') return { label: 'Test en cours…', className: 'text-mp-text-muted' };

    const latency = `${state.latencyMs} ms`;
    switch (state.status) {
        case 'ok':
            return { label: `OK, ${latency}`, className: 'text-emerald-700 dark:text-emerald-400' };
        case 'timeout':
            return { label: `Expirée après ${latency}`, className: 'text-amber-700 dark:text-amber-400' };
        case 'http-error':
            return {
                label: `Erreur HTTP ${state.httpStatus}, ${latency}`,
                className: 'text-red-700 dark:text-red-400',
            };
        case 'invalid-response':
            return { label: state.detail ?? 'Réponse invalide', className: 'text-red-700 dark:text-red-400' };
        case 'network-error':
            return { label: 'Injoignable', className: 'text-red-700 dark:text-red-400' };
    }
}

/** Traduit l'état affiché en fichier de priorité, pour que le préréglage et les routes modifiées soient conservés. */
function toPriorityServices(services: UpstreamServiceState[]): UpstreamPriorityFile['services'] {
    return Object.fromEntries(
        services.map(({ id, routes }) => [
            id,
            {
                order: routes.map((route) => route.id),
                disabled: routes.filter((route) => !route.enabled).map((route) => route.id),
            },
        ]),
    );
}

/**
 * Panneau enveloppé dans les fournisseurs de l'admin.
 *
 * @returns Le panneau des routes amont.
 */
export default function UpstreamRoutesPanel() {
    return (
        <AdminProviders>
            <UpstreamRoutesPanelInner />
        </AdminProviders>
    );
}

function UpstreamRoutesPanelInner() {
    const toast = useToast();
    const [state, setState] = useState<UpstreamState | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [hasUncommittedChoice, setHasUncommittedChoice] = useState(false);
    const [testStates, setTestStates] = useState<Record<string, RouteTestState>>({});

    useEffect(() => {
        let isCancelled = false;
        fetch('/api/admin/upstream')
            .then(async (response) => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return (await response.json()) as UpstreamState;
            })
            .then((loaded) => {
                if (!isCancelled) setState(loaded);
            })
            .catch((error: Error) => {
                if (!isCancelled) setLoadError(error.message);
            });
        return () => {
            isCancelled = true;
        };
    }, []);

    const savePriority = useCallback(
        async (services: UpstreamPriorityFile['services'], successMessage: string) => {
            setIsSaving(true);
            try {
                const response = await fetch('/api/admin/upstream', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ services }),
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                setState((await response.json()) as UpstreamState);
                setHasUncommittedChoice(true);
                toast.success(successMessage);
            } catch (error) {
                toast.error(`Enregistrement impossible : ${(error as Error).message}`);
            } finally {
                setIsSaving(false);
            }
        },
        [toast],
    );

    const testRoute = useCallback(async (serviceId: string, routeId: string) => {
        const key = routeKey(serviceId, routeId);
        setTestStates((current) => ({ ...current, [key]: 'pending' }));
        try {
            const response = await fetch('/api/admin/upstream/probe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ serviceId, routeId }),
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const result = (await response.json()) as ProbeResult;
            setTestStates((current) => ({ ...current, [key]: result }));
        } catch {
            setTestStates((current) => ({ ...current, [key]: { status: 'network-error', latencyMs: 0 } }));
        }
    }, []);

    if (loadError) return <p className="text-sm text-red-700 dark:text-red-400">Chargement impossible : {loadError}</p>;
    if (!state) {
        return (
            <p className="flex items-center gap-2 text-sm text-mp-text-muted">
                <Loader2 className="h-4 w-4 animate-spin" /> Chargement des routes…
            </p>
        );
    }

    const { services } = state;

    const updateService = (serviceId: UpstreamServiceId, routes: UpstreamServiceState['routes'], message: string) => {
        const nextServices = services.map((service) => (service.id === serviceId ? { ...service, routes } : service));
        void savePriority(toPriorityServices(nextServices), message);
    };

    const moveRoute = (service: UpstreamServiceState, index: number, offset: -1 | 1) => {
        const routes = [...service.routes];
        [routes[index], routes[index + offset]] = [routes[index + offset], routes[index]];
        updateService(service.id, routes, `${service.label} : ordre enregistré.`);
    };

    const toggleRoute = (service: UpstreamServiceState, routeId: string) => {
        const routes = service.routes.map((route) =>
            route.id === routeId ? { ...route, enabled: !route.enabled } : route,
        );
        updateService(service.id, routes, `${service.label} : état enregistré.`);
    };

    const testAllRoutes = () => {
        for (const service of services) {
            for (const route of service.routes) void testRoute(service.id, route.id);
        }
    };

    const isAnyTestPending = Object.values(testStates).includes('pending');

    return (
        <div className="flex flex-col gap-6">
            <PageHeader
                title="Routes amont"
                actions={
                    <>
                        <button
                            type="button"
                            disabled={isAnyTestPending}
                            onClick={testAllRoutes}
                            className="rounded-md border border-mp-glass-border px-4 py-2 text-xs font-semibold text-mp-text-primary hover:bg-mp-ui-black/20 disabled:opacity-50"
                        >
                            Tester toutes les routes
                        </button>
                        <button
                            type="button"
                            disabled={isSaving}
                            onClick={() => savePriority({}, 'Ordre par défaut rétabli : CDS en premier.')}
                            className="rounded-md border border-mp-glass-border px-4 py-2 text-xs font-semibold text-mp-text-primary hover:bg-mp-ui-black/20 disabled:opacity-50"
                        >
                            Ordre par défaut
                        </button>
                        <button
                            type="button"
                            disabled={isSaving}
                            onClick={() => savePriority(CDS_DOWN_PRESET, 'Préréglage appliqué : miroirs en premier.')}
                            className="rounded-md border border-mp-accent bg-mp-accent px-4 py-2 text-xs font-semibold text-mp-ui-black hover:opacity-90 disabled:opacity-50"
                        >
                            CDS indisponible : Harvard en premier
                        </button>
                    </>
                }
            />

            <div
                role="status"
                className={`rounded-xl border p-4 text-xs leading-relaxed ${
                    hasUncommittedChoice
                        ? 'border-amber-500/60 bg-amber-500/10 text-mp-text-primary'
                        : 'border-mp-glass-border bg-mp-glass-solid text-mp-text-secondary'
                }`}
            >
                <p className="font-semibold">
                    {hasUncommittedChoice
                        ? 'Choix enregistré, pas encore en production.'
                        : 'La production lit la version déployée.'}
                </p>
                <p className="mt-1">
                    Committez et déployez <code className="font-mono text-mp-accent">{PRIORITY_FILE}</code> pour
                    appliquer un choix au site public. Ici, il ne s'applique qu'au serveur de dev et à{' '}
                    <code className="font-mono text-mp-accent">npm run update-catalogues</code>.
                </p>
                <p className="mt-1 text-mp-text-muted">
                    Dernière écriture : {state.updatedAt ? new Date(state.updatedAt).toLocaleString('fr-FR') : 'jamais'}
                    .
                </p>
            </div>

            {services.map((service) => {
                const hasActiveRoute = service.routes.some((route) => route.enabled);
                return (
                    <section
                        key={service.id}
                        aria-label={service.label}
                        className="flex flex-col gap-3 rounded-xl border border-mp-glass-border bg-mp-glass-solid p-5"
                    >
                        <div>
                            <h2 className="font-serif text-lg font-light text-mp-text-primary">{service.label}</h2>
                            <p className="text-xs text-mp-text-secondary">{service.description}</p>
                            {!hasActiveRoute && (
                                <p className="mt-1 text-xs text-red-700 dark:text-red-400">
                                    Aucune route active : ce service échouera immédiatement.
                                </p>
                            )}
                        </div>
                        <ol className="flex flex-col divide-y divide-mp-glass-border/40">
                            {service.routes.map((route, index) => {
                                const testState = describeTestState(testStates[routeKey(service.id, route.id)]);
                                return (
                                    <li
                                        key={route.id}
                                        className={`flex flex-col gap-2 py-3 md:flex-row md:items-center md:justify-between ${
                                            route.enabled ? '' : 'opacity-60'
                                        }`}
                                    >
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm text-mp-text-primary">
                                                <span className="mr-2 font-mono text-xs text-mp-text-muted">
                                                    {index + 1}.
                                                </span>
                                                {route.label}
                                                {route.isInsecure && (
                                                    <span className="ml-2 rounded-sm border border-amber-500/60 px-1.5 py-0.5 font-mono text-[10px] text-amber-700 dark:text-amber-400">
                                                        HTTP sans TLS
                                                    </span>
                                                )}
                                            </p>
                                            <p className="truncate font-mono text-[10px] text-mp-text-muted">
                                                {route.baseUrl}
                                            </p>
                                            {route.note && (
                                                <p className="text-xs text-mp-text-secondary">{route.note}</p>
                                            )}
                                        </div>
                                        <div className="flex shrink-0 flex-wrap items-center gap-3">
                                            <span className={`text-xs ${testState.className}`}>{testState.label}</span>
                                            <button
                                                type="button"
                                                disabled={testStates[routeKey(service.id, route.id)] === 'pending'}
                                                onClick={() => testRoute(service.id, route.id)}
                                                aria-label={`Tester ${route.label}`}
                                                className="rounded-md border border-mp-glass-border px-3 py-1.5 text-xs text-mp-text-primary hover:bg-mp-ui-black/20 disabled:opacity-50"
                                            >
                                                Tester
                                            </button>
                                            <button
                                                type="button"
                                                role="switch"
                                                aria-checked={route.enabled}
                                                aria-label={`Activer ${route.label}`}
                                                disabled={isSaving}
                                                onClick={() => toggleRoute(service, route.id)}
                                                className={`rounded-md border px-3 py-1.5 text-xs disabled:opacity-50 ${
                                                    route.enabled
                                                        ? 'border-emerald-500/60 text-emerald-700 dark:text-emerald-400'
                                                        : 'border-mp-glass-border text-mp-text-muted'
                                                }`}
                                            >
                                                {route.enabled ? 'Active' : 'Inactive'}
                                            </button>
                                            <div className="flex gap-1">
                                                <button
                                                    type="button"
                                                    disabled={isSaving || index === 0}
                                                    onClick={() => moveRoute(service, index, -1)}
                                                    aria-label={`Monter ${route.label}`}
                                                    className="rounded-md border border-mp-glass-border p-1.5 text-mp-text-primary hover:bg-mp-ui-black/20 disabled:opacity-30"
                                                >
                                                    <ChevronUp className="h-3.5 w-3.5" />
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={isSaving || index === service.routes.length - 1}
                                                    onClick={() => moveRoute(service, index, 1)}
                                                    aria-label={`Descendre ${route.label}`}
                                                    className="rounded-md border border-mp-glass-border p-1.5 text-mp-text-primary hover:bg-mp-ui-black/20 disabled:opacity-30"
                                                >
                                                    <ChevronDown className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    </li>
                                );
                            })}
                        </ol>
                    </section>
                );
            })}
        </div>
    );
}
