/**
 * Textes manquants du blog et des voyages
 *
 * Responsabilité : lister les images affichées par le site sans alt et les voyages sans description SEO.
 * Ces textes s'écrivent dans Claude Code (`/generate-alts`, `/generate-seo`) : l'admin et
 * `scripts/pipeline/update-content.mjs` se contentent de les signaler.
 *
 * POURQUOI : le site lit l'alt du blog dans le Markdown, et celui des voyages dans `src/data/alt.json`.
 * Compter les fichiers présents sur le disque surestimerait le besoin, car beaucoup ne sont cités nulle part.
 * La description SEO d'un article de blog est sa `description` : elle n'est donc jamais signalée ici.
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Liste les images d'un article de blog sans alt dans le Markdown.
 *
 * @param {string} markdown - Contenu de l'article.
 * @returns {string[]} Les chemins des images.
 */
export function findBlogImagesWithoutAlt(markdown) {
    return [...markdown.matchAll(/!\[\s*\]\(([^)]+)\)/g)].map((match) => match[1]);
}

/**
 * Liste les images d'un voyage (couverture et galerie) sans entrée dans `alt.json`.
 *
 * @param {string} markdown - Contenu du fichier du voyage.
 * @param {Record<string, unknown>} altData - Contenu de `alt.json`.
 * @returns {string[]} Les clés `/assets/…` sans alt, sans doublon.
 */
export function findVoyageImagesWithoutAlt(markdown, altData) {
    const frontmatter = markdown.match(/^---\r?\n([\s\S]+?)\r?\n---/)?.[1] ?? '';
    const keys = [...frontmatter.matchAll(/(\/assets\/[^"'\s]+)/g)].map((match) => match[1]);
    return [...new Set(keys)].filter((key) => !altData[key]);
}

/**
 * Lit un JSON de `src/data/`, vide s'il est absent ou illisible.
 *
 * @param {string} filePath - Chemin du fichier.
 * @returns {Record<string, unknown>} Son contenu.
 */
function readJsonOrEmpty(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return {};
    }
}

/**
 * Calcule les textes manquants d'un domaine.
 *
 * @param {'blog' | 'voyages'} scope - Domaine à analyser.
 * @param {string} projectRoot - Racine du dépôt.
 * @returns {{ missingAltCount: number, missingAltsByEntry: Record<string, number>, missingSeo: string[] }}
 *   Le nombre d'images sans alt, leur détail par contenu, et les voyages sans description SEO.
 */
export function getContentGaps(scope, projectRoot) {
    const contentRoot = path.join(projectRoot, 'src/content', scope);
    const altData = readJsonOrEmpty(path.join(projectRoot, 'src/data/alt.json'));
    const seoData = readJsonOrEmpty(path.join(projectRoot, 'src/data/seo.json'));
    const files = fs.existsSync(contentRoot)
        ? fs
              .readdirSync(contentRoot, { recursive: true })
              .map(String)
              .filter((file) => file.endsWith('.md'))
              .sort()
        : [];

    const missingAltsByEntry = {};
    const missingSeo = [];
    let missingAltCount = 0;
    for (const file of files) {
        const markdown = fs.readFileSync(path.join(contentRoot, file), 'utf8');
        const entry = file.replace(/\.md$/, '').split(path.sep).join('/');
        const missing =
            scope === 'blog' ? findBlogImagesWithoutAlt(markdown) : findVoyageImagesWithoutAlt(markdown, altData);
        if (missing.length > 0) missingAltsByEntry[entry] = missing.length;
        missingAltCount += missing.length;
        if (scope === 'voyages' && !seoData[`voyages/${entry}`]) missingSeo.push(entry);
    }
    return { missingAltCount, missingAltsByEntry, missingSeo };
}
