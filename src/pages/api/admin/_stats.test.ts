// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const { listPosts, listVoyages, send } = vi.hoisted(() => ({
    listPosts: vi.fn(),
    listVoyages: vi.fn(),
    send: vi.fn(),
}));

vi.mock('@/lib/admin/blog-files', () => ({ listPosts }));
vi.mock('@/lib/admin/voyages-files', () => ({ listVoyages }));
vi.mock('@aws-sdk/client-s3', () => {
    class S3Client {
        send = send;
    }
    class ListObjectsV2Command {
        constructor(public input: Record<string, unknown>) {}
    }
    return { S3Client, ListObjectsV2Command };
});

type StatsModule = typeof import('./stats');
type CategoryStats = { files: number; size: number };
type DashboardBody = {
    counts: { blog: number; voyages: number; astrophotos: { total: number; withRaw: number; withMini: number } };
    recent: { kind: string; slug: string; title: string; href: string; editHref: string; mtimeMs: number }[];
    seo: {
        score: number;
        totalAuditedItems: number;
        missingDescriptionsCount: number;
        missingAltsCount: number;
        totalPhotos: number;
        technicalChecks: { ok: number; warning: number; error: number };
    } | null;
    lighthouse: Record<string, number | string> | null;
    r2: {
        local: { totalFiles: number; totalSize: number; categories: Record<string, CategoryStats> };
        r2: { totalFiles: number; totalSize: number; categories: Record<string, CategoryStats> };
    } | null;
    lastUpdatedAt: string;
};

let tempRoot: string;

function write(relativePath: string, content: string, mtime?: Date) {
    const fullPath = path.join(tempRoot, relativePath);
    mkdirSync(path.dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content);
    if (mtime) utimesSync(fullPath, mtime, mtime);
}

async function callRoute(): Promise<Response> {
    vi.resetModules();
    vi.spyOn(process, 'cwd').mockReturnValue(tempRoot);
    const route: StatsModule = await import('./stats');
    return route.GET({} as unknown as Parameters<StatsModule['GET']>[0]);
}

async function callGet(): Promise<DashboardBody> {
    const response = await callRoute();
    expect(response.status).toBe(200);
    return response.json();
}

function stubR2Credentials() {
    vi.stubEnv('R2_ACCOUNT_ID', 'compte');
    vi.stubEnv('R2_ACCESS_KEY_ID', 'id');
    vi.stubEnv('R2_SECRET_ACCESS_KEY', 'secret');
    vi.stubEnv('R2_BUCKET_NAME', 'bucket-test');
}

function writeCompleteSite() {
    write(
        'data/astrobin_clodoweg_gallery_python.csv',
        ['ID,Title,Uploaded', '101,Orion,2023-02-01', '102,Galaxie,', ',Sans id,2023-01-01', '103,,2024-01-01'].join(
            '\n',
        ),
    );
    write('src/assets/astrophotographies/2023/101_raw.jpg', '12345');
    write('src/assets/astrophotographies/mini/2023/101_raw.jpg', '12');
    write('src/assets/astrophotographies/unknown/102_raw.jpg', '123');
    write('src/assets/blog/2025/a.jpg', '1234');
    write('src/assets/index/hero.jpg', 'ignoré');
    write('src/assets/.cache/x.jpg', 'ignoré');
    write('src/assets/divers/notes.jpg', '1');
    write(
        'src/data/seo.json',
        JSON.stringify({ index: 'Accueil', 'voyages/2024/islande': 'Islande', 'voyages/2019/ancien': 'x' }),
    );
    write('src/data/alt.json', JSON.stringify({ '/assets/astrophotographies/2023/101_raw.jpg': 'Orion' }));
    write('src/content/voyages/2024/islande.md', '---\ntitle: Islande\n---\n', new Date('2025-03-01'));
    write('src/content/voyages/2024/notes.txt', 'ignoré');
    write('src/content/voyages/ancien.md', '---\nyear: 2019\n---\n');
    write('src/content/voyages/sans-annee.md', '---\ntitle: x\n---\n');
    write('src/content/voyages/LISEZMOI.txt', 'ignoré');
    write('src/content/blog/2025/article.md', '---\ndescription: "Résumé"\n---\n', new Date('2025-06-01'));
    write('src/content/blog/2025/brut.md', '---\ntitle: brut\n---\n', new Date('2024-01-01'));
    write('src/content/blog/2025/image.jpg', 'ignoré');
    write('src/content/blog/plat.md', '---\ndescription: Plat\n---\n');
    write('src/content/blog/plat-nu.md', 'contenu');
    write('src/content/blog/LISEZMOI.txt', 'ignoré');
    write(
        'src/layouts/BaseLayout.astro',
        'import { SEO } from "astro-seo"\n<SEO />\n<script type="application/ld+json">',
    );
    write('astro.config.mjs', 'integrations: [sitemap()], prefetch: true');
    write('public/robots.txt', 'User-agent: *\nSitemap: https://www.miroirspolaires.fr/sitemap-index.xml');
    write(
        'src/data/lighthouse-results.json',
        JSON.stringify({
            timestamp: '2026-10-01T00:00:00Z',
            durationSeconds: 42,
            summary: { averagePerformance: 95, averageAccessibility: 100, averageSeo: 98 },
            results: [
                { url: '/', metrics: { lcp: 1000, cls: 0.01, tbt: 100 } },
                { url: '/blog', metrics: { lcp: 2001, tbt: 51 } },
                { url: '/erreur' },
            ],
        }),
    );
}

