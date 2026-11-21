/**
 * Bascule entre les routes amont, avec coupe-circuit en mémoire.
 *
 * Responsabilité : essayer les routes actives d'un service dans l'ordre du registre, et sauter un moment
 * celles qui viennent de tomber, pour ne pas perdre plusieurs secondes à chaque requête pendant une panne.
 *
 * POURQUOI en mémoire : chaque instance Vercel réapprend seule l'état des routes. Le pire cas est un délai
 * d'attente de plus au démarrage d'une instance, ce qui ne justifie pas un stockage partagé.
 */

import {
    getActiveRoutes,
    UPSTREAM_SERVICES,
    type UpstreamRoute,
    type UpstreamServiceId,
} from '@/config/upstream-routes';

/** Durée pendant laquelle une route en panne est sautée. */
export const CIRCUIT_OPEN_MS = 60_000;

/** Délai par défaut d'une route quand une autre peut encore prendre le relais. */
export const FAILOVER_TIMEOUT_MS = 6_000;

const circuitOpenedAt = new Map<string, number>();
const lastUsedRouteIds = new Map<UpstreamServiceId, string>();

/** Réponse HTTP en erreur d'une route. */
export class UpstreamHttpError extends Error {
    readonly status: number;

    constructor(label: string, status: number) {
        super(`${label} ${status}`);
        this.name = 'UpstreamHttpError';
        this.status = status;
    }
}

/** Réponse reçue mais inexploitable : colonne absente, coordonnée illisible, liste vide inattendue. */
export class UpstreamResponseError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'UpstreamResponseError';
    }
}

/** Toutes les routes d'un service ont échoué, ou aucune n'est active. */
export class UpstreamUnavailableError extends Error {
    readonly serviceId: UpstreamServiceId;

    constructor(serviceId: UpstreamServiceId, detail: string) {
        super(`${UPSTREAM_SERVICES[serviceId].label} indisponible : ${detail}`);
        this.name = 'UpstreamUnavailableError';
        this.serviceId = serviceId;
    }
}

function circuitKey(serviceId: UpstreamServiceId, routeId: string): string {
    return `${serviceId}:${routeId}`;
}

function isTimeoutError(error: unknown): boolean {
    return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
}

/**
 * Indique si un échec prouve une panne de la route.
 *
 * POURQUOI : une erreur 4xx vise la requête et non la route, et une expiration ambiguë peut venir d'un nom
 * inconnu (Sesame Harvard). Dans ces cas, ouvrir le circuit couperait la route pour tous les autres objets.
 */
function tripsCircuit(route: UpstreamRoute, error: unknown): boolean {
    if (error instanceof UpstreamHttpError && error.status >= 400 && error.status < 500 && error.status !== 429) {
        return false;
    }
    return !(route.hasAmbiguousTimeout && isTimeoutError(error));
}

function isCircuitOpen(serviceId: UpstreamServiceId, routeId: string, now: number): boolean {
    const openedAt = circuitOpenedAt.get(circuitKey(serviceId, routeId));
    return openedAt !== undefined && now - openedAt < CIRCUIT_OPEN_MS;
}

/**
 * Retient les routes à essayer.
 *
 * POURQUOI : si tous les circuits sont ouverts, on tente quand même la route tombée le plus tôt. Sans cela,
 * le service resterait coupé par sa propre mémoire au lieu de détecter le retour d'une route.
 */
function selectCandidateRoutes(serviceId: UpstreamServiceId, routes: UpstreamRoute[], now: number): UpstreamRoute[] {
    const closedRoutes = routes.filter((route) => !isCircuitOpen(serviceId, route.id, now));
    if (closedRoutes.length > 0 || routes.length === 0) return closedRoutes;

    const openedAt = (route: UpstreamRoute) => circuitOpenedAt.get(circuitKey(serviceId, route.id)) ?? 0;
    return [routes.reduce((oldest, route) => (openedAt(route) < openedAt(oldest) ? route : oldest))];
}

export interface FailoverOptions {
    /** Délai de la dernière route candidate, qui n'a plus de relais. */
    finalTimeoutMs: number;
    /** Délai des routes suivies d'un relais. */
    failoverTimeoutMs?: number;
}

/**
 * Exécute un appel en suivant l'ordre des routes actives d'un service.
 *
 * @param serviceId - Service interrogé.
 * @param attempt - Appel à tenter sur une route, avec le délai à respecter.
 * @param options - Délais de l'appelant.
 * @returns Le résultat de la première route qui réussit.
 * @throws {UpstreamUnavailableError} Si aucune route n'est active ou si toutes échouent.
 */
export async function withUpstreamFailover<T>(
    serviceId: UpstreamServiceId,
    attempt: (route: UpstreamRoute, timeoutMs: number) => Promise<T>,
    { finalTimeoutMs, failoverTimeoutMs = FAILOVER_TIMEOUT_MS }: FailoverOptions,
): Promise<T> {
    const routes = selectCandidateRoutes(serviceId, getActiveRoutes(serviceId), Date.now());
    if (routes.length === 0) throw new UpstreamUnavailableError(serviceId, 'aucune route active');

    const failures: string[] = [];
    for (const [index, route] of routes.entries()) {
        const isLastRoute = index === routes.length - 1;
        const timeoutMs = route.timeoutMs ?? (isLastRoute ? finalTimeoutMs : failoverTimeoutMs);
        try {
            const result = await attempt(route, timeoutMs);
            circuitOpenedAt.delete(circuitKey(serviceId, route.id));
            lastUsedRouteIds.set(serviceId, route.id);
            return result;
        } catch (error) {
            if (tripsCircuit(route, error)) circuitOpenedAt.set(circuitKey(serviceId, route.id), Date.now());
            failures.push(`${route.label} : ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    throw new UpstreamUnavailableError(serviceId, failures.join(' ; '));
}

/**
 * Donne la dernière route qui a répondu, pour indiquer la provenance d'un instantané.
 *
 * @param serviceId - Service concerné.
 * @returns L'id de la route, undefined si aucun appel n'a encore réussi.
 */
export function getLastUsedRouteId(serviceId: UpstreamServiceId): string | undefined {
    return lastUsedRouteIds.get(serviceId);
}

/** Remet à zéro le coupe-circuit, pour isoler les tests. */
export function resetUpstreamCircuits(): void {
    circuitOpenedAt.clear();
    lastUsedRouteIds.clear();
}
