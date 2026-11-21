/**
 * Captures visuelles de référence et comparaison pixel
 *
 * Responsabilité principale :
 * - Capture les pages clés du site en thème clair et sombre, en 390 px (mobile) et
 *   1440 px (bureau), dans temp/visual/<label>/ (dossier ignoré par git).
 * - Mesure en même temps, pour chaque page en bureau clair, le nombre et le poids des
 *   images reçues au chargement initial puis après défilement complet (lazy-loading
 *   déclenché) : temp/visual/<label>/metrics.json.
 * - En mode --compare, compare deux séries de captures pixel à pixel (pixelmatch),
 *   écrit les images de différence dans temp/visual/diff-<a>-<b>/ et liste les
 *   captures qui dépassent le seuil.
 *
 * Aucun effet distant : le site visé doit tourner en local (`npm run dev` par défaut).
 * Les images servies depuis R2 ou le worker sont seulement lues.
 *
 * Options disponibles :
 *   --label=<nom>          : Nom de la série de captures (défaut : "current").
 *   --base-url=<url>       : URL du site à capturer (défaut : http://localhost:4321).
 *   --only=<a,b>           : Ne capture que les pages dont le nom contient l'un de ces mots.
 *   --compare <a> <b>      : Compare les séries <a> et <b> au lieu de capturer.
 *   --threshold=<pourcent> : Pourcentage de pixels différents toléré en comparaison (défaut : 0.5).
 *
 * Exemples d'utilisation :
 *   node scripts/audit/visual-snapshots.mjs --label=before
 *   node scripts/audit/visual-snapshots.mjs --label=after --only=accueil,blog
 *   node scripts/audit/visual-snapshots.mjs --compare before after
 *   node scripts/audit/visual-snapshots.mjs --compare before after --threshold=1
 */

import fs from 'node:fs';
import path from 'node:path';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '../..');
const OUTPUT_ROOT = path.join(PROJECT_ROOT, 'temp/visual');

const PAGES = [
    { name: 'accueil', path: '/' },
    { name: 'astrophotographies', path: '/astrophotographies' },
    { name: 'astrophoto-detail', path: '/astrophotographies/la-nebuleuse-d-orion-m42-1213620' },
    { name: 'voyages', path: '/voyages' },
    { name: 'voyage-detail', path: '/voyages/2025/troms-au-nord-de-la-norvege' },
    { name: 'blog', path: '/blog' },
    { name: 'blog-detail', path: '/blog/2026/la-route-des-fjords' },
    { name: 'videos', path: '/videos' },
    { name: 'carte-du-ciel', path: '/carte-du-ciel' },
    { name: 'outils', path: '/outils' },
    { name: 'outils-asteroides', path: '/outils/asteroides' },
    { name: 'outils-cometes', path: '/outils/cometes' },
    { name: 'outils-etoiles-variables', path: '/outils/etoiles-variables' },
    { name: 'outils-exoplanetes', path: '/outils/exoplanetes' },
    { name: 'catalogue-messier', path: '/catalogues/messier' },
    { name: 'objets', path: '/objets' },
    { name: 'recommandations', path: '/recommandations' },
    { name: 'statistiques', path: '/statistiques' },
    { name: 'a-propos', path: '/a-propos' },
    { name: 'boutique', path: '/boutique' },
    { name: '404', path: '/cette-page-n-existe-pas' },
];

const VIEWPORTS = [
    { name: 'mobile', width: 390, height: 844 },
    { name: 'desktop', width: 1440, height: 900 },
];
const COLOR_SCHEMES = ['light', 'dark'];
// POURQUOI : au-delà, les listings (centaines de vignettes) donnent des PNG énormes
// sans apporter plus de signal qu'un haut de page représentatif.
const MAX_CAPTURE_HEIGHT = 6000;
const IMAGE_RESOURCE_TYPES = new Set(['image']);

const args = process.argv.slice(2);
const getOption = (name, fallback) =>
    args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;

/**
 * Fait défiler la page jusqu'en bas par paliers pour déclencher le lazy-loading.
 *
 * @param {import('playwright').Page} page - Page Playwright.
 * @returns {Promise<void>}
 */
async function scrollToBottom(page) {
    await page.evaluate(async (maxHeight) => {
        const step = window.innerHeight;
        for (let y = 0; y < Math.min(document.body.scrollHeight, maxHeight); y += step) {
            window.scrollTo(0, y);
            await new Promise((resolve) => setTimeout(resolve, 120));
        }
        window.scrollTo(0, 0);
    }, MAX_CAPTURE_HEIGHT);
}

function summarizeImages(requests) {
    return {
        count: requests.length,
        kilobytes: Math.round(requests.reduce((total, entry) => total + entry.bytes, 0) / 1024),
    };
}

