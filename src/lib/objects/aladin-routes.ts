/**
 * Choix des routes du visualiseur Aladin Lite côté navigateur.
 *
 * Responsabilité : charger le script depuis la première route qui répond, et choisir le fond de ciel HiPS
 * joignable, dans l'ordre de `src/config/upstream-routes.ts`.
 *
 * POURQUOI côté navigateur : le serveur ne voit pas ce que le navigateur peut joindre, et un script qui ne
 * répond pas bloque sans erreur. Chaque route a donc un délai, sauf la dernière, qui n'a plus de relais.
 */

import type { UpstreamRoute } from '@/config/upstream-routes';

/** Délai d'une route de script suivie d'un relais. */
export const SCRIPT_FAILOVER_TIMEOUT_MS = 6_000;
/** Délai de la dernière route de script : le fichier auto-hébergé pèse 2,4 Mo. */
export const SCRIPT_FINAL_TIMEOUT_MS = 45_000;
/** Délai de la sonde d'un fond de ciel (`properties`, quelques Ko). */
export const SKY_PROBE_TIMEOUT_MS = 4_000;

/** Aucune route n'a répondu. Le message s'affiche tel quel dans le visualiseur. */
export class AladinUnavailableError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AladinUnavailableError';
    }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`délai de ${timeoutMs} ms dépassé`)), timeoutMs);
        promise.then(
            (value) => {
                clearTimeout(timer);
                resolve(value);
            },
            (error) => {
                clearTimeout(timer);
                reject(error);
            },
        );
    });
}

/**
 * Charge le script Aladin depuis la première route qui répond.
 *
 * @param routes - Routes actives du service `aladinScript`, dans l'ordre.
 * @param loadRoute - Charge le script d'une route et renvoie l'objet `A`.
 * @returns La route retenue et l'objet `A`.
 * @throws {AladinUnavailableError} Si aucune route ne répond.
 */
export async function loadFirstAladinRoute<T>(
    routes: UpstreamRoute[],
    loadRoute: (route: UpstreamRoute) => Promise<T>,
): Promise<{ route: UpstreamRoute; aladin: T }> {
    for (const [index, route] of routes.entries()) {
        const timeoutMs = index === routes.length - 1 ? SCRIPT_FINAL_TIMEOUT_MS : SCRIPT_FAILOVER_TIMEOUT_MS;
        try {
            return { route, aladin: await withTimeout(loadRoute(route), timeoutMs) };
        } catch {
            // POURQUOI : l'échec d'une route n'est pas une erreur tant qu'une autre peut prendre le relais.
        }
    }
    throw new AladinUnavailableError('le moteur Aladin Lite ne répond ni depuis Strasbourg ni depuis sa copie locale.');
}

/**
 * Choisit le premier fond de ciel joignable en lisant son fichier `properties`.
 *
 * @param routes - Routes actives du service `hipsSky`, dans l'ordre.
 * @param fetchFn - Implémentation de fetch, injectée pour les tests.
 * @returns La route retenue.
 * @throws {AladinUnavailableError} Si aucun fond de ciel ne répond.
 */
export async function pickReachableSkyRoute(
    routes: UpstreamRoute[],
    fetchFn: typeof fetch = fetch,
): Promise<UpstreamRoute> {
    for (const route of routes) {
        try {
            const response = await fetchFn(`${route.baseUrl}/properties`, {
                signal: AbortSignal.timeout(SKY_PROBE_TIMEOUT_MS),
            });
            if (response.ok) return route;
        } catch {
            // POURQUOI : une route muette ou refusée par CORS laisse simplement sa place à la suivante.
        }
    }
    throw new AladinUnavailableError('aucun fond de ciel ne répond (Strasbourg, ESA, China-VO).');
}
