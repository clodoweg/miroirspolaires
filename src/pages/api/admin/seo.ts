/**
 * @file src/pages/api/admin/seo.ts
 * @description Point d'entrée de l'API d'administration pour l'audit de référencement (SEO).
 * Responsabilité : Scanner dynamiquement le site (pages statiques, photos CSV, articles Markdown),
 * analyser la couverture des descriptions dans seo.json, des textes alternatifs dans alt.json,
 * et renvoyer un bilan complet pour alimenter le Dashboard SEO interactif.
 */

import type { APIRoute } from 'astro';
import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import { createUniqueHeaderTransform, requireAdmin, jsonResponse } from '@/lib/admin/shared';
import { slugify } from '@/utils/normalize';

export const prerender = false;

interface AuditedItem {
    id: string;
    type: 'page' | 'astrophoto' | 'voyage' | 'blog';
    name: string;
    path: string;
    hasDescription: boolean;
    description: string;
    descriptionLength: number;
    hasAltText?: boolean;
    altText?: string;
}

export const GET: APIRoute = async ({ locals }) => {
    const blocked = requireAdmin(locals);
    if (blocked) return blocked;

    try {
        const ROOT = process.cwd();
        const SEO_PATH = path.join(ROOT, 'src/data/seo.json');
        const ALT_JSON_PATH = path.join(ROOT, 'src/data/alt.json');
        const ASTRO_CSV_PATH = path.join(ROOT, 'data/astrobin_clodoweg_gallery_python.csv');
        const VOYAGES_DIR = path.join(ROOT, 'src/content/voyages');
        const BLOG_DIR = path.join(ROOT, 'src/content/blog');
        const LAYOUT_PATH = path.join(ROOT, 'src/layouts/BaseLayout.astro');
        const ASTRO_CONFIG_PATH = path.join(ROOT, 'astro.config.mjs');
        const ROBOTS_PATH = path.join(ROOT, 'public/robots.txt');

        // 1. Chargement des référentiels centraux de métadonnées
        const seoData: Record<string, string> = fs.existsSync(SEO_PATH)
            ? JSON.parse(fs.readFileSync(SEO_PATH, 'utf8'))
            : {};
        const altData: Record<string, string> = fs.existsSync(ALT_JSON_PATH)
            ? JSON.parse(fs.readFileSync(ALT_JSON_PATH, 'utf8'))
            : {};

        const auditedItems: AuditedItem[] = [];

        // 2. Audit des Pages Statiques Principales
        const staticPages = [
            { id: 'index', name: 'Accueil', path: '/', key: 'index' },
            {
                id: 'astrophographies/index',
                name: 'Galerie Astrophotographies',
                path: '/astrophotographies',
                key: 'astrophotographies/index',
            },
            { id: 'voyages/index', name: 'Index Voyages', path: '/voyages', key: 'voyages/index' },
            { id: 'blog/index', name: 'Index Blog', path: '/blog', key: 'blog/index' },
            { id: 'videos/index', name: 'Index Vidéos', path: '/videos', key: 'videos/index' },
            { id: 'a-propos', name: 'À Propos', path: '/a-propos', key: 'a-propos' },
            { id: 'observatoires', name: 'Observatoires', path: '/observatoires', key: 'observatoires' },
            { id: 'statistiques', name: 'Statistiques Globales', path: '/statistiques', key: 'statistiques' },
        ];

        staticPages.forEach((p) => {
            const desc = seoData[p.key] || '';
            auditedItems.push({
                id: p.id,
                type: 'page',
                name: p.name,
                path: p.path,
                hasDescription: !!desc,
                description: desc,
                descriptionLength: desc.length,
            });
        });

        // 3. Audit des Récits de Voyages
        if (fs.existsSync(VOYAGES_DIR)) {
            const yearDirs = fs.readdirSync(VOYAGES_DIR);
            yearDirs.forEach((yearDir) => {
                const yearPath = path.join(VOYAGES_DIR, yearDir);
                const stat = fs.statSync(yearPath);
                if (!stat.isDirectory()) {
                    if (yearDir.endsWith('.md') || yearDir.endsWith('.mdx')) {
                        const slug = yearDir.replace(/\.(md|mdx)$/, '');
                        const content = fs.readFileSync(yearPath, 'utf8');
                        const yearMatch = content.match(/year:\s*(\d+)/);
                        const titleMatch = content.match(/title:\s*["']?([^"\n\r]+)["']?/);
                        const year = yearMatch ? yearMatch[1] : '2025';
                        const title = titleMatch ? titleMatch[1] : slug;
                        const fullSlug = `${year}/${slug}`;
                        const key = `voyages/${fullSlug}`;
                        const desc = seoData[key] || '';
                        auditedItems.push({
                            id: slug,
                            type: 'voyage',
                            name: `Voyage : ${title}`,
                            path: `/voyages/${fullSlug}`,
                            hasDescription: !!desc,
                            description: desc,
                            descriptionLength: desc.length,
                        });
                    }
                    return;
                }
                const files = fs.readdirSync(yearPath);
                files.forEach((f) => {
                    if (!f.endsWith('.md') && !f.endsWith('.mdx')) return;
                    const slug = f.replace(/\.(md|mdx)$/, '');
                    const content = fs.readFileSync(path.join(yearPath, f), 'utf8');
                    const titleMatch = content.match(/title:\s*["']?([^"\n\r]+)["']?/);
                    const title = titleMatch ? titleMatch[1] : slug;
                    const fullSlug = `${yearDir}/${slug}`;
                    const key = `voyages/${fullSlug}`;
                    const desc = seoData[key] || '';
                    auditedItems.push({
                        id: slug,
                        type: 'voyage',
                        name: `Voyage : ${title}`,
                        path: `/voyages/${fullSlug}`,
                        hasDescription: !!desc,
                        description: desc,
                        descriptionLength: desc.length,
                    });
                });
            });
        }

        // 4. Audit des Articles de Blog
        if (fs.existsSync(BLOG_DIR)) {
            const yearDirs = fs.readdirSync(BLOG_DIR);
            yearDirs.forEach((yearDir) => {
                const yearPath = path.join(BLOG_DIR, yearDir);
                const stat = fs.statSync(yearPath);
                if (!stat.isDirectory()) {
                    if (yearDir.endsWith('.md') || yearDir.endsWith('.mdx')) {
                        const slug = yearDir.replace(/\.(md|mdx)$/, '');
                        const content = fs.readFileSync(yearPath, 'utf8');
                        const titleMatch = content.match(/title:\s*["']?([^"\n\r]+)["']?/);
                        const dateMatch = content.match(/date:\s*["']?(\d{4})/);
                        const title = titleMatch ? titleMatch[1] : slug;
                        const year = dateMatch ? dateMatch[1] : '2026';
                        const descMatch = content.match(/description:\s*["']?([^"\r\n]+)["']?/);
                        const desc = descMatch ? descMatch[1] : '';
                        auditedItems.push({
                            id: slug,
                            type: 'blog',
                            name: `Blog : ${title}`,
                            path: `/blog/${year}/${slug}`,
                            hasDescription: !!desc,
                            description: desc,
                            descriptionLength: desc.length,
                        });
                    }
                    return;
                }
                const files = fs.readdirSync(yearPath);
                files.forEach((f) => {
                    if (!f.endsWith('.md') && !f.endsWith('.mdx')) return;
                    const slug = f.replace(/\.(md|mdx)$/, '');
                    const content = fs.readFileSync(path.join(yearPath, f), 'utf8');
                    const titleMatch = content.match(/title:\s*["']?([^"\n\r]+)["']?/);
                    const dateMatch = content.match(/date:\s*["']?(\d{4})/);
                    const title = titleMatch ? titleMatch[1] : slug;
                    const year = dateMatch ? dateMatch[1] : yearDir;
                    const descMatch = content.match(/description:\s*["']?([^"\r\n]+)["']?/);
                    const desc = descMatch ? descMatch[1] : '';
                    auditedItems.push({
                        id: slug,
                        type: 'blog',
                        name: `Blog : ${title}`,
                        path: `/blog/${year}/${slug}`,
                        hasDescription: !!desc,
                        description: desc,
                        descriptionLength: desc.length,
                    });
                });
            });
        }

        // 5. Audit des Astrophotographies (CSV)
        let totalPhotos = 0;
        let missingPhotoAlts = 0;
        if (fs.existsSync(ASTRO_CSV_PATH)) {
            const csvContent = fs.readFileSync(ASTRO_CSV_PATH, 'utf8');
            const { data: photos } = Papa.parse(csvContent, {
                header: true,
                dynamicTyping: true,
                skipEmptyLines: true,
                transformHeader: createUniqueHeaderTransform(),
            });

            photos.forEach((photo: any) => {
                if (!photo.ID || !photo.Title) return;
                totalPhotos++;
                const slug = `${slugify(photo.Title)}-${photo.ID}`;
                const key = `astrophotographies/${slug}`;

                const desc = seoData[key] || '';

                // POURQUOI : Les clés de textes alternatifs stockées dans alt.json suivent l'arborescence physique réelle
                // du dossier d'assets : "/assets/astrophotographies/<ANNÉE>/<ID>_raw.jpg".
                // Exemple : "/assets/astrophotographies/2015/150785_raw.jpg"
                // Nous extrayons donc l'année de photo.Uploaded (format "YYYY-MM-DD...") pour faire correspondre la clé.
                const uploadYearMatch = photo.Uploaded ? String(photo.Uploaded).match(/(\d{4})/) : null;
                const uploadYear = uploadYearMatch ? uploadYearMatch[1] : '2025';
                const altKey = `/assets/astrophotographies/${uploadYear}/${photo.ID}_raw.jpg`;
                const altText = altData[altKey] || '';
                const hasAlt = !!altText;

                if (!hasAlt) missingPhotoAlts++;

                auditedItems.push({
                    id: String(photo.ID),
                    type: 'astrophoto',
                    name: `Photo : ${photo.Title}`,
                    path: `/astrophotographies/${slug}`,
                    hasDescription: !!desc,
                    description: desc,
                    descriptionLength: desc.length,
                    hasAltText: hasAlt,
                    altText: altText,
                });
            });
        }

        // 6. Validation Technique des fichiers SEO de base
        const layoutContent = fs.existsSync(LAYOUT_PATH) ? fs.readFileSync(LAYOUT_PATH, 'utf8') : '';
        const astroSeoImplemented =
            layoutContent.includes('import { SEO } from "astro-seo"') && layoutContent.includes('<SEO');

        const configContent = fs.existsSync(ASTRO_CONFIG_PATH) ? fs.readFileSync(ASTRO_CONFIG_PATH, 'utf8') : '';
        const sitemapConfigured = configContent.includes('@astrojs/sitemap') || configContent.includes('sitemap()');
        const sitemapGenerated =
            fs.existsSync(path.join(ROOT, 'dist/sitemap-index.xml')) ||
            fs.existsSync(path.join(ROOT, 'public/sitemap-index.xml'));

        const robotsTxtExists = fs.existsSync(ROBOTS_PATH);
        const robotsTxtContent = robotsTxtExists ? fs.readFileSync(ROBOTS_PATH, 'utf8') : '';
        const robotsTxtValid =
            robotsTxtExists && robotsTxtContent.includes('Sitemap:') && robotsTxtContent.includes('User-agent:');

        const prefetchingEnabled = configContent.includes('prefetch');

        // POURQUOI : Les données structurées (Schema.org / JSON-LD) sont implémentées à la fois dans le layout
        // global et dans les pages spécifiques (page d'accueil, galeries, blog, vidéos) pour maximiser le SEO riche.
        // Exemple de détection sur : src/pages/index.astro, src/pages/astrophotographies/[slug].astro, etc.
        let structuredDataFilesCount = 0;
        const filesToCheck = [
            path.join(ROOT, 'src/layouts/BaseLayout.astro'),
            path.join(ROOT, 'src/pages/index.astro'),
            path.join(ROOT, 'src/pages/astrophotographies/[slug].astro'),
            path.join(ROOT, 'src/pages/blog/[...slug].astro'),
            path.join(ROOT, 'src/pages/videos/[...slug].astro'),
            path.join(ROOT, 'src/components/astrophotography/TechnicalDetails.astro'),
        ];

        filesToCheck.forEach((filePath) => {
            if (fs.existsSync(filePath)) {
                const fileContent = fs.readFileSync(filePath, 'utf8');
                if (fileContent.includes('ld+json')) {
                    structuredDataFilesCount++;
                }
            }
        });

        // 7. Calculs statistiques
        const missingDescriptions = auditedItems.filter((item) => !item.hasDescription).length;

        // Bilan des scores techniques (sur 50 points) + métadonnées (sur 50 points)
        let techScore = 0;
        if (astroSeoImplemented) techScore += 10;
        if (sitemapConfigured) techScore += 10;
        if (robotsTxtValid) techScore += 10;
        if (prefetchingEnabled) techScore += 10;
        if (structuredDataFilesCount > 0) techScore += 10;

        const totalItems = auditedItems.length;
        const descCoverage = totalItems > 0 ? ((totalItems - missingDescriptions) / totalItems) * 50 : 50;

        const finalScore = Math.round(techScore + descCoverage);

        return jsonResponse(
            {
                summary: {
                    score: finalScore,
                    totalAuditedItems: totalItems,
                    missingDescriptionsCount: missingDescriptions,
                    missingAltsCount: missingPhotoAlts,
                    totalPhotos,
                    technicalStatus: {
                        astroSeoImplemented,
                        sitemapConfigured,
                        sitemapGenerated,
                        robotsTxtValid,
                        prefetchingEnabled,
                        structuredDataFilesCount,
                    },
                },
                technicalChecks: [
                    {
                        name: 'Intégration de astro-seo',
                        status: astroSeoImplemented ? 'ok' : 'error',
                        message: astroSeoImplemented
                            ? 'Le package astro-seo est correctement configuré et actif sur le layout principal.'
                            : "Le layout principal BaseLayout.astro n'importe pas ou n'utilise pas le tag <SEO />.",
                    },
                    {
                        name: 'Génération du Sitemap',
                        status: sitemapConfigured ? 'ok' : 'error',
                        message: sitemapConfigured
                            ? "L'intégration sitemap est active dans astro.config.mjs et le fichier sitemap-index.xml est prêt."
                            : "L'intégration @astrojs/sitemap est manquante de la configuration Astro.",
                    },
                    {
                        name: 'Fichier de règles robots.txt',
                        status: robotsTxtValid ? 'ok' : 'warning',
                        message: robotsTxtValid
                            ? "robots.txt est présent à la racine publique et référence proprement l'adresse du Sitemap."
                            : robotsTxtExists
                              ? 'robots.txt existe mais ne référence pas le Sitemap index ou manque de User-agents.'
                              : 'Fichier robots.txt manquant dans le dossier public/.',
                    },
                    {
                        name: 'Configuration de Prefetching',
                        status: prefetchingEnabled ? 'ok' : 'warning',
                        message: prefetchingEnabled
                            ? 'Le prefetching natif est activé dans la configuration pour accélérer la navigation entre pages.'
                            : "Le prefetching de liens n'est pas activé dans astro.config.mjs.",
                    },
                    {
                        name: 'Structured Data (Schema.org)',
                        status: structuredDataFilesCount > 0 ? 'ok' : 'warning',
                        message:
                            structuredDataFilesCount > 0
                                ? `JSON-LD structuré détecté dans ${structuredDataFilesCount} composants (pages, fiche technique).`
                                : "Aucun composant n'embarque de balise de données structurées (ld+json) pour enrichir les résultats de recherche.",
                    },
                ],
                items: auditedItems,
            },
            200,
            { 'Cache-Control': 'no-store' },
        );
    } catch (err) {
        return jsonResponse({ error: (err as Error).message }, 500);
    }
};
