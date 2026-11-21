// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { S3Client, createClient } = vi.hoisted(() => ({
    S3Client: vi.fn(function S3Client(options) {
        this.options = options;
    }),
    createClient: vi.fn((options) => ({ options })),
}));
vi.mock('@aws-sdk/client-s3', () => ({ S3Client }));
vi.mock('@libsql/client', () => ({ createClient }));
// POURQUOI : ne jamais lire le .env réel pendant les tests.
vi.mock('dotenv', () => ({ default: { config: vi.fn() } }));

import { requireR2Config, createR2Client } from './r2.mjs';
import { createTursoClient } from './turso.mjs';
import { PROJECT_ROOT } from './env.mjs';
import fs from 'node:fs';
import path from 'node:path';

describe('scripts/lib', () => {
    let exitSpy;

    beforeEach(() => {
        exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
            throw new Error(`exit ${code}`);
        });
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it('PROJECT_ROOT pointe vers la racine du dépôt', () => {
        expect(fs.existsSync(path.join(PROJECT_ROOT, 'package.json'))).toBe(true);
    });

    it('requireR2Config renvoie la configuration complète', () => {
        vi.stubEnv('R2_ACCOUNT_ID', 'acc');
        vi.stubEnv('R2_ACCESS_KEY_ID', 'key');
        vi.stubEnv('R2_SECRET_ACCESS_KEY', 'secret');
        vi.stubEnv('R2_BUCKET_NAME', 'bucket');
        expect(requireR2Config()).toEqual({
            accountId: 'acc',
            accessKeyId: 'key',
            secretAccessKey: 'secret',
            bucketName: 'bucket',
        });
    });

    it('requireR2Config arrête le script et nomme la variable manquante (pas de bucket par défaut)', () => {
        vi.stubEnv('R2_ACCOUNT_ID', 'acc');
        vi.stubEnv('R2_ACCESS_KEY_ID', 'key');
        vi.stubEnv('R2_SECRET_ACCESS_KEY', 'secret');
        vi.stubEnv('R2_BUCKET_NAME', '');
        expect(() => requireR2Config()).toThrow('exit 1');
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('R2_BUCKET_NAME'));
        expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('createR2Client vise le point d’accès R2 du compte', () => {
        const client = createR2Client({ accountId: 'acc', accessKeyId: 'k', secretAccessKey: 's', bucketName: 'b' });
        expect(client.options).toEqual({
            region: 'auto',
            endpoint: 'https://acc.r2.cloudflarestorage.com',
            credentials: { accessKeyId: 'k', secretAccessKey: 's' },
        });
    });

    it('createTursoClient utilise l’URL et le jeton du .env', () => {
        vi.stubEnv('TURSO_DATABASE_URL', 'libsql://db.turso.io');
        vi.stubEnv('TURSO_AUTH_TOKEN', 'token');
        expect(createTursoClient().options).toEqual({ url: 'libsql://db.turso.io', authToken: 'token' });
    });

    it('createTursoClient arrête le script sans URL', () => {
        vi.stubEnv('TURSO_DATABASE_URL', '');
        expect(() => createTursoClient()).toThrow('exit 1');
    });
});
