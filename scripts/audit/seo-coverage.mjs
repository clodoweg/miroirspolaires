/**
 * Audit de couverture SEO du projet Astro
 *
 * Responsabilité principale (8 contrôles, résumé « n/8 checks passed ») :
 * - Descriptions SEO : chaque astrophoto du CSV (`astrophotographies/<slug>-<ID>`), chaque voyage et
 *   `blog/index` doivent avoir une entrée dans src/data/seo.json (les articles de blog ne sont pas
 *   vérifiés : leur description est dans le Markdown).
 * - Intégration d'astro-seo dans src/layouts/BaseLayout.astro.
 * - Sitemap configuré dans astro.config.mjs et public/robots.txt présent.
 * - Textes alternatifs : toutes les entrées de src/data/alt.json doivent être non vides.
 * - Données structurées (JSON-LD) dans les composants .astro, balises meta des pages principales et
 *   configuration du prefetch.
 *
 * Effet distant : aucun. Lecture seule de fichiers locaux, aucune écriture.
 *
 * Options disponibles :
 *   Aucune. Tout argument est ignoré.
 *
 * Code de sortie : toujours 0, même si des contrôles échouent (rapport à lire dans la console).
 *
 * Exemples d'utilisation :
 *   node scripts/audit/seo-coverage.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import glob from 'fast-glob';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '../..');

// Paths
const SEO_PATH = path.join(ROOT, 'src/data/seo.json');
const ASTRO_CSV_PATH = path.join(ROOT, 'data/astrobin_clodoweg_gallery_python.csv');
const VOYAGES_DIR = path.join(ROOT, 'src/content/voyages');
const LAYOUT_PATH = path.join(ROOT, 'src/layouts/BaseLayout.astro');
const ASTRO_CONFIG_PATH = path.join(ROOT, 'astro.config.mjs');
const ROBOTS_PATH = path.join(ROOT, 'public/robots.txt');
const ALT_JSON_PATH = path.join(ROOT, 'src/data/alt.json');

// Terminal color codes for reporting
const COLOR_RED = '\x1b[31m';
const COLOR_GREEN = '\x1b[32m';
const COLOR_YELLOW = '\x1b[33m';
const COLOR_BLUE = '\x1b[34m';
const COLOR_RESET = '\x1b[0m';
const STYLE_BOLD = '\x1b[1m';

/**
 * Transforms a string into a URL-friendly slug.
 *
 * @param {string} title - The input string.
 * @returns {string} The slugified string.
 */
function generateSlug(title) {
    return title
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
}

/**
 * Prints a section header to the console.
 * @param {string} title
 */
function printSection(title) {
    console.log(`\n${STYLE_BOLD}${COLOR_BLUE}═══ ${title} ═══${COLOR_RESET}`);
}

/**
 * Prints a success message.
 * @param {string} msg
 */
function printOk(msg) {
    console.log(`  ${COLOR_GREEN}✓${COLOR_RESET} ${msg}`);
}

/**
 * Prints a warning message.
 * @param {string} msg
 */
function printWarning(msg) {
    console.log(`  ${COLOR_YELLOW}⚠${COLOR_RESET} ${msg}`);
}

/**
 * Prints an error message.
 * @param {string} msg
 */
function printError(msg) {
    console.log(`  ${COLOR_RED}✗${COLOR_RESET} ${msg}`);
}

/**
 * Audits the coverage of SEO descriptions across the site.
 *
 * @returns {Promise<{total: number, missing: number}>} Coverage statistics.
 */
