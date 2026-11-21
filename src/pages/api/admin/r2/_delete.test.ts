// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const { send, clientConfigs } = vi.hoisted(() => ({
    send: vi.fn(),
    clientConfigs: [] as unknown[],
}));

vi.mock('@aws-sdk/client-s3', () => {
    class S3Client {
        send = send;
        constructor(config: unknown) {
            clientConfigs.push(config);
        }
    }
    class ListObjectsV2Command {
        readonly kind = 'list';
        constructor(public input: Record<string, unknown>) {}
    }
    class DeleteObjectsCommand {
        readonly kind = 'delete';
        constructor(public input: Record<string, unknown>) {}
    }
    return { S3Client, ListObjectsV2Command, DeleteObjectsCommand };
});

type DeleteModule = typeof import('./delete');
type SentCommand = { kind: 'list' | 'delete'; input: Record<string, unknown> };

let tempRoot: string;

async function loadRoute(): Promise<DeleteModule> {
    vi.resetModules();
    vi.spyOn(process, 'cwd').mockReturnValue(tempRoot);
    return import('./delete');
}

function callPost(route: DeleteModule, body: unknown) {
    const request = new Request('http://localhost:4321/api/admin/r2/delete', {
        method: 'POST',
        body: typeof body === 'string' ? body : JSON.stringify(body),
    });
    return route.POST({ request } as unknown as Parameters<DeleteModule['POST']>[0]);
}

function stubR2Credentials() {
    vi.stubEnv('R2_ACCOUNT_ID', 'compte');
    vi.stubEnv('R2_ACCESS_KEY_ID', 'id');
    vi.stubEnv('R2_SECRET_ACCESS_KEY', 'secret');
    vi.stubEnv('R2_BUCKET_NAME', 'bucket-test');
}

function sentCommands(): SentCommand[] {
    return send.mock.calls.map(([command]) => command as SentCommand);
}

describe('POST /api/admin/r2/delete', () => {
    beforeEach(() => {
        tempRoot = mkdtempSync(path.join(tmpdir(), 'mp-r2-delete-'));
        vi.stubEnv('DEV', true);
        vi.stubEnv('R2_ACCOUNT_ID', '');
        vi.stubEnv('R2_ACCESS_KEY_ID', '');
        vi.stubEnv('R2_SECRET_ACCESS_KEY', '');
        vi.stubEnv('R2_BUCKET_NAME', '');
        send.mockReset();
        clientConfigs.length = 0;
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
        rmSync(tempRoot, { recursive: true, force: true });
    });

    it('renvoie 404 hors du mode développement', async () => {
        vi.stubEnv('DEV', false);
        const response = await callPost(await loadRoute(), { target: 'local', folder: 'blog' });
        expect(response.status).toBe(404);
    });

    it.each([
        [{ folder: 'blog' }, 400],
        [{ target: 'local' }, 400],
        [{ target: 'ftp', folder: 'blog' }, 400],
        [{ target: 'local', folder: 'index' }, 403],
        [{ target: 'local', folder: 'blog/..' }, 403],
        [{ target: 'r2', folder: 'blog/../index' }, 403],
    ])('valide le corps %j (statut %i)', async (body, status) => {
        const response = await callPost(await loadRoute(), body);
        expect(response.status).toBe(status);
        expect(send).not.toHaveBeenCalled();
    });

    it('supprime récursivement un dossier local sous src/assets', async () => {
        const target = path.join(tempRoot, 'src/assets/blog/2025/slug');
        mkdirSync(target, { recursive: true });
        writeFileSync(path.join(target, 'photo.jpg'), 'x');
        const sibling = path.join(tempRoot, 'src/assets/blog/2024');
        mkdirSync(sibling, { recursive: true });

        const response = await callPost(await loadRoute(), { target: 'local', folder: 'blog/2025/slug/' });
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ success: true, message: 'Répertoire local blog/2025/slug supprimé' });
        expect(existsSync(target)).toBe(false);
        expect(existsSync(sibling)).toBe(true);
    });

    it('renvoie 404 si le dossier local n’existe pas', async () => {
        const response = await callPost(await loadRoute(), { target: 'local', folder: 'voyages/2030' });
        expect(response.status).toBe(404);
    });

    it('refuse de supprimer un fichier', async () => {
        mkdirSync(path.join(tempRoot, 'src/assets/blog'), { recursive: true });
        const file = path.join(tempRoot, 'src/assets/blog/fichier.jpg');
        writeFileSync(file, 'x');
        const response = await callPost(await loadRoute(), { target: 'local', folder: 'blog/fichier.jpg' });
        expect(response.status).toBe(400);
        expect(existsSync(file)).toBe(true);
    });

    it('renvoie 500 sans identifiants R2', async () => {
        const response = await callPost(await loadRoute(), { target: 'r2', folder: 'blog' });
        expect(response.status).toBe(500);
        expect((await response.json()).error).toMatch(/Identifiants R2 manquants/);
        expect(send).not.toHaveBeenCalled();
    });

    it('liste puis supprime les objets du préfixe R2 page par page', async () => {
        stubR2Credentials();
        send.mockImplementation(async (command: SentCommand) => {
            if (command.kind === 'delete') return {};
            if (!command.input.ContinuationToken) {
                return {
                    Contents: [{ Key: 'blog/2025/a.jpg' }, { Key: 'blog/2025/b.jpg' }],
                    IsTruncated: true,
                    NextContinuationToken: 'jeton',
                };
            }
            return { Contents: [{ Key: 'blog/2025/c.jpg' }], IsTruncated: false };
        });

        const response = await callPost(await loadRoute(), { target: 'r2', folder: 'blog/2025' });
        expect(response.status).toBe(200);
        expect((await response.json()).message).toBe('Répertoire distant R2 blog/2025 nettoyé. 3 objets supprimés.');
        expect(clientConfigs[0]).toMatchObject({ endpoint: 'https://compte.r2.cloudflarestorage.com' });

        const commands = sentCommands();
        expect(commands.map((command) => command.kind)).toEqual(['list', 'delete', 'list', 'delete']);
        expect(commands[0].input).toMatchObject({ Bucket: 'bucket-test', Prefix: 'blog/2025/' });
        expect(commands[2].input.ContinuationToken).toBe('jeton');
        expect(commands[1].input).toEqual({
            Bucket: 'bucket-test',
            Delete: { Objects: [{ Key: 'blog/2025/a.jpg' }, { Key: 'blog/2025/b.jpg' }] },
        });
    });

    it('ne supprime rien si le préfixe R2 est vide', async () => {
        stubR2Credentials();
        send.mockResolvedValue({ Contents: [] });
        const response = await callPost(await loadRoute(), { target: 'r2', folder: 'voyages' });
        expect((await response.json()).message).toMatch(/0 objets supprimés/);
        expect(sentCommands().map((command) => command.kind)).toEqual(['list']);
    });

    it('renvoie 500 si R2 échoue ou si le corps n’est pas du JSON', async () => {
        stubR2Credentials();
        send.mockRejectedValue(new Error('AccessDenied'));
        const route = await loadRoute();
        const failure = await callPost(route, { target: 'r2', folder: 'blog' });
        expect(failure.status).toBe(500);
        expect((await failure.json()).error).toBe('AccessDenied');
        expect((await callPost(route, '{pas du json')).status).toBe(500);
    });
});