async function capture() {
    const { chromium } = await import('playwright');
    const label = getOption('label', 'current');
    const baseUrl = getOption('base-url', 'http://localhost:4321');
    const onlyFilters = getOption('only', '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
    const pages = onlyFilters.length
        ? PAGES.filter((entry) => onlyFilters.some((filter) => entry.name.includes(filter)))
        : PAGES;
    const outputDir = path.join(OUTPUT_ROOT, label);
    fs.mkdirSync(outputDir, { recursive: true });

    const browser = await chromium.launch();
    const metrics = {};
    let failures = 0;

    for (const pageEntry of pages) {
        for (const viewport of VIEWPORTS) {
            for (const colorScheme of COLOR_SCHEMES) {
                const context = await browser.newContext({
                    viewport: { width: viewport.width, height: viewport.height },
                    colorScheme,
                    reducedMotion: 'reduce',
                    deviceScaleFactor: 1,
                });
                const page = await context.newPage();
                const imageRequests = [];
                const shouldMeasure = viewport.name === 'desktop' && colorScheme === 'light';
                if (shouldMeasure) {
                    page.on('requestfinished', async (request) => {
                        if (!IMAGE_RESOURCE_TYPES.has(request.resourceType())) return;
                        const sizes = await request.sizes().catch(() => null);
                        imageRequests.push({ url: request.url(), bytes: sizes?.responseBodySize ?? 0 });
                    });
                }
                const fileName = `${pageEntry.name}-${viewport.name}-${colorScheme}.png`;
                try {
                    const response = await page.goto(baseUrl + pageEntry.path, {
                        waitUntil: 'load',
                        timeout: 90_000,
                    });
                    // POURQUOI : certaines pages (vidéo, flux continus) n'atteignent jamais
                    // « networkidle » ; on l'attend au plus 20 s après l'événement load.
                    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
                    // POURQUOI : la barre d'outils de `astro dev` n'apparaît pas toujours au même moment ;
                    // elle n'existe pas en production et fausserait la comparaison.
                    await page.addStyleTag({ content: 'astro-dev-toolbar { display: none !important; }' });
                    const initialImages = summarizeImages(imageRequests);
                    await scrollToBottom(page);
                    await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
                    await page.waitForTimeout(500);
                    if (shouldMeasure) {
                        metrics[pageEntry.name] = {
                            status: response?.status() ?? null,
                            initialImages,
                            afterScrollImages: summarizeImages(imageRequests),
                            largestImages: [...imageRequests]
                                .sort((a, b) => b.bytes - a.bytes)
                                .slice(0, 5)
                                .map((entry) => ({ url: entry.url, kilobytes: Math.round(entry.bytes / 1024) })),
                        };
                    }
                    const fullHeight = await page.evaluate(() => document.documentElement.scrollHeight);
                    // POURQUOI : le ciel animé (WASM), les cartes et les vidéos changent à chaque
                    // rendu ; on les masque pour que la comparaison ne mesure que la mise en page.
                    const masks = [page.locator('canvas'), page.locator('iframe'), page.locator('video')];
                    await page.screenshot({
                        path: path.join(outputDir, fileName),
                        fullPage: true,
                        clip: { x: 0, y: 0, width: viewport.width, height: Math.min(fullHeight, MAX_CAPTURE_HEIGHT) },
                        mask: masks,
                        animations: 'disabled',
                    });
                    console.log(`✓ ${fileName} (${response?.status()})`);
                } catch (error) {
                    failures += 1;
                    console.error(`✗ ${fileName} : ${error.message}`);
                } finally {
                    await context.close();
                }
            }
        }
    }

    await browser.close();
    fs.writeFileSync(path.join(outputDir, 'metrics.json'), JSON.stringify(metrics, null, 2));
    console.log(`\nCaptures dans ${path.relative(PROJECT_ROOT, outputDir)} (${failures} échec(s)).`);
    if (failures > 0) process.exit(1);
}

async function compare(labelA, labelB) {
    const { PNG } = await import('pngjs');
    const { default: pixelmatch } = await import('pixelmatch');
    const threshold = Number(getOption('threshold', '0.5'));
    const dirA = path.join(OUTPUT_ROOT, labelA);
    const dirB = path.join(OUTPUT_ROOT, labelB);
    const diffDir = path.join(OUTPUT_ROOT, `diff-${labelA}-${labelB}`);
    fs.mkdirSync(diffDir, { recursive: true });

    const files = fs.readdirSync(dirA).filter((file) => file.endsWith('.png'));
    const report = [];
    for (const file of files) {
        const fileB = path.join(dirB, file);
        if (!fs.existsSync(fileB)) {
            report.push({ file, status: `absent de ${labelB}` });
            continue;
        }
        const imageA = PNG.sync.read(fs.readFileSync(path.join(dirA, file)));
        const imageB = PNG.sync.read(fs.readFileSync(fileB));
        // POURQUOI : une page dont la hauteur change n'est pas comparable pixel à pixel ;
        // on compare la zone commune et on signale l'écart de hauteur.
        const width = Math.min(imageA.width, imageB.width);
        const height = Math.min(imageA.height, imageB.height);
        const crop = (image) => {
            const cropped = new PNG({ width, height });
            PNG.bitblt(image, cropped, 0, 0, width, height, 0, 0);
            return cropped;
        };
        const diff = new PNG({ width, height });
        const differentPixels = pixelmatch(crop(imageA).data, crop(imageB).data, diff.data, width, height, {
            threshold: 0.1,
        });
        const percent = (differentPixels / (width * height)) * 100;
        const heightDelta = imageB.height - imageA.height;
        if (percent > threshold || heightDelta !== 0) {
            fs.writeFileSync(path.join(diffDir, file), PNG.sync.write(diff));
            report.push({ file, diffPercent: Number(percent.toFixed(2)), heightDelta });
        }
    }

    if (report.length === 0) {
        console.log(`Aucune différence au-delà de ${threshold} % sur ${files.length} captures.`);
        return;
    }
    console.table(report);
    console.log(`Images de différence dans ${path.relative(PROJECT_ROOT, diffDir)}`);
    process.exit(1);
}

const compareIndex = args.indexOf('--compare');
if (compareIndex !== -1) {
    const [labelA, labelB] = args.slice(compareIndex + 1, compareIndex + 3);
    if (!labelA || !labelB) {
        console.error('Usage : --compare <labelA> <labelB>');
        process.exit(1);
    }
    await compare(labelA, labelB);
} else {
    await capture();
}