async function checkSeoDescriptions() {
    printSection('1. SEO Descriptions Coverage');

    if (!fs.existsSync(SEO_PATH)) {
        printError('seo.json not found!');
        return { total: 0, missing: 0 };
    }

    const seoData = JSON.parse(fs.readFileSync(SEO_PATH, 'utf8'));
    const existingKeys = new Set(Object.keys(seoData));
    const missing = { astrophotographies: [], voyages: [], blog: [] };

    // Check Astrophotographies
    if (fs.existsSync(ASTRO_CSV_PATH)) {
        const csvContent = fs.readFileSync(ASTRO_CSV_PATH, 'utf8');
        const { data: photos } = Papa.parse(csvContent, {
            header: true,
            dynamicTyping: true,
            skipEmptyLines: true,
        });

        photos.forEach((photo) => {
            if (!photo.ID || !photo.Title) return;
            const slug = `${generateSlug(photo.Title)}-${photo.ID}`;
            const key = `astrophotographies/${slug}`;
            if (!existingKeys.has(key)) {
                missing.astrophotographies.push(key);
            }
        });
    }

    /**
     * Recursively scans a content collection directory for missing SEO keys.
     *
     * @param {string} dir - Directory to scan.
     * @param {string} collectionName - Name of the collection for key prefixing.
     * @returns {string[]} List of missing SEO keys.
     */
    function scanCollection(dir, collectionName) {
        const items = [];
        if (!fs.existsSync(dir)) return items;

        function scan(directory) {
            const files = fs.readdirSync(directory);
            files.forEach((file) => {
                const fullPath = path.join(directory, file);
                const stat = fs.statSync(fullPath);
                if (stat.isDirectory()) {
                    scan(fullPath);
                } else if (file.endsWith('.md') || file.endsWith('.mdx')) {
                    let relativePath = path.relative(dir, fullPath);
                    let slug = relativePath.replace(/\.(md|mdx)$/, '').replace(/\\/g, '/');
                    const key = `${collectionName}/${slug}`;
                    if (!existingKeys.has(key)) {
                        items.push(key);
                    }
                }
            });
        }
        scan(dir);
        return items;
    }

    missing.voyages = scanCollection(VOYAGES_DIR, 'voyages');
    // We no longer check individual blog entries in seo.json because they are handled in Markdown
    // but we can still check if blog/index is present.
    if (!existingKeys.has('blog/index')) {
        missing.blog.push('blog/index');
    }

    const totalMissing = missing.astrophotographies.length + missing.voyages.length + missing.blog.length;

    if (totalMissing === 0) {
        printOk(`All pages have SEO descriptions (${existingKeys.size} entries)`);
    } else {
        printWarning(`${totalMissing} pages missing descriptions:`);
        if (missing.astrophotographies.length > 0) {
            console.log(`    - Astrophotographies: ${missing.astrophotographies.length}`);
        }
        if (missing.voyages.length > 0) {
            console.log(`    - Voyages: ${missing.voyages.length}`);
        }
        if (missing.blog.length > 0) {
            console.log(`    - Blog: ${missing.blog.length}`);
        }
    }

    return { total: existingKeys.size, missing: totalMissing };
}

/**
 * Verifies the technical implementation of the astro-seo component in layouts.
 *
 * @returns {Promise<boolean>} True if implementation is complete.
 */
async function checkAstroSeoImplementation() {
    printSection('2. astro-seo Implementation');

    if (!fs.existsSync(LAYOUT_PATH)) {
        printError('BaseLayout.astro not found!');
        return false;
    }

    const layoutContent = fs.readFileSync(LAYOUT_PATH, 'utf8');
    const checks = {
        seoImport: layoutContent.includes('import { SEO } from "astro-seo"'),
        seoComponent: layoutContent.includes('<SEO'),
        title: /title[=:]/.test(layoutContent),
        description: /description[=:]/.test(layoutContent),
        openGraph: layoutContent.includes('openGraph'),
        twitter: layoutContent.includes('twitter'),
        canonical: layoutContent.includes('canonical'),
    };

    if (checks.seoImport) printOk('astro-seo package imported');
    else printError('astro-seo not imported');

    if (checks.seoComponent) printOk('<SEO /> component used');
    else printError('<SEO /> component not found');

    if (checks.title && checks.description) printOk('Title and description props configured');
    else printWarning('Title or description may be missing');

    if (checks.openGraph) printOk('Open Graph tags configured');
    else printWarning('Open Graph tags not configured');

    if (checks.twitter) printOk('Twitter card configured');
    else printWarning('Twitter card not configured');

    if (checks.canonical) printOk('Canonical URL configured');
    else printWarning('Canonical URL not found');

    return Object.values(checks).every(Boolean);
}

