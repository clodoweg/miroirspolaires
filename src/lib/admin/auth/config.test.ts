// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    getAdminAccessMode,
    getRemoteAdminConfig,
    normalizePrivateKey,
    readRemoteAdminConfig,
    resolveAdminAccessMode,
    type EnvSource,
} from './config';

const REMOTE_ENV: EnvSource = {
    VERCEL_ENV: 'preview',
    VERCEL_GIT_COMMIT_REF: 'dev',
    VERCEL_GIT_REPO_OWNER: 'clodoweg',
    VERCEL_GIT_REPO_SLUG: 'miroirspolaires',
    GITHUB_APP_ID: '123',
    GITHUB_APP_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----',
    GITHUB_APP_INSTALLATION_ID: '456',
    GITHUB_APP_CLIENT_ID: 'Iv1.client',
    GITHUB_APP_CLIENT_SECRET: 'secret',
    ADMIN_GITHUB_USER_ID: '42',
    ADMIN_SESSION_SECRET: 'x'.repeat(32),
};

describe('readRemoteAdminConfig', () => {
    it('lit la configuration complète, branche dev par défaut', () => {
        const config = readRemoteAdminConfig(REMOTE_ENV);
        expect(config).toMatchObject({
            contentBranch: 'dev',
            productionBranch: 'main',
            repository: { owner: 'clodoweg', name: 'miroirspolaires' },
            adminUserId: 42,
            appId: '123',
        });
        expect(config?.privateKey).toBe('-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----');
    });

    it('accepte une branche et un dépôt explicites', () => {
        const config = readRemoteAdminConfig({
            ...REMOTE_ENV,
            ADMIN_CONTENT_BRANCH: 'contenu',
            ADMIN_GITHUB_REPOSITORY: 'autre/depot',
        });
        expect(config?.contentBranch).toBe('contenu');
        expect(config?.repository).toEqual({ owner: 'autre', name: 'depot' });
    });

    it.each([
        ['GITHUB_APP_ID', ''],
        ['GITHUB_APP_CLIENT_SECRET', undefined],
        ['ADMIN_GITHUB_USER_ID', 'abc'],
        ['ADMIN_GITHUB_USER_ID', '-1'],
        ['ADMIN_SESSION_SECRET', 'trop-court'],
        ['VERCEL_GIT_REPO_OWNER', undefined],
    ])('refuse une configuration où %s vaut %s', (key, value) => {
        expect(readRemoteAdminConfig({ ...REMOTE_ENV, [key]: value })).toBeNull();
    });
});

describe('normalizePrivateKey', () => {
    it('rétablit les retours à la ligne échappés', () => {
        expect(normalizePrivateKey('  a\\nb  ')).toBe('a\nb');
    });
});

describe('resolveAdminAccessMode', () => {
    it('ouvre l’admin local en dev, quelle que soit la configuration', () => {
        expect(resolveAdminAccessMode(true, {})).toBe('local');
    });

    it('ouvre l’admin distant sur la Preview de la branche de contenu', () => {
        expect(resolveAdminAccessMode(false, REMOTE_ENV)).toBe('remote');
    });

    it('ferme l’admin en production, même configurée', () => {
        expect(resolveAdminAccessMode(false, { ...REMOTE_ENV, VERCEL_ENV: 'production' })).toBe('disabled');
    });

    it('ferme l’admin sur la Preview d’une autre branche', () => {
        expect(resolveAdminAccessMode(false, { ...REMOTE_ENV, VERCEL_GIT_COMMIT_REF: 'feature-x' })).toBe('disabled');
    });

    it('ferme l’admin si la configuration est incomplète', () => {
        expect(resolveAdminAccessMode(false, { ...REMOTE_ENV, ADMIN_SESSION_SECRET: '' })).toBe('disabled');
    });

    it('ferme l’admin hors Vercel', () => {
        expect(resolveAdminAccessMode(false, {})).toBe('disabled');
    });
});

describe('getAdminAccessMode et getRemoteAdminConfig', () => {
    afterEach(() => vi.unstubAllEnvs());

    it('lisent l’environnement du processus', () => {
        vi.stubEnv('DEV', false);
        for (const [key, value] of Object.entries(REMOTE_ENV)) vi.stubEnv(key, value as string);
        expect(getAdminAccessMode()).toBe('remote');
        expect(getRemoteAdminConfig().adminUserId).toBe(42);
    });

    it('getRemoteAdminConfig lève sans configuration', () => {
        vi.stubEnv('GITHUB_APP_ID', '');
        expect(() => getRemoteAdminConfig()).toThrow('Admin distant non configuré');
    });
});
