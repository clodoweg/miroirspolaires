// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    collectAdminTodos: vi.fn(async (_reader: unknown, _options?: unknown) => ({ todos: [], errors: [] })),
    getAdminAccessMode: vi.fn(() => 'local'),
    getReleaseStatus: vi.fn(async () => ({ ahead: 0 })),
}));
vi.mock('@/lib/admin/admin-todo', () => ({ collectAdminTodos: mocks.collectAdminTodos }));
vi.mock('@/lib/admin/auth/config', () => ({
    getAdminAccessMode: mocks.getAdminAccessMode,
    getRemoteAdminConfig: () => ({ contentBranch: 'dev', productionBranch: 'main' }),
}));
vi.mock('@/lib/admin/github/release', () => ({ getReleaseStatus: mocks.getReleaseStatus }));
vi.mock('@/lib/admin/stores/content-reader', () => ({
    getContentReader: () => 'lecteur',
    getRemoteGitHubClient: () => 'client',
}));
vi.mock('@/lib/admin/shared', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/admin/shared')>()),
    requireAdmin: () => null,
}));

import { GET } from './todo';

afterEach(() => vi.clearAllMocks());

describe('GET /api/admin/todo', () => {
    it('ne lit la mise en production qu’à distance', async () => {
        const local = await GET({ locals: {} } as Parameters<typeof GET>[0]);
        expect(await local.json()).toEqual({ todos: [], errors: [] });
        expect(mocks.collectAdminTodos).toHaveBeenLastCalledWith('lecteur', { release: undefined });

        mocks.getAdminAccessMode.mockReturnValue('remote');
        await GET({ locals: {} } as Parameters<typeof GET>[0]);
        const options = mocks.collectAdminTodos.mock.calls.at(-1)?.[1] as unknown as {
            release: () => Promise<unknown>;
        };
        await options.release();
        expect(mocks.getReleaseStatus).toHaveBeenCalledWith('client', {
            contentBranch: 'dev',
            productionBranch: 'main',
        });
    });
});
