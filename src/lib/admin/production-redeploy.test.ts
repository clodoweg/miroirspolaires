// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isRedeployConfigured, RedeployNotConfiguredError, triggerProductionRedeploy } from './production-redeploy';

const HOOK = 'https://api.vercel.com/v1/integrations/deploy/prj_abc/secret';

afterEach(() => vi.unstubAllEnvs());

describe('triggerProductionRedeploy', () => {
    it('refuse sans hook ou avec une URL qui n’est pas un hook Vercel', async () => {
        vi.stubEnv('VERCEL_PRODUCTION_DEPLOY_HOOK', '');
        expect(isRedeployConfigured()).toBe(false);
        await expect(triggerProductionRedeploy(vi.fn())).rejects.toBeInstanceOf(RedeployNotConfiguredError);
        vi.stubEnv('VERCEL_PRODUCTION_DEPLOY_HOOK', 'https://exemple.test/hook');
        expect(isRedeployConfigured()).toBe(false);
    });

    it('appelle le hook en POST et renvoie l’identifiant du job', async () => {
        vi.stubEnv('VERCEL_PRODUCTION_DEPLOY_HOOK', HOOK);
        const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
            Response.json({ job: { id: 'job-1', state: 'PENDING' } }, { status: 201 }),
        );
        expect(await triggerProductionRedeploy(fetchImpl)).toEqual({ jobId: 'job-1' });
        expect(fetchImpl).toHaveBeenCalledWith(HOOK, expect.objectContaining({ method: 'POST' }));
    });

    it('signale un refus de Vercel sans exposer l’URL du hook', async () => {
        vi.stubEnv('VERCEL_PRODUCTION_DEPLOY_HOOK', HOOK);
        const error = await triggerProductionRedeploy(vi.fn(async () => new Response('', { status: 404 }))).catch(
            (e: Error) => e,
        );
        expect((error as Error).message).toBe('Vercel a refusé le redéploiement (HTTP 404).');
        expect((error as Error).message).not.toContain('secret');
    });
});
