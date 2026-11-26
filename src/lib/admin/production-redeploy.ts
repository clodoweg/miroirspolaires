/**
 * Redéploiement de la production sans changement de code.
 *
 * Responsabilité : appeler le *deploy hook* Vercel de la branche de production. Les pages Exoplanètes, Comètes et
 * Astéroïdes (et leurs JSON d'API) sont générées au build à partir de Turso : une mise à jour des données n'apparaît
 * sur le site qu'après un nouveau build.
 *
 * WARNING: sécurité. L'URL du hook est un secret (quiconque la connaît déclenche un déploiement) : elle ne sort
 * jamais de ce module, ni dans une réponse ni dans un journal. Variable : VERCEL_PRODUCTION_DEPLOY_HOOK.
 */

/** Préfixe des deploy hooks Vercel ; toute autre URL est refusée. */
const VERCEL_HOOK_PREFIX = 'https://api.vercel.com/v1/integrations/deploy/';

/** Hook absent ou invalide : le redéploiement n'est pas configuré sur ce déploiement. */
export class RedeployNotConfiguredError extends Error {
    constructor() {
        super('Redéploiement non configuré : VERCEL_PRODUCTION_DEPLOY_HOOK absent ou invalide.');
        this.name = 'RedeployNotConfiguredError';
    }
}

/**
 * Indique si le redéploiement est configuré.
 *
 * @returns `true` si la variable contient une URL de deploy hook Vercel.
 */
export function isRedeployConfigured(): boolean {
    const hook = process.env.VERCEL_PRODUCTION_DEPLOY_HOOK ?? '';
    return hook.startsWith(VERCEL_HOOK_PREFIX);
}

/**
 * Déclenche un build de production.
 *
 * @param fetchImpl - `fetch` injectable (tests).
 * @returns L'identifiant du job Vercel, s'il est renvoyé.
 * @throws RedeployNotConfiguredError si le hook manque ; Error si Vercel refuse (message sans l'URL).
 */
export async function triggerProductionRedeploy(fetchImpl: typeof fetch = fetch): Promise<{ jobId: string | null }> {
    if (!isRedeployConfigured()) throw new RedeployNotConfiguredError();
    const response = await fetchImpl(process.env.VERCEL_PRODUCTION_DEPLOY_HOOK as string, {
        method: 'POST',
        signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Vercel a refusé le redéploiement (HTTP ${response.status}).`);
    const body = (await response.json().catch(() => ({}))) as { job?: { id?: unknown } };
    return { jobId: typeof body.job?.id === 'string' ? body.job.id : null };
}
