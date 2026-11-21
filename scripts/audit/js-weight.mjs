/**
 * Mesure du poids JavaScript par page dans le build
 *
 * Responsabilité principale :
 * - Lit les pages HTML de .vercel/output/static (produites par `npm run build`).
 * - Pour chaque page, collecte les scripts référencés (<script src>, modulepreload,
 *   component-url et renderer-url des <astro-island>) puis suit récursivement les
 *   imports statiques des chunks pour obtenir le JS réellement chargé au premier rendu.
 *   Les imports dynamiques (`import()`) sont comptés à part : ils ne bloquent pas le rendu.
 * - Affiche un tableau (octets bruts et gzip) et peut l'écrire en JSON pour comparaison.
 *
 * Aucun effet distant : lecture seule du dossier de build local.
 *
 * Options disponibles :
 *   --json=<fichier> : Écrit les résultats en JSON dans ce fichier.
 *   --all            : Mesure toutes les pages au lieu de la liste des pages clés.
 *
 * Exemples d'utilisation :
 *   node scripts/audit/js-weight.mjs
 *   node scripts/audit/js-weight.mjs --json=temp/js-weight-before.json
 *   node scripts/audit/js-weight.mjs --all
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const STATIC_ROOT = path.resolve('.vercel/output/static');
const KEY_PAGES = [
    'index.html',
    'astrophotographies/index.html',
    'voyages/index.html',
    'blog/index.html',
    'videos/index.html',
    'carte-du-ciel/index.html',
    'outils/index.html',
    'outils/asteroides/index.html',
    'outils/cometes/index.html',
    'outils/etoiles-variables/index.html',
    'outils/exoplanetes/index.html',
    'catalogues/messier/index.html',
    'objets/index.html',
    'recommandations/index.html',
    'statistiques/index.html',
    'a-propos/index.html',
    'boutique/index.html',
    '404.html',
];

const args = process.argv.slice(2);
const jsonOutput = args.find((arg) => arg.startsWith('--json='))?.slice('--json='.length);
const measureAll = args.includes('--all');

const STATIC_IMPORT_PATTERN = /(?:import|export)\s*(?:[\w*{}\s,$]+from\s*)?["']([^"']+\.js)["']/g;
const DYNAMIC_IMPORT_PATTERN = /import\(\s*["']([^"']+\.js)["']\s*\)/g;
const HTML_SCRIPT_PATTERN = /(?:src|href|component-url|renderer-url)="(\/[^"]+\.js)"/g;

const sizeCache = new Map();

function readChunk(publicPath) {
    if (sizeCache.has(publicPath)) return sizeCache.get(publicPath);
    const filePath = path.join(STATIC_ROOT, publicPath);
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath);
    const chunk = {
        raw: content.length,
        gzip: zlib.gzipSync(content).length,
        text: content.toString('utf8'),
    };
    sizeCache.set(publicPath, chunk);
    return chunk;
}

function resolveImport(fromPath, specifier) {
    if (specifier.startsWith('/')) return specifier;
    return path.posix.join(path.posix.dirname(fromPath), specifier);
}

/**
 * Suit les imports statiques depuis les points d'entrée d'une page.
 *
 * @param {string[]} entryPaths - Chemins publics des scripts d'entrée.
 * @returns {{ staticSet: Set<string>, dynamicSet: Set<string> }} Chunks chargés au rendu et chunks différés.
 */
function collectChunks(entryPaths) {
    const staticSet = new Set();
    const dynamicSet = new Set();
    const queue = [...entryPaths];
    while (queue.length > 0) {
        const current = queue.shift();
        if (staticSet.has(current)) continue;
        const chunk = readChunk(current);
        if (!chunk) continue;
        staticSet.add(current);
        for (const match of chunk.text.matchAll(STATIC_IMPORT_PATTERN)) {
            queue.push(resolveImport(current, match[1]));
        }
        for (const match of chunk.text.matchAll(DYNAMIC_IMPORT_PATTERN)) {
            dynamicSet.add(resolveImport(current, match[1]));
        }
    }
    for (const loaded of staticSet) dynamicSet.delete(loaded);
    return { staticSet, dynamicSet };
}

function sumSizes(paths) {
    let raw = 0;
    let gzip = 0;
    for (const publicPath of paths) {
        const chunk = readChunk(publicPath);
        if (!chunk) continue;
        raw += chunk.raw;
        gzip += chunk.gzip;
    }
    return { raw, gzip };
}

function listAllPages(directory, prefix = '') {
    const pages = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const relativePath = path.posix.join(prefix, entry.name);
        if (entry.isDirectory() && entry.name !== '_astro') {
            pages.push(...listAllPages(path.join(directory, entry.name), relativePath));
        } else if (entry.name.endsWith('.html')) {
            pages.push(relativePath);
        }
    }
    return pages;
}

if (!fs.existsSync(STATIC_ROOT)) {
    console.error(`Build introuvable : ${STATIC_ROOT}. Lancer d'abord npm run build.`);
    process.exit(1);
}

const pages = (measureAll ? listAllPages(STATIC_ROOT) : KEY_PAGES).filter((page) =>
    fs.existsSync(path.join(STATIC_ROOT, page)),
);
const results = [];
for (const page of pages) {
    const html = fs.readFileSync(path.join(STATIC_ROOT, page), 'utf8');
    const entries = [...new Set([...html.matchAll(HTML_SCRIPT_PATTERN)].map((match) => match[1]))];
    const { staticSet, dynamicSet } = collectChunks(entries);
    const initial = sumSizes(staticSet);
    const deferred = sumSizes(dynamicSet);
    results.push({
        page,
        chunks: staticSet.size,
        initialRawKb: Math.round(initial.raw / 1024),
        initialGzipKb: Math.round(initial.gzip / 1024),
        deferredGzipKb: Math.round(deferred.gzip / 1024),
    });
}

console.table(results);
if (jsonOutput) {
    fs.mkdirSync(path.dirname(jsonOutput), { recursive: true });
    fs.writeFileSync(jsonOutput, JSON.stringify(results, null, 2));
    console.log(`Résultats écrits dans ${jsonOutput}`);
}
