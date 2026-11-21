// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';

const { send } = vi.hoisted(() => ({ send: vi.fn() }));

// POURQUOI : aucun appel réseau ni lecture du .env réel dans les tests.
vi.mock('dotenv/config', () => ({}));
vi.mock('@aws-sdk/client-s3', () => {
    const command = (type: string) =>
        class {
            type = type;
            constructor(public input: Record<string, unknown>) {}
        };
    return {
        S3Client: class {
            send = send;
        },
        ListObjectsV2Command: command('list'),
        DeleteObjectsCommand: command('delete'),
        PutObjectCommand: command('put'),
    };
});

type SyncModule = typeof import('./r2-sync');

describe('syncDirToR2', () => {
    let sync: SyncModule;
    let localDir: string;

    beforeEach(async () => {
        vi.stubEnv('R2_ACCOUNT_ID', 'account');
        vi.stubEnv('R2_ACCESS_KEY_ID', 'key');
        vi.stubEnv('R2_SECRET_ACCESS_KEY', 'secret');
        vi.stubEnv('R2_BUCKET_NAME', 'bucket-test');
        vi.resetModules();
        sync = await import('./r2-sync');
        send.mockReset();
        localDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mp-r2sync-'));
    });

    afterEach(async () => {
        vi.unstubAllEnvs();
        await fs.rm(localDir, { recursive: true, force: true });
    });

    it('ne supprime rien sur R2 quand le dossier local est absent', async () => {
        send.mockResolvedValue({ Contents: [{ Key: 'blog/2026/slug/a.jpg', Size: 1 }] });
        const result = await sync.syncDirToR2(path.join(localDir, 'absent'), 'blog/2026/slug');
        expect(result.skippedReason).toBe('no-local-dir');
        expect(result.deleted).toEqual([]);
        expect(send).not.toHaveBeenCalled();
    });

    it('envoie les fichiers nouveaux ou modifiés et supprime ceux disparus localement', async () => {
        await fs.writeFile(path.join(localDir, 'nouveau.jpg'), 'abc');
        await fs.writeFile(path.join(localDir, 'identique.jpg'), '12345');
        await fs.writeFile(path.join(localDir, '.cache'), 'ignoré');
        send.mockImplementation(async (command: { type: string }) => {
            if (command.type === 'list') {
                return {
                    Contents: [
                        { Key: 'blog/2026/slug/identique.jpg', Size: 5 },
                        { Key: 'blog/2026/slug/supprime.jpg', Size: 9 },
                    ],
                };
            }
            return {};
        });

        const result = await sync.syncDirToR2(localDir, 'blog/2026/slug');

        expect(result.uploaded).toEqual(['nouveau.jpg']);
        expect(result.deleted).toEqual(['supprime.jpg']);
        expect(result.bucket).toBe('bucket-test');
        const types = send.mock.calls.map(([command]) => command.type);
        expect(types).toContain('delete');
        expect(types.filter((type) => type === 'put')).toHaveLength(1);
    });
});

describe('syncDirToR2 : cas limites', () => {
    let localDir: string;

    beforeEach(async () => {
        send.mockReset();
        localDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mp-r2sync-'));
    });

    afterEach(async () => {
        vi.unstubAllEnvs();
        await fs.rm(localDir, { recursive: true, force: true });
    });

    async function loadWithCredentials() {
        vi.stubEnv('R2_ACCOUNT_ID', 'account');
        vi.stubEnv('R2_ACCESS_KEY_ID', 'key');
        vi.stubEnv('R2_SECRET_ACCESS_KEY', 'secret');
        vi.stubEnv('R2_BUCKET_NAME', 'bucket-test');
        vi.resetModules();
        return import('./r2-sync');
    }

    it('ne contacte pas R2 sans identifiants', async () => {
        vi.stubEnv('R2_ACCOUNT_ID', '');
        vi.stubEnv('R2_BUCKET_NAME', '');
        vi.resetModules();
        const sync = await import('./r2-sync');

        const result = await sync.syncDirToR2(localDir, 'voyages/2025/troms/');

        expect(result).toEqual({
            bucket: '',
            prefix: 'voyages/2025/troms/',
            uploaded: [],
            deleted: [],
            skipped: [],
            skippedReason: 'no-credentials',
        });
        expect(send).not.toHaveBeenCalled();
    });

    it('suit la pagination, ignore les clés vides et supprime par lots de 1000', async () => {
        const sync = await loadWithCredentials();
        await fs.writeFile(path.join(localDir, 'garde.bin'), 'x');
        await fs.writeFile(path.join(localDir, 'inconnu.xyz'), 'abc');
        await fs.mkdir(path.join(localDir, 'sous-dossier'));
        const page1 = Array.from({ length: 1000 }, (_, index) => ({ Key: `p/old-${index}.jpg`, Size: 1 }));
        const page2 = [{ Key: 'p/old-last.jpg' }, {}, { Key: 'p/garde.bin', Size: 1 }];
        send.mockImplementation(async (command: { type: string; input: Record<string, unknown> }) => {
            if (command.type === 'list') {
                return command.input.ContinuationToken === 'page-2'
                    ? { Contents: page2, IsTruncated: false }
                    : { Contents: page1, IsTruncated: true, NextContinuationToken: 'page-2' };
            }
            return {};
        });

        const result = await sync.syncDirToR2(localDir, 'p');

        expect(result.prefix).toBe('p/');
        expect(result.deleted).toHaveLength(1001);
        expect(result.skipped).toEqual(['garde.bin']);
        expect(result.uploaded).toEqual(['inconnu.xyz']);
        const commands = send.mock.calls.map(([command]) => command);
        const deletes = commands.filter((command) => command.type === 'delete');
        expect(deletes.map((command) => command.input.Delete.Objects.length)).toEqual([1000, 1]);
        const put = commands.find((command) => command.type === 'put');
        expect(put.input).toMatchObject({ Key: 'p/inconnu.xyz', ContentType: 'application/octet-stream' });
    });

    it('réutilise le client et n’envoie rien quand R2 est vide et le dossier aussi', async () => {
        const sync = await loadWithCredentials();
        send.mockResolvedValue({});
        const first = await sync.syncDirToR2(localDir, 'vide');
        const second = await sync.syncDirToR2(localDir, 'vide');
        expect(first).toEqual({ bucket: 'bucket-test', prefix: 'vide/', uploaded: [], deleted: [], skipped: [] });
        expect(second).toEqual(first);
        expect(send.mock.calls.map(([command]) => command.type)).toEqual(['list', 'list']);
    });
});
