// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { RemoteAdminConfig } from '../auth/config';
import { GitHubApiError, type GitHubAppClient } from './app-client';
import { diagnoseRemoteAccess } from './diagnostics';

const CONFIG = {
    contentBranch: 'dev',
    repository: { owner: 'clodoweg', name: 'miroirspolaires' },
} as RemoteAdminConfig;

function fakeClient(tokenError: Error | null, statuses: number[]) {
    const request = vi.fn(async () => new Response('{}', { status: statuses.shift() ?? 200 }));
    const client = {
        repoPath: '/repos/clodoweg/miroirspolaires',
        getInstallationToken: vi.fn(async () => {
            if (tokenError) throw tokenError;
            return 'token';
        }),
        request,
    } as unknown as GitHubAppClient;
    return { client, request };
}

describe('diagnoseRemoteAccess', () => {
    it('valide toutes les étapes', async () => {
        const { client, request } = fakeClient(null, [200, 200, 200]);
        const result = await diagnoseRemoteAccess(client, CONFIG);
        expect(result).toMatchObject({ repository: 'clodoweg/miroirspolaires', branch: 'dev', ok: true });
        expect(result.steps.map((step) => step.step)).toEqual([
            'installation-token',
            'repository',
            'branch',
            'content',
        ]);
        expect(request).toHaveBeenLastCalledWith('/repos/clodoweg/miroirspolaires/contents/src/content/blog?ref=dev');
    });

    it.each([
        [401, 'GITHUB_APP_ID'],
        [404, 'GITHUB_APP_INSTALLATION_ID'],
        [500, 'clé privée'],
    ])('explique un refus du jeton d’installation (%s)', async (status, expectedHint) => {
        const { client, request } = fakeClient(new GitHubApiError(status, 'refus'), []);
        const result = await diagnoseRemoteAccess(client, CONFIG);
        expect(result.ok).toBe(false);
        expect(result.steps).toEqual([expect.objectContaining({ step: 'installation-token', ok: false, status })]);
        expect(result.steps[0].hint).toContain(expectedHint);
        expect(request).not.toHaveBeenCalled();
    });

    it('signale une clé illisible (erreur hors API)', async () => {
        const { client } = fakeClient(new Error('PEM'), []);
        expect((await diagnoseRemoteAccess(client, CONFIG)).steps[0]).toMatchObject({ ok: false, status: 0 });
    });

    it('s’arrête au dépôt inaccessible', async () => {
        const { client, request } = fakeClient(null, [404]);
        const result = await diagnoseRemoteAccess(client, CONFIG);
        expect(result.steps.at(-1)).toMatchObject({ step: 'repository', ok: false, status: 404 });
        expect(result.steps.at(-1)?.hint).toContain('installer l’App');
        expect(request).toHaveBeenCalledTimes(1);
    });

    it('signale une lecture de contenu refusée', async () => {
        const { client } = fakeClient(null, [200, 200, 403]);
        const result = await diagnoseRemoteAccess(client, CONFIG);
        expect(result.steps.at(-1)).toMatchObject({ step: 'content', ok: false, status: 403 });
    });
});
