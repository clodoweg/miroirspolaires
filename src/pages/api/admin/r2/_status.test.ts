// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const { send } = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock('@aws-sdk/client-s3', () => {
    class S3Client {
        send = send;
    }
    class ListObjectsV2Command {
        constructor(public input: Record<string, unknown>) {}
    }
    return { S3Client, ListObjectsV2Command };
});

type StatusModule = typeof import('./status');
type CategoryFlags = {
    files: number;
    size: number;
    hasNewerLocal: boolean;
    hasMissingR2: boolean;
    hasMissingLocal: boolean;
    isIdentical: boolean;
};
type StatusBody = {
    local: { totalFiles: number; totalSize: number; categories: Record<string, CategoryFlags> };
    r2: { totalFiles: number; totalSize: number; categories: Record<string, CategoryFlags> };
};

const OLD_DATE = new Date('2024-01-01T00:00:00Z');
const NEW_DATE = new Date('2025-01-01T00:00:00Z');

let tempRoot: string;

async function loadRoute(): Promise<StatusModule> {
    vi.resetModules();
    vi.spyOn(process, 'cwd').mockReturnValue(tempRoot);
    return import('./status');
}

async function callRoute(): Promise<Response> {
    const route = await loadRoute();
    return route.GET({} as unknown as Parameters<StatusModule['GET']>[0]);
}

async function callGet(): Promise<{ status: number; body: StatusBody }> {
    const response = await callRoute();
    return { status: response.status, body: await response.json() };
}

function writeAsset(relativePath: string, content: string, mtime = OLD_DATE) {
    const fullPath = path.join(tempRoot, 'src/assets', relativePath);
    mkdirSync(path.dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content);
    utimesSync(fullPath, mtime, mtime);
}

function stubR2Credentials() {
    vi.stubEnv('R2_ACCOUNT_ID', 'compte');
    vi.stubEnv('R2_ACCESS_KEY_ID', 'id');
    vi.stubEnv('R2_SECRET_ACCESS_KEY', 'secret');
    vi.stubEnv('R2_BUCKET_NAME', 'bucket-test');
}

describe('GET /api/admin/r2/status', () => {
    beforeEach(() => {
        tempRoot = mkdtempSync(path.join(tmpdir(), 'mp-r2-status-'));
        vi.stubEnv('DEV', true);
        stubR2Credentials();
        send.mockReset();
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
        rmSync(tempRoot, { recursive: true, force: true });
    });

    it('renvoie 404 hors du mode développement', async () => {
        vi.stubEnv('DEV', false);
        expect((await callRoute()).status).toBe(404);
        expect(send).not.toHaveBeenCalled();
    });

    it('renvoie 500 sans identifiants R2', async () => {
        vi.stubEnv('R2_BUCKET_NAME', '');
        const { status } = await callGet();
        expect(status).toBe(500);
        expect(send).not.toHaveBeenCalled();
    });

    it('renvoie des catégories vides sans dossier d’assets ni objet R2', async () => {
        send.mockResolvedValue({ Contents: [] });
        const { status, body } = await callGet();
        expect(status).toBe(200);
        expect(body.local.totalFiles).toBe(0);
        expect(Object.keys(body.local.categories).sort()).toEqual(['astrophotographies', 'blog', 'voyages']);
        expect(body.local.categories.blog.isIdentical).toBe(true);
    });

    it('compare fichier par fichier le local et R2 par catégorie et sous-dossier', async () => {
        writeAsset('blog/2025/identique.jpg', 'aaaa');
        writeAsset('blog/2025/modifie.jpg', 'bbbbbb', NEW_DATE);
        writeAsset('voyages/2024/absent-r2.jpg', 'cc');
        writeAsset('astrophotographies/2023/taille-diff-ancien.jpg', 'ddd');
        writeAsset('index/hero.jpg', 'ignore');
        writeAsset('.cache/x.jpg', 'ignore');
        writeAsset('racine.jpg', 'r');

        send.mockImplementation(async (command: { input: Record<string, unknown> }) => {
            if (!command.input.ContinuationToken) {
                return {
                    Contents: [
                        { Key: 'blog/2025/identique.jpg', Size: 4, LastModified: OLD_DATE },
                        { Key: 'blog/2025/modifie.jpg', Size: 3, LastModified: OLD_DATE },
                        { Key: 'blog/', Size: 0 },
                        { Key: 'index/hero.jpg', Size: 6 },
                    ],
                    IsTruncated: true,
                    NextContinuationToken: 'page-2',
                };
            }
            return {
                Contents: [
                    { Key: 'astrophotographies/2023/taille-diff-ancien.jpg', Size: 10, LastModified: NEW_DATE },
                    { Key: 'astrophotographies/2023/absent-local.jpg' },
                    { Key: 'divers.txt', Size: 1 },
                ],
                IsTruncated: false,
            };
        });

        const { body } = await callGet();
        expect(send).toHaveBeenCalledTimes(2);

        // racine.jpg, posé à la racine de src/assets, n'appartient à aucun dossier de médias.
        expect(body.local.totalFiles).toBe(4);
        expect(body.local.categories).not.toHaveProperty('racine.jpg');
        expect(body.local.totalSize).toBe(4 + 6 + 2 + 3);
        expect(body.r2.totalFiles).toBe(4);
        expect(body.r2.totalSize).toBe(4 + 3 + 10 + 0);

        expect(body.local.categories['blog/2025']).toMatchObject({
            files: 2,
            hasNewerLocal: true,
            hasMissingR2: false,
            hasMissingLocal: false,
            isIdentical: false,
        });
        expect(body.local.categories['voyages/2024']).toMatchObject({ hasMissingR2: true, hasNewerLocal: true });
        expect(body.r2.categories['voyages/2024']).toMatchObject({ files: 0, size: 0 });
        expect(body.local.categories.astrophotographies).toMatchObject({
            hasNewerLocal: false,
            hasMissingLocal: true,
            isIdentical: false,
        });
        expect(body.r2.categories['astrophotographies/2023']).toMatchObject({ files: 2, size: 10 });
        expect(body.local.categories).not.toHaveProperty('index');
        expect(body.r2.categories).not.toHaveProperty('index');
    });

    it('considère identique une catégorie de même taille malgré des dates différentes', async () => {
        writeAsset('voyages/2024/a.jpg', 'aaaa', NEW_DATE);
        send.mockResolvedValue({
            Contents: [{ Key: 'voyages/2024/a.jpg', Size: 4, LastModified: OLD_DATE }],
            IsTruncated: false,
        });
        const { body } = await callGet();
        expect(body.local.categories.voyages).toMatchObject({ isIdentical: true, hasNewerLocal: false });
    });

    it('garde les statistiques locales si la liste R2 échoue', async () => {
        writeAsset('blog/a.jpg', 'aa');
        send.mockRejectedValue(new Error('NetworkingError'));
        const { status, body } = await callGet();
        expect(status).toBe(200);
        expect(body.local.totalFiles).toBe(1);
        expect(body.r2.totalFiles).toBe(0);
        expect(body.local.categories.blog.hasMissingR2).toBe(true);
        expect(console.error).toHaveBeenCalled();
    });
});
