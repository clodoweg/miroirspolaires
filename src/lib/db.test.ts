/**
 * Tests du client Turso : vérifie l'exigence de TURSO_DATABASE_URL et la
 * transmission de l'URL et du jeton à `createClient`, sans connexion réelle.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const createClientMock = vi.fn((config: { url: string; authToken?: string }) => ({ config }));

vi.mock('@libsql/client', () => ({
    createClient: (config: { url: string; authToken?: string }) => createClientMock(config),
}));

describe('db', () => {
    beforeEach(() => {
        vi.resetModules();
        createClientMock.mockClear();
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("lève une erreur explicite quand TURSO_DATABASE_URL n'est pas définie", async () => {
        vi.stubEnv('TURSO_DATABASE_URL', '');
        await expect(import('./db')).rejects.toThrow("TURSO_DATABASE_URL n'est pas définie");
        expect(createClientMock).not.toHaveBeenCalled();
    });

    it("crée le client avec l'URL et le jeton d'authentification de l'environnement", async () => {
        vi.stubEnv('TURSO_DATABASE_URL', 'libsql://exemple.turso.io');
        vi.stubEnv('TURSO_AUTH_TOKEN', 'jeton-secret');
        const { db } = await import('./db');
        expect(createClientMock).toHaveBeenCalledWith({
            url: 'libsql://exemple.turso.io',
            authToken: 'jeton-secret',
        });
        expect(db).toEqual({ config: { url: 'libsql://exemple.turso.io', authToken: 'jeton-secret' } });
    });
});
