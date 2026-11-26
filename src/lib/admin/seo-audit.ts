/**
 * Audit SEO du site pour l'admin : couverture des descriptions (`src/data/seo.json`, frontmatter du blog), des
 * alts des astrophotos (`src/data/alt.json`) et contrôles techniques (astro-seo, sitemap, robots.txt, prefetch,
 * données structurées).
 *
 * Lecture par un `ContentReader` : disque en `npm run dev`, branche dev (API GitHub) sur l'admin distant. Le
 * sitemap généré (`dist/`) n'existe que sur le disque : à distance, il apparaît non généré.
 */
import Papa from 'papaparse';
import { createUniqueHeaderTransform } from './shared';
import type { ContentReader } from './stores/content-reader';
import { slugify } from '@/utils/normalize';

export interface AuditedItem {
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

/** Fichier Markdown d'une section, rangé sous une année (`yearDir`) ou à plat (`null`). */
interface ContentFile {
    yearDir: string | null;
    name: string;
    content: string;
}

const MARKDOWN_RE = /\.(md|mdx)$/;

async function readJson(reader: ContentReader, relativePath: string): Promise<Record<string, string>> {
    const raw = await reader.readText(relativePath);
    // POURQUOI : un JSON corrompu doit faire échouer l'audit (500), pas passer pour un fichier vide.
    return raw === null ? {} : (JSON.parse(raw) as Record<string, string>);
}

async function readTextOrEmpty(reader: ContentReader, relativePath: string): Promise<string> {
    return (await reader.readText(relativePath)) ?? '';
}

async function exists(reader: ContentReader, relativePath: string): Promise<boolean> {
    return (await reader.readText(relativePath)) !== null;
}

/**
 * Liste les fichiers Markdown d'une section : à plat et dans les dossiers d'année.
 *
 * @param reader - Source des fichiers.
 * @param root - Racine de la section (`src/content/voyages`).
 * @returns Les fichiers `.md` et `.mdx`, avec leur contenu.
 */
async function listContentFiles(reader: ContentReader, root: string): Promise<ContentFile[]> {
    const entries = await reader.listDir(root);
    if (!entries) return [];
    const files: ContentFile[] = [];
    for (const entry of entries) {
        if (entry.type === 'file') {
            if (!MARKDOWN_RE.test(entry.name)) continue;
            const content = await reader.readText(`${root}/${entry.name}`, entry.sha);
            if (content !== null) files.push({ yearDir: null, name: entry.name, content });
            continue;
        }
        const yearEntries = (await reader.listDir(`${root}/${entry.name}`)) ?? [];
        const contents = await Promise.all(
            yearEntries
                .filter((child) => child.type === 'file' && MARKDOWN_RE.test(child.name))
                .map(async (child) => ({
                    name: child.name,
                    content: await reader.readText(`${root}/${entry.name}/${child.name}`, child.sha),
                })),
        );
        for (const { name, content } of contents) {
            if (content !== null) files.push({ yearDir: entry.name, name, content });
        }
    }
    return files;
}

/**
 * Lance l'audit SEO.
 *
 * @param reader - Source des fichiers, enracinée au dépôt.
 * @returns Le bilan : score, contrôles techniques et éléments audités (pages, voyages, articles, astrophotos).
 * @throws Error si `seo.json` ou `alt.json` est illisible.
 */
export async function runSeoAudit(reader: ContentReader) {
    // 1. Chargement des référentiels centraux de métadonnées
    const seoData = await readJson(reader, 'src/data/seo.json');
    const altData = await readJson(reader, 'src/data/alt.json');

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
    for (const file of await listContentFiles(reader, 'src/content/voyages')) {
        const slug = file.name.replace(MARKDOWN_RE, '');
        const titleMatch = file.content.match(/title:\s*["']?([^"\n\r]+)["']?/);
        const title = titleMatch ? titleMatch[1] : slug;
        // POURQUOI : un récit rangé à plat porte son année dans le frontmatter (2025 par défaut).
        const yearMatch = file.yearDir === null ? file.content.match(/year:\s*(\d+)/) : null;
        const year = file.yearDir ?? (yearMatch ? yearMatch[1] : '2025');
        const fullSlug = `${year}/${slug}`;
        const desc = seoData[`voyages/${fullSlug}`] || '';
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

    // 4. Audit des Articles de Blog
    for (const file of await listContentFiles(reader, 'src/content/blog')) {
        const slug = file.name.replace(MARKDOWN_RE, '');
        const titleMatch = file.content.match(/title:\s*["']?([^"\n\r]+)["']?/);
        const dateMatch = file.content.match(/date:\s*["']?(\d{4})/);
        const title = titleMatch ? titleMatch[1] : slug;
        // POURQUOI : l'URL suit l'année de la date ; sans date, celle du dossier (2026 pour un article à plat).
        const year = dateMatch ? dateMatch[1] : (file.yearDir ?? '2026');
        const descMatch = file.content.match(/description:\s*["']?([^"\r\n]+)["']?/);
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

    // 5. Audit des Astrophotographies (CSV)
    let totalPhotos = 0;
    let missingPhotoAlts = 0;
    const csvContent = await reader.readText('data/astrobin_clodoweg_gallery_python.csv');
    if (csvContent !== null) {
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
    const layoutContent = await readTextOrEmpty(reader, 'src/layouts/BaseLayout.astro');
    const astroSeoImplemented =
        layoutContent.includes('import { SEO } from "astro-seo"') && layoutContent.includes('<SEO');

    const configContent = await readTextOrEmpty(reader, 'astro.config.mjs');
    const sitemapConfigured = configContent.includes('@astrojs/sitemap') || configContent.includes('sitemap()');
    const sitemapGenerated =
        (await exists(reader, 'dist/sitemap-index.xml')) || (await exists(reader, 'public/sitemap-index.xml'));

    const robotsTxtRaw = await reader.readText('public/robots.txt');
    const robotsTxtExists = robotsTxtRaw !== null;
    const robotsTxtContent = robotsTxtRaw ?? '';
    const robotsTxtValid =
        robotsTxtExists && robotsTxtContent.includes('Sitemap:') && robotsTxtContent.includes('User-agent:');

    const prefetchingEnabled = configContent.includes('prefetch');

    // POURQUOI : les données structurées (JSON-LD) vivent dans le layout global et dans les pages de détail.
    const filesToCheck = [
        'src/layouts/BaseLayout.astro',
        'src/pages/index.astro',
        'src/pages/astrophotographies/[slug].astro',
        'src/pages/blog/[...slug].astro',
        'src/pages/videos/[...slug].astro',
        'src/components/astrophotography/TechnicalDetails.astro',
    ];
    const structuredDataFilesCount = (
        await Promise.all(filesToCheck.map((file) => readTextOrEmpty(reader, file)))
    ).filter((fileContent) => fileContent.includes('ld+json')).length;

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

    return {
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
    };
}
