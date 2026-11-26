// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
    class RedeployNotConfiguredError extends Error {}
    return {
        mode: vi.fn(() => 'remote'),
        trigger: vi.fn(async () => ({ jobId: 'job-1' })),
        configured: vi.fn(() => true),
        RedeployNotConfiguredError,
    };
});
vi.mock('@/lib/admin/auth/config', () => ({ getAdminAccessMode: mocks.mode }));
vi.mock('@/lib/admin/production-redeploy', () => ({
    triggerProductionRedeploy: mocks.trigger,
    isRedeployConfigured: mocks.configured,
    RedeployNotConfiguredError: mocks.RedeployNotConfiguredError,
}));
vi.mock('@/lib/admin/shared', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/admin/shared')>()),
    requireAdmin: () => null,
}));

import { GET, POST } from './redeploy';

const context = { locals: {} } as Parameters<typeof POST>[0];

afterEach(() => vi.clearAllMocks());

describe('/api/admin/release/redeploy', () => {
    it('dit si le redéploiement est configuré, et lance le build', async () => {
        expect(await (await GET(context)).json()).toEqual({ configured: true });
        expect(await (await POST(context)).json()).toEqual({ ok: true, jobId: 'job-1' });
    });

    it('répond 503 sans hook et 502 si Vercel refuse', async () => {
        mocks.trigger.mockRejectedValueOnce(new mocks.RedeployNotConfiguredError('non configuré'));
        expect((await POST(context)).status).toBe(503);
        mocks.trigger.mockRejectedValueOnce(new Error('HTTP 500'));
        expect((await POST(context)).status).toBe(502);
    });

    it('n’existe qu’à distance', async () => {
        mocks.mode.mockReturnValue('local');
        expect((await GET(context)).status).toBe(501);
        expect((await POST(context)).status).toBe(501);
        expect(mocks.trigger).not.toHaveBeenCalled();
    });
});
