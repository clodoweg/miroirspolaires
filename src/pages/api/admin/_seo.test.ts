// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { GET } from './seo';

type AuditedItem = {
    id: string;
    type: string;
    name: string;
    path: string;
    hasDescription: boolean;
    description: string;
    hasAltText?: boolean;
};
type TechnicalCheck = { name: string; status: string; message: string };
type SeoBody = {
    summary: {
        score: number;
        totalAuditedItems: number;
        missingDescriptionsCount: number;
        missingAltsCount: number;
        totalPhotos: number;
        technicalStatus: Record<string, boolean | number>;
    };
    technicalChecks: TechnicalCheck[];
    items: AuditedItem[];
};

let tempRoot: string;

function write(relativePath: string, content: string) {
    const fullPath = path.join(tempRoot, relativePath);
    mkdirSync(path.dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content);
}

async function callGet(): Promise<Response> {
    vi.spyOn(process, 'cwd').mockReturnValue(tempRoot);
    return GET({} as unknown as Parameters<typeof GET>[0]);
}

function writeCompleteSite() {
    write(
        'src/data/seo.json',
        JSON.stringify({
            index: 'Accueil du site',
            'voyages/2024/islande': 'Récit islandais',
            'voyages/2019/ancien': 'Ancien récit',
            'astrophotographies/nebuleuse-d-orion-101': 'Orion en couleurs',
        }),
    );
    write('src/data/alt.json', JSON.stringify({ '/assets/astrophotographies/2023/101_raw.jpg': 'Nébuleuse rouge' }));
    write(
        'data/astrobin_clodoweg_gallery_python.csv',
        [
            'ID,Title,Uploaded,Telescopes,Telescopes',
            "101,Nébuleuse d'Orion,2023-02-01,A,B",
            '102,Galaxie,,A,B',
            ',Sans identifiant,2023-01-01,A,B',
            '103,,2023-01-01,A,B',
        ].join('\n'),
    );
    write('src/content/voyages/2024/islande.md', '---\ntitle: "Islande"\n---\n');
    write('src/content/voyages/2024/sans-titre.mdx', '---\nyear: 2024\n---\n');
    write('src/content/voyages/2024/notes.txt', 'pas un récit');
    write('src/content/voyages/ancien.md', '---\ntitle: Ancien\nyear: 2019\n---\n');
    write('src/content/voyages/sans-annee.md', '---\ntitle: Sans année\n---\n');
    write('src/content/voyages/LISEZMOI.txt', 'ignoré');
    write('src/content/blog/2025/article.md', '---\ntitle: "Article"\ndate: 2024-12-31\ndescription: "Résumé"\n---\n');
    write('src/content/blog/2025/brut.md', '---\nsummary: rien\n---\n');
    write('src/content/blog/2025/image.jpg', 'ignoré');
    write('src/content/blog/plat.md', '---\ntitle: Plat\ndate: 2020-01-01\ndescription: Plat décrit\n---\n');
    write('src/content/blog/plat-nu.mdx', 'contenu');
    write('src/content/blog/LISEZMOI.txt', 'ignoré');
    write(
        'src/layouts/BaseLayout.astro',
        'import { SEO } from "astro-seo"\n<SEO title="x" />\n<script type="application/ld+json">',
    );
    write('src/pages/index.astro', '<script type="application/ld+json">');
    write('astro.config.mjs', "import sitemap from '@astrojs/sitemap';\nexport default { prefetch: true };");
    write('public/robots.txt', 'User-agent: *\nSitemap: https://www.miroirspolaires.fr/sitemap-index.xml');
    write('dist/sitemap-index.xml', '<sitemapindex/>');
}

