/**
 * @file src/pages/api/admin/stats.ts
 * @description Point d'entrée unifié pour le tableau de bord "Vue d'ensemble".
 * Responsabilité : Agréger en un seul appel toutes les métriques clés du site :
 * inventaire de contenu, santé SEO, scores Lighthouse, et statut de synchronisation R2.
 * Chaque source de données échoue gracieusement (null) si indisponible.
 */

import type { APIRoute } from 'astro';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import { requireAdmin, jsonResponse, fileExists, createUniqueHeaderTransform } from '@/lib/admin/shared';
import { listPosts } from '@/lib/admin/blog-files';
import { listVoyages } from '@/lib/admin/voyages-files';
import { LOCAL_ONLY_DIRS } from '@/config/imageConfig.mjs';
import { foldAccents } from '@/utils/normalize';

export const prerender = false;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RecentItem {
    kind: 'blog' | 'voyage';
    year: string;
    slug: string;
    title: string;
    href: string;
    editHref: string;
    date?: string;
    image?: string;
    mtimeMs: number;
}

interface SeoSummary {
    score: number;
    totalAuditedItems: number;
    missingDescriptionsCount: number;
    missingAltsCount: number;
    totalPhotos: number;
    technicalChecks: { ok: number; warning: number; error: number };
}

interface LighthouseSummary {
    averagePerformance: number;
    averageAccessibility: number;
    averageBestPractices: number;
    averageSeo: number;
    averageLcp: number;
    averageCls: number;
    averageTbt: number;
    pagesAudited: number;
    timestamp: string;
    durationSeconds: number;
}

interface CategoryStats {
    files: number;
    size: number;
}

interface R2Summary {
    local: { totalFiles: number; totalSize: number; categories: Record<string, CategoryStats> };
    r2: { totalFiles: number; totalSize: number; categories: Record<string, CategoryStats> };
}