/**
 * Checks for sitemap configuration and generation.
 *
 * @returns {Promise<boolean>} True if sitemap is correctly configured.
 */
async function checkSitemap() {
    printSection('3. Sitemap Configuration');

    if (!fs.existsSync(ASTRO_CONFIG_PATH)) {
        printError('astro.config.mjs not found!');
        return false;
    }

    const configContent = fs.readFileSync(ASTRO_CONFIG_PATH, 'utf8');

    const hasSitemap = configContent.includes('@astrojs/sitemap') || configContent.includes('sitemap()');
    const hasSite = configContent.includes('site:');

    if (hasSitemap) printOk('@astrojs/sitemap integration found');
    else printError('Sitemap integration not found');

    if (hasSite) printOk('Site URL configured');
    else printError('Site URL not configured (required for sitemap)');

    // Check if sitemap exists in dist
    const sitemapPath = path.join(ROOT, 'dist/sitemap-index.xml');
    if (fs.existsSync(sitemapPath)) {
        printOk('sitemap-index.xml generated in dist/');
    } else {
        printWarning('sitemap-index.xml not found in dist/ (run build first)');
    }

    return hasSitemap && hasSite;
}

/**
 * Audits the robots.txt file for essential SEO directives.
 *
 * @returns {Promise<boolean>} True if robots.txt exists and is valid.
 */
async function checkRobotsTxt() {
    printSection('4. robots.txt');

    if (fs.existsSync(ROBOTS_PATH)) {
        const content = fs.readFileSync(ROBOTS_PATH, 'utf8');
        printOk('robots.txt exists');

        if (content.includes('Sitemap:')) {
            printOk('Sitemap reference found in robots.txt');
        } else {
            printWarning('No Sitemap reference in robots.txt');
        }

        if (content.includes('User-agent:')) {
            printOk('User-agent rules defined');
        }

        return true;
    } else {
        printWarning('robots.txt not found in public/');
        return false;
    }
}

/**
 * Audits the centralized image alternative text data.
 *
 * @returns {Promise<{total: number, defined: number}>} Alt text statistics.
 */
async function checkImageAltTexts() {
    printSection('5. Image Alt Texts');

    if (!fs.existsSync(ALT_JSON_PATH)) {
        printWarning('alt.json not found - alt texts may not be centralized');
        return { total: 0, defined: 0 };
    }

    const altData = JSON.parse(fs.readFileSync(ALT_JSON_PATH, 'utf8'));
    const totalAlts = Object.keys(altData).length;
    const emptyAlts = Object.values(altData).filter((v) => !v || v.trim() === '').length;

    if (emptyAlts === 0) {
        printOk(`All ${totalAlts} images have alt texts defined`);
    } else {
        printWarning(`${emptyAlts}/${totalAlts} images have empty alt texts`);
    }

    return { total: totalAlts, defined: totalAlts - emptyAlts };
}

/**
 * Searches for Schema.org JSON-LD structured data in Astro components.
 *
 * @returns {Promise<boolean>} True if structured data is found.
 */
async function checkStructuredData() {
    printSection('6. Structured Data (Schema.org)');

    // Check for any JSON-LD structured data in components
    const componentFiles = await glob('src/**/*.astro', { cwd: ROOT });
    let hasStructuredData = false;
    let structuredDataLocations = [];

    for (const file of componentFiles) {
        const content = fs.readFileSync(path.join(ROOT, file), 'utf8');
        if (content.includes('application/ld+json') || content.includes('@type') || content.includes('schema.org')) {
            hasStructuredData = true;
            structuredDataLocations.push(file);
        }
    }

    if (hasStructuredData) {
        printOk(`Structured data found in ${structuredDataLocations.length} file(s)`);
        structuredDataLocations.slice(0, 3).forEach((f) => console.log(`    - ${f}`));
        if (structuredDataLocations.length > 3) {
            console.log(`    ... and ${structuredDataLocations.length - 3} more`);
        }
    } else {
        printWarning('No structured data (JSON-LD) found');
        console.log('    Consider adding Schema.org markup for better SEO');
    }

    return hasStructuredData;
}