describe('GET /api/admin/seo', () => {
    beforeEach(() => {
        tempRoot = mkdtempSync(path.join(tmpdir(), 'mp-admin-seo-'));
        vi.stubEnv('DEV', true);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
        rmSync(tempRoot, { recursive: true, force: true });
    });

    it('renvoie 404 hors du mode développement', async () => {
        vi.stubEnv('DEV', false);
        expect((await callGet()).status).toBe(404);
    });

    it('audite pages, voyages, articles et astrophotos d’un site complet', async () => {
        writeCompleteSite();
        const response = await callGet();
        const body: SeoBody = await response.json();
        expect(response.status).toBe(200);
        expect(response.headers.get('Cache-Control')).toBe('no-store');

        const byPath = new Map(body.items.map((item) => [item.path, item]));
        expect(byPath.get('/')).toMatchObject({ type: 'page', hasDescription: true });
        expect(byPath.get('/voyages/2024/islande')).toMatchObject({
            name: 'Voyage : Islande',
            hasDescription: true,
            description: 'Récit islandais',
        });
        expect(byPath.get('/voyages/2024/sans-titre')).toMatchObject({
            name: 'Voyage : sans-titre',
            hasDescription: false,
        });
        expect(byPath.get('/voyages/2019/ancien')).toMatchObject({ name: 'Voyage : Ancien', hasDescription: true });
        expect(byPath.get('/voyages/2025/sans-annee')).toMatchObject({ hasDescription: false });
        expect(byPath.get('/blog/2024/article')).toMatchObject({ name: 'Blog : Article', description: 'Résumé' });
        expect(byPath.get('/blog/2025/brut')).toMatchObject({ name: 'Blog : brut', hasDescription: false });
        expect(byPath.get('/blog/2020/plat')).toMatchObject({ hasDescription: true });
        expect(byPath.get('/blog/2026/plat-nu')).toMatchObject({ name: 'Blog : plat-nu', hasDescription: false });
        expect(byPath.get('/astrophotographies/nebuleuse-d-orion-101')).toMatchObject({
            hasDescription: true,
            hasAltText: true,
            altText: 'Nébuleuse rouge',
        });
        expect(byPath.get('/astrophotographies/galaxie-102')).toMatchObject({ hasAltText: false });
        expect(body.items.some((item) => item.path.includes('notes') || item.path.includes('LISEZMOI'))).toBe(false);

        expect(body.summary).toMatchObject({
            totalAuditedItems: 8 + 4 + 4 + 2,
            missingDescriptionsCount: 7 + 2 + 2 + 1,
            missingAltsCount: 1,
            totalPhotos: 2,
            technicalStatus: {
                astroSeoImplemented: true,
                sitemapConfigured: true,
                sitemapGenerated: true,
                robotsTxtValid: true,
                prefetchingEnabled: true,
                structuredDataFilesCount: 2,
            },
        });
        expect(body.summary.score).toBe(Math.round(50 + ((18 - 12) / 18) * 50));
        expect(body.technicalChecks.every((check) => check.status === 'ok')).toBe(true);
        expect(body.technicalChecks[4].message).toContain('2 composants');
    });

    it('signale chaque contrôle technique manquant sur un projet vide', async () => {
        const body: SeoBody = await (await callGet()).json();
        expect(body.summary).toMatchObject({
            score: 0,
            totalAuditedItems: 8,
            missingDescriptionsCount: 8,
            totalPhotos: 0,
        });
        expect(body.technicalChecks.map((check) => check.status)).toEqual([
            'error',
            'error',
            'warning',
            'warning',
            'warning',
        ]);
        expect(body.technicalChecks[2].message).toMatch(/manquant/);
        expect(body.summary.technicalStatus.sitemapGenerated).toBe(false);
    });

    it('distingue un robots.txt présent mais incomplet', async () => {
        write('public/robots.txt', 'User-agent: *');
        write('public/sitemap-index.xml', '<sitemapindex/>');
        const body: SeoBody = await (await callGet()).json();
        expect(body.technicalChecks[2]).toMatchObject({ status: 'warning' });
        expect(body.technicalChecks[2].message).toMatch(/existe mais/);
        expect(body.summary.technicalStatus.sitemapGenerated).toBe(true);
    });

    it('renvoie 500 si seo.json est corrompu', async () => {
        write('src/data/seo.json', '{corrompu');
        const response = await callGet();
        expect(response.status).toBe(500);
        expect((await response.json()).error).toEqual(expect.any(String));
    });
});