interface DashboardStats {
    counts: {
        blog: number;
        voyages: number;
        astrophotos: {
            total: number;
            withRaw: number;
            withMini: number;
        };
    };
    recent: RecentItem[];
    seo: SeoSummary | null;
    lighthouse: LighthouseSummary | null;
    r2: R2Summary | null;
    lastUpdatedAt: string;
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const ROOT = process.cwd();
const BLOG_ROOT = path.join(ROOT, 'src/content/blog');
const VOY_ROOT = path.join(ROOT, 'src/content/voyages');
const CSV_PATH = path.join(ROOT, 'data/astrobin_clodoweg_gallery_python.csv');
const ASTRO_ROOT = path.join(ROOT, 'src/assets/astrophotographies');
const LIGHTHOUSE_PATH = path.join(ROOT, 'src/data/lighthouse-results.json');
const SEO_JSON_PATH = path.join(ROOT, 'src/data/seo.json');
const ALT_JSON_PATH = path.join(ROOT, 'src/data/alt.json');
const LAYOUT_PATH = path.join(ROOT, 'src/layouts/BaseLayout.astro');
const ASTRO_CONFIG_PATH = path.join(ROOT, 'astro.config.mjs');
const ROBOTS_PATH = path.join(ROOT, 'public/robots.txt');
const ASSETS_DIR = path.join(ROOT, 'src/assets');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function mtimeOf(p: string): Promise<number> {
    try {
        return (await fs.stat(p)).mtimeMs;
    } catch {
        return 0;
    }
}

async function countAstrophotos(): Promise<{ total: number; withRaw: number; withMini: number }> {
    if (!(await fileExists(CSV_PATH))) return { total: 0, withRaw: 0, withMini: 0 };
    const content = await fs.readFile(CSV_PATH, 'utf-8');
    const parsed = Papa.parse<Record<string, string>>(content, {
        header: true,
        skipEmptyLines: true,
        transformHeader: createUniqueHeaderTransform(),
    });
    const rows = parsed.data ?? [];
    let withRaw = 0;
    let withMini = 0;
    for (const row of rows) {
        const id = String(row.ID ?? '').trim();
        if (!id) continue;
        const uploaded = String(row.Uploaded ?? '');
        const year = uploaded.slice(0, 4).match(/^\d{4}$/) ? uploaded.slice(0, 4) : 'unknown';
        const rawPath = path.join(ASTRO_ROOT, year, `${id}_raw.jpg`);
        const miniPath = path.join(ASTRO_ROOT, 'mini', year, `${id}_raw.jpg`);
        if (await fileExists(rawPath)) withRaw++;
        if (await fileExists(miniPath)) withMini++;
    }
    return { total: rows.filter((r) => r.ID).length, withRaw, withMini };
}

// ---------------------------------------------------------------------------
// SEO Summary — lightweight inline audit (same logic as /api/admin/seo)
// ---------------------------------------------------------------------------

function slugify(title: string): string {
    return foldAccents(title)
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
}

async function gatherSeoSummary(): Promise<SeoSummary> {
    const seoData: Record<string, string> = (await fileExists(SEO_JSON_PATH))
        ? JSON.parse(await fs.readFile(SEO_JSON_PATH, 'utf8'))
        : {};
    const altData: Record<string, string> = (await fileExists(ALT_JSON_PATH))
        ? JSON.parse(await fs.readFile(ALT_JSON_PATH, 'utf8'))
        : {};

    let totalItems = 0;
    let missingDescriptions = 0;
    let totalPhotos = 0;
    let missingAlts = 0;

    // Static pages
    const staticKeys = [
        'index',
        'astrophotographies/index',
        'voyages/index',
        'blog/index',
        'videos/index',
        'a-propos',
        'observatoires',
        'statistiques',
    ];
    for (const key of staticKeys) {
        totalItems++;
        if (!seoData[key]) missingDescriptions++;
    }

    // Voyages
    const VOYAGES_DIR = path.join(ROOT, 'src/content/voyages');
    if (await fileExists(VOYAGES_DIR)) {
        const yearDirs = await fs.readdir(VOYAGES_DIR);
        for (const yearDir of yearDirs) {
            const yearPath = path.join(VOYAGES_DIR, yearDir);
            const stat = await fs.stat(yearPath);
            if (!stat.isDirectory()) {
                // flat file in root — legacy structure
                if (yearDir.endsWith('.md') || yearDir.endsWith('.mdx')) {
                    totalItems++;
                    const content = await fs.readFile(yearPath, 'utf8');
                    const yearMatch = content.match(/year:\s*(\d+)/);
                    const yr = yearMatch ? yearMatch[1] : '2025';
                    const slug = yearDir.replace(/\.(md|mdx)$/, '');
                    if (!seoData[`voyages/${yr}/${slug}`]) missingDescriptions++;
                }
                continue;
            }
            const files = await fs.readdir(yearPath);
            for (const f of files) {
                if (!f.endsWith('.md') && !f.endsWith('.mdx')) continue;
                totalItems++;
                const slug = f.replace(/\.(md|mdx)$/, '');
                if (!seoData[`voyages/${yearDir}/${slug}`]) missingDescriptions++;
            }
        }
    }

    // Blog
    const BLOG_DIR = path.join(ROOT, 'src/content/blog');
    if (await fileExists(BLOG_DIR)) {
        const yearDirs = await fs.readdir(BLOG_DIR);
        for (const yearDir of yearDirs) {
            const yearPath = path.join(BLOG_DIR, yearDir);
            const stat = await fs.stat(yearPath);
            if (!stat.isDirectory()) {
                if (yearDir.endsWith('.md') || yearDir.endsWith('.mdx')) {
                    totalItems++;
                    const content = await fs.readFile(yearPath, 'utf8');
                    const descMatch = content.match(/description:\s*["']?([^"\r\n]+)["']?/);
                    if (!descMatch?.[1]) missingDescriptions++;
                }
                continue;
            }
            const files = await fs.readdir(yearPath);
            for (const f of files) {
                if (!f.endsWith('.md') && !f.endsWith('.mdx')) continue;
                totalItems++;
                const content = await fs.readFile(path.join(yearPath, f), 'utf8');
                const descMatch = content.match(/description:\s*["']?([^"\r\n]+)["']?/);
                if (!descMatch?.[1]) missingDescriptions++;
            }
        }
    }

    // Astrophotographies
    if (await fileExists(CSV_PATH)) {
        const csvContent = await fs.readFile(CSV_PATH, 'utf8');
        const { data: photos } = Papa.parse(csvContent, { header: true, dynamicTyping: true, skipEmptyLines: true });
        for (const photo of photos as any[]) {
            if (!photo.ID || !photo.Title) continue;
            totalPhotos++;
            totalItems++;
            const slug = `${slugify(photo.Title)}-${photo.ID}`;
            if (!seoData[`astrophotographies/${slug}`]) missingDescriptions++;
            const uploadYearMatch = photo.Uploaded ? String(photo.Uploaded).match(/(\d{4})/) : null;
            const uploadYear = uploadYearMatch ? uploadYearMatch[1] : '2025';
            const altKey = `/assets/astrophotographies/${uploadYear}/${photo.ID}_raw.jpg`;
            if (!altData[altKey]) missingAlts++;
        }
    }

    // Technical checks
    const layoutContent = (await fileExists(LAYOUT_PATH)) ? await fs.readFile(LAYOUT_PATH, 'utf8') : '';
    const astroSeoOk = layoutContent.includes('import { SEO } from "astro-seo"') && layoutContent.includes('<SEO');
    const configContent = (await fileExists(ASTRO_CONFIG_PATH)) ? await fs.readFile(ASTRO_CONFIG_PATH, 'utf8') : '';
    const sitemapOk = configContent.includes('@astrojs/sitemap') || configContent.includes('sitemap()');
    const robotsContent = (await fileExists(ROBOTS_PATH)) ? await fs.readFile(ROBOTS_PATH, 'utf8') : '';
    const robotsOk = robotsContent.includes('Sitemap:') && robotsContent.includes('User-agent:');
    const prefetchOk = configContent.includes('prefetch');

    // Structured data detection
    let structuredDataCount = 0;
    const filesToCheck = [
        path.join(ROOT, 'src/layouts/BaseLayout.astro'),
        path.join(ROOT, 'src/pages/index.astro'),
        path.join(ROOT, 'src/pages/astrophotographies/[slug].astro'),
        path.join(ROOT, 'src/pages/blog/[...slug].astro'),
        path.join(ROOT, 'src/pages/videos/[...slug].astro'),
        path.join(ROOT, 'src/components/astrophotography/TechnicalDetails.astro'),
    ];
    for (const fp of filesToCheck) {
        if (await fileExists(fp)) {
            const c = await fs.readFile(fp, 'utf8');
            if (c.includes('ld+json')) structuredDataCount++;
        }
    }
    const structuredOk = structuredDataCount > 0;

    const checks = [astroSeoOk, sitemapOk, robotsOk, prefetchOk, structuredOk];
    // WARNING: robots.txt and prefetch are "warning" not "error" when false
    const techCheckResults = [
        { value: astroSeoOk, level: 'error' as const },
        { value: sitemapOk, level: 'error' as const },
        { value: robotsOk, level: 'warning' as const },
        { value: prefetchOk, level: 'warning' as const },
        { value: structuredOk, level: 'warning' as const },
    ];
    let okCount = 0,
        warnCount = 0,
        errCount = 0;
    for (const c of techCheckResults) {
        if (c.value) {
            okCount++;
        } else if (c.level === 'warning') {
            warnCount++;
        } else {
            errCount++;
        }
    }

    // Score computation (same formula as /api/admin/seo)
    let techScore = 0;
    for (const v of checks) {
        if (v) techScore += 10;
    }
    const descCoverage = totalItems > 0 ? ((totalItems - missingDescriptions) / totalItems) * 50 : 50;
    const finalScore = Math.round(techScore + descCoverage);

    return {
        score: finalScore,
        totalAuditedItems: totalItems,
        missingDescriptionsCount: missingDescriptions,
        missingAltsCount: missingAlts,
        totalPhotos,
        technicalChecks: { ok: okCount, warning: warnCount, error: errCount },
    };
}

// ---------------------------------------------------------------------------
// Lighthouse Summary — parsed from static JSON file
// ---------------------------------------------------------------------------

async function gatherLighthouseSummary(): Promise<LighthouseSummary | null> {
    if (!(await fileExists(LIGHTHOUSE_PATH))) return null;
    const raw = JSON.parse(await fs.readFile(LIGHTHOUSE_PATH, 'utf8'));
    if (!raw?.summary || !Array.isArray(raw.results)) return null;

    // Compute average CWV metrics from individual page results
    let lcpSum = 0,
        clsSum = 0,
        tbtSum = 0,
        metricsCount = 0;
    for (const r of raw.results) {
        if (r.metrics) {
            lcpSum += r.metrics.lcp ?? 0;
            clsSum += r.metrics.cls ?? 0;
            tbtSum += r.metrics.tbt ?? 0;
            metricsCount++;
        }
    }

    return {
        averagePerformance: raw.summary.averagePerformance ?? 0,
        averageAccessibility: raw.summary.averageAccessibility ?? 0,
        averageBestPractices: raw.summary.averageBestPractices ?? 0,
        averageSeo: raw.summary.averageSeo ?? 0,
        averageLcp: metricsCount > 0 ? Math.round(lcpSum / metricsCount) : 0,
        averageCls: metricsCount > 0 ? +(clsSum / metricsCount).toFixed(3) : 0,
        averageTbt: metricsCount > 0 ? Math.round(tbtSum / metricsCount) : 0,
        pagesAudited: raw.results.length,
        timestamp: raw.timestamp ?? '',
        durationSeconds: raw.durationSeconds ?? 0,
    };
}

// ---------------------------------------------------------------------------
// R2 Summary — local assets scan + optional R2 bucket scan
// ---------------------------------------------------------------------------

async function gatherR2Summary(): Promise<R2Summary | null> {
    // Local stats — always available
    const localStats = { totalFiles: 0, totalSize: 0, categories: {} as Record<string, CategoryStats> };
    const defaultCategories = ['blog', 'voyages', 'astrophotographies'];
    for (const c of defaultCategories) localStats.categories[c] = { files: 0, size: 0 };

    if (await fileExists(ASSETS_DIR)) {
        async function scan(dirPath: string) {
            const files = await fs.readdir(dirPath);
            for (const file of files) {
                if (file.startsWith('.') || file === '.DS_Store') continue;
                const fullPath = path.join(dirPath, file);
                const stat = await fs.stat(fullPath);
                if (stat.isDirectory()) {
                    const rel = path.relative(ASSETS_DIR, fullPath);
                    if (LOCAL_ONLY_DIRS.includes(rel)) continue;
                    await scan(fullPath);
                } else {
                    const relPath = path.relative(ASSETS_DIR, fullPath);
                    const firstSeg = relPath.split(path.sep)[0];
                    localStats.totalFiles++;
                    localStats.totalSize += stat.size;
                    if (localStats.categories[firstSeg]) {
                        localStats.categories[firstSeg].files++;
                        localStats.categories[firstSeg].size += stat.size;
                    } else if (firstSeg && !LOCAL_ONLY_DIRS.includes(firstSeg)) {
                        localStats.categories[firstSeg] = { files: 1, size: stat.size };
                    }
                }
            }
        }
        await scan(ASSETS_DIR);
    }

    // R2 stats — only if credentials are configured
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const bucketName = process.env.R2_BUCKET_NAME ?? '';

    if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
        // Return local-only stats with empty R2 section
        return {
            local: localStats,
            r2: { totalFiles: 0, totalSize: 0, categories: {} },
        };
    }

    try {
        const { S3Client, ListObjectsV2Command } = await import('@aws-sdk/client-s3');
        const s3 = new S3Client({
            region: 'auto',
            endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
            credentials: { accessKeyId, secretAccessKey },
        });

        const r2Stats = { totalFiles: 0, totalSize: 0, categories: {} as Record<string, CategoryStats> };
        for (const c of defaultCategories) r2Stats.categories[c] = { files: 0, size: 0 };

        let continuationToken: string | undefined;
        while (true) {
            const cmd = new ListObjectsV2Command({
                Bucket: bucketName,
                ContinuationToken: continuationToken,
            });
            const listed = await s3.send(cmd);
            if (!listed.Contents?.length) break;
            for (const obj of listed.Contents) {
                const key = obj.Key;
                if (!key || key.endsWith('/')) continue;
                const firstSeg = key.split('/')[0];
                if (LOCAL_ONLY_DIRS.includes(firstSeg)) continue;
                const size = obj.Size ?? 0;
                r2Stats.totalFiles++;
                r2Stats.totalSize += size;
                if (r2Stats.categories[firstSeg]) {
                    r2Stats.categories[firstSeg].files++;
                    r2Stats.categories[firstSeg].size += size;
                } else if (firstSeg) {
                    r2Stats.categories[firstSeg] = { files: 1, size };
                }
            }
            if (!listed.IsTruncated) break;
            continuationToken = listed.NextContinuationToken;
        }

        return { local: localStats, r2: r2Stats };
    } catch (e) {
        console.error('R2 scan failed (dashboard will show local-only):', e);
        return {
            local: localStats,
            r2: { totalFiles: 0, totalSize: 0, categories: {} },
        };
    }
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export const GET: APIRoute = async ({ locals }) => {
    const blocked = requireAdmin(locals);
    if (blocked) return blocked;

    const [posts, voyages, astrophotos, seo, lighthouse, r2] = await Promise.all([
        listPosts().catch(() => []),
        listVoyages().catch(() => []),
        countAstrophotos().catch(() => ({ total: 0, withRaw: 0, withMini: 0 })),
        gatherSeoSummary().catch(() => null),
        gatherLighthouseSummary().catch(() => null),
        gatherR2Summary().catch(() => null),
    ]);

    const recentBlog = await Promise.all(
        posts.map(async (p) => {
            const mtime = await mtimeOf(path.join(BLOG_ROOT, p.year, `${p.slug}.md`));
            const item: RecentItem = {
                kind: 'blog',
                year: p.year,
                slug: p.slug,
                title: p.title || p.slug,
                href: `/blog/${p.slug}`,
                editHref: `/admin/blog?year=${p.year}&slug=${p.slug}`,
                date: p.date,
                image: p.image,
                mtimeMs: mtime,
            };
            return item;
        }),
    );

    const recentVoyages = await Promise.all(
        voyages.map(async (v) => {
            const mtime = await mtimeOf(path.join(VOY_ROOT, v.year, `${v.slug}.md`));
            const item: RecentItem = {
                kind: 'voyage',
                year: v.year,
                slug: v.slug,
                title: v.title || v.slug,
                href: `/voyages/${v.year}/${v.slug}`,
                editHref: `/admin/voyages?year=${v.year}&slug=${v.slug}`,
                image: v.image,
                mtimeMs: mtime,
            };
            return item;
        }),
    );

    const recent = [...recentBlog, ...recentVoyages].sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, 6);

    const stats: DashboardStats = {
        counts: {
            blog: posts.length,
            voyages: voyages.length,
            astrophotos,
        },
        recent,
        seo,
        lighthouse,
        r2,
        lastUpdatedAt: new Date().toISOString(),
    };

    return jsonResponse(stats);
};