/**
 * Verifies meta tag properties in the project's primary route pages.
 *
 * @returns {Promise<boolean>} True if all main pages have proper implementation.
 */
async function checkMetaTagsInPages() {
    printSection('7. Meta Tags in Main Pages');

    const mainPages = [
        'src/pages/index.astro',
        'src/pages/voyages.astro',
        'src/pages/blog.astro',
        'src/pages/videos.astro',
        'src/pages/observatoires.astro',
        'src/pages/a-propos.astro',
        'src/pages/astrophotographies/index.astro',
        'src/pages/statistiques.astro',
    ];

    let allGood = true;

    for (const pagePath of mainPages) {
        const fullPath = path.join(ROOT, pagePath);
        if (!fs.existsSync(fullPath)) {
            printWarning(`${pagePath} not found`);
            continue;
        }

        const content = fs.readFileSync(fullPath, 'utf8');
        const hasBaseLayout = content.includes('BaseLayout');
        const hasTitle = content.includes('title=') || content.includes('title:');
        const hasDescription =
            content.includes('description=') || content.includes('description:') || content.includes('seoDescription');

        if (hasBaseLayout && hasTitle && hasDescription) {
            printOk(path.basename(pagePath));
        } else {
            printWarning(
                `${path.basename(pagePath)} - ${!hasBaseLayout ? 'no BaseLayout' : ''} ${!hasTitle ? 'no title' : ''} ${!hasDescription ? 'no description' : ''}`,
            );
            allGood = false;
        }
    }

    return allGood;
}

/**
 * Checks if link prefetching is enabled in the Astro configuration.
 *
 * @returns {Promise<boolean>} True if prefetching is configured.
 */
async function checkPrefetching() {
    printSection('8. Prefetching Configuration');

    if (!fs.existsSync(ASTRO_CONFIG_PATH)) {
        printError('astro.config.mjs not found!');
        return false;
    }

    const configContent = fs.readFileSync(ASTRO_CONFIG_PATH, 'utf8');

    if (configContent.includes('prefetch')) {
        printOk('Prefetching configured');
        return true;
    } else {
        printWarning('Prefetching not configured (consider enabling for better UX)');
        return false;
    }
}

// Main execution
/**
 * Main execution flow for the SEO audit.
 */
async function main() {
    console.log(`${STYLE_BOLD}${COLOR_BLUE}`);
    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║          SEO & astro-seo Coverage Report             ║');
    console.log('╚══════════════════════════════════════════════════════╝');
    console.log(COLOR_RESET);

    const results = {
        seoDescriptions: await checkSeoDescriptions(),
        astroSeo: await checkAstroSeoImplementation(),
        sitemap: await checkSitemap(),
        robotsTxt: await checkRobotsTxt(),
        imageAlts: await checkImageAltTexts(),
        structuredData: await checkStructuredData(),
        metaTags: await checkMetaTagsInPages(),
        prefetching: await checkPrefetching(),
    };

    // Summary
    printSection('SUMMARY');
    const passed = Object.values(results).filter((r) => {
        if (r === true) return true;
        if (typeof r === 'object') {
            if ('missing' in r) return r.missing === 0;
            if ('defined' in r && 'total' in r) return r.defined === r.total;
        }
        return false;
    }).length;
    const totalCount = Object.keys(results).length;

    console.log(`\n  ${STYLE_BOLD}Score: ${passed}/${totalCount} checks passed${COLOR_RESET}\n`);

    if (passed === totalCount) {
        console.log(`  ${COLOR_GREEN}${STYLE_BOLD}🎉 Excellent! All SEO checks passed.${COLOR_RESET}\n`);
    } else {
        console.log(`  ${COLOR_YELLOW}Review the warnings above to improve SEO coverage.${COLOR_RESET}\n`);
    }
}

main().catch(console.error);