describe('GET /api/admin/stats', () => {
    beforeEach(() => {
        tempRoot = mkdtempSync(path.join(tmpdir(), 'mp-admin-stats-'));
        vi.stubEnv('DEV', true);
        vi.stubEnv('R2_ACCOUNT_ID', '');
        vi.stubEnv('R2_ACCESS_KEY_ID', '');
        vi.stubEnv('R2_SECRET_ACCESS_KEY', '');
        vi.stubEnv('R2_BUCKET_NAME', '');
        listPosts.mockReset();
        listVoyages.mockReset();
        listPosts.mockResolvedValue([]);
        listVoyages.mockResolvedValue([]);
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
        expect(listPosts).not.toHaveBeenCalled();
    });

    it('agrège contenus, SEO, Lighthouse et R2 sur un site complet', async () => {
        writeCompleteSite();
        stubR2Credentials();
        listPosts.mockResolvedValue([
            { year: '2025', slug: 'article', title: 'Article', date: '2025-06-01', image: 'a.jpg' },
            { year: '2025', slug: 'brut', title: '', date: '2024-01-01', image: '' },
        ]);
        listVoyages.mockResolvedValue([
            { year: '2024', slug: 'islande', title: 'Islande', image: 'i.jpg' },
            { year: '2030', slug: 'futur', title: '', image: '' },
        ]);
        send.mockImplementation(async (command: { input: Record<string, unknown> }) => {
            if (!command.input.ContinuationToken) {
                return {
                    Contents: [
                        { Key: 'blog/2025/a.jpg', Size: 4 },
                        { Key: 'blog/', Size: 0 },
                        { Key: 'index/hero.jpg', Size: 9 },
                        { Key: 'divers/x.bin' },
                    ],
                    IsTruncated: true,
                    NextContinuationToken: 'page-2',
                };
            }
            return { Contents: [{ Key: 'astrophotographies/2023/101_raw.jpg', Size: 5 }], IsTruncated: false };
        });

        const body = await callGet();

        expect(body.counts).toEqual({ blog: 2, voyages: 2, astrophotos: { total: 3, withRaw: 2, withMini: 1 } });
        expect(body.recent.map((item) => item.slug)).toEqual(['article', 'islande', 'brut', 'futur']);
        expect(body.recent[0]).toMatchObject({
            kind: 'blog',
            href: '/blog/article',
            editHref: '/admin/blog?year=2025&slug=article',
        });
        expect(body.recent[1]).toMatchObject({ kind: 'voyage', href: '/voyages/2024/islande' });
        expect(body.recent[2].title).toBe('brut');
        expect(body.recent[3]).toMatchObject({ title: 'futur', mtimeMs: 0 });

        expect(body.seo).toEqual({
            score: Math.round(50 + ((17 - 12) / 17) * 50),
            totalAuditedItems: 8 + 3 + 4 + 2,
            missingDescriptionsCount: 7 + 1 + 2 + 2,
            missingAltsCount: 1,
            totalPhotos: 2,
            technicalChecks: { ok: 5, warning: 0, error: 0 },
        });

        expect(body.lighthouse).toEqual({
            averagePerformance: 95,
            averageAccessibility: 100,
            averageBestPractices: 0,
            averageSeo: 98,
            averageLcp: 1501,
            averageCls: 0.005,
            averageTbt: 76,
            pagesAudited: 3,
            timestamp: '2026-10-01T00:00:00Z',
            durationSeconds: 42,
        });

        expect(body.r2?.local.categories).toMatchObject({
            astrophotographies: { files: 3, size: 10 },
            blog: { files: 1, size: 4 },
            voyages: { files: 0, size: 0 },
            divers: { files: 1, size: 1 },
        });
        expect(body.r2?.local.totalFiles).toBe(5);
        expect(body.r2?.r2).toMatchObject({
            totalFiles: 3,
            totalSize: 9,
            categories: {
                blog: { files: 1, size: 4 },
                astrophotographies: { files: 1, size: 5 },
                divers: { files: 1, size: 0 },
            },
        });
        expect(body.r2?.r2.categories).not.toHaveProperty('index');
        expect(Number.isNaN(Date.parse(body.lastUpdatedAt))).toBe(false);
    });

    it('se replie sur des valeurs vides pour un projet vide et des listes en échec', async () => {
        listPosts.mockRejectedValue(new Error('EACCES'));
        listVoyages.mockRejectedValue(new Error('EACCES'));
        const body = await callGet();
        expect(body.counts).toEqual({ blog: 0, voyages: 0, astrophotos: { total: 0, withRaw: 0, withMini: 0 } });
        expect(body.recent).toEqual([]);
        expect(body.seo).toMatchObject({
            score: 0,
            totalAuditedItems: 8,
            missingDescriptionsCount: 8,
            technicalChecks: { ok: 0, warning: 3, error: 2 },
        });
        expect(body.lighthouse).toBeNull();
        expect(body.r2).toEqual({
            local: {
                totalFiles: 0,
                totalSize: 0,
                categories: {
                    blog: { files: 0, size: 0 },
                    voyages: { files: 0, size: 0 },
                    astrophotographies: { files: 0, size: 0 },
                },
            },
            r2: { totalFiles: 0, totalSize: 0, categories: {} },
        });
        expect(send).not.toHaveBeenCalled();
    });

    it('ignore un rapport Lighthouse sans résumé et met le SEO à null si seo.json est corrompu', async () => {
        write('src/data/lighthouse-results.json', JSON.stringify({ results: [] }));
        write('src/data/seo.json', '{corrompu');
        const body = await callGet();
        expect(body.lighthouse).toBeNull();
        expect(body.seo).toBeNull();
    });

    it('met Lighthouse à null si le rapport est illisible et calcule des moyennes nulles sans métriques', async () => {
        write('src/data/lighthouse-results.json', '{corrompu');
        expect((await callGet()).lighthouse).toBeNull();
        write('src/data/lighthouse-results.json', JSON.stringify({ summary: {}, results: [{ url: '/' }] }));
        expect((await callGet()).lighthouse).toMatchObject({
            averageLcp: 0,
            averageCls: 0,
            averageTbt: 0,
            pagesAudited: 1,
            timestamp: '',
        });
    });

    it('garde les statistiques locales si la liste R2 échoue', async () => {
        stubR2Credentials();
        write('src/assets/blog/a.jpg', '12');
        send.mockRejectedValue(new Error('AccessDenied'));
        const body = await callGet();
        expect(body.r2?.local.totalFiles).toBe(1);
        expect(body.r2?.r2).toEqual({ totalFiles: 0, totalSize: 0, categories: {} });
        expect(console.error).toHaveBeenCalled();
    });

    it('s’arrête dès que R2 renvoie une page vide', async () => {
        stubR2Credentials();
        send.mockResolvedValue({ Contents: [] });
        const body = await callGet();
        expect(send).toHaveBeenCalledTimes(1);
        expect(body.r2?.r2.categories).toEqual({
            blog: { files: 0, size: 0 },
            voyages: { files: 0, size: 0 },
            astrophotographies: { files: 0, size: 0 },
        });
    });
});
