/**
 * Temps de lecture des articles de blog
 *
 * Responsabilité principale :
 * - Parcourir les fichiers Markdown de src/content/blog/.
 * - Calculer le temps de lecture de ceux qui n'en ont pas (src/lib/admin/reading-time.ts) et l'écrire dans
 *   src/data/blog.json. Une valeur existante n'est jamais remplacée.
 *
 * Effet distant : aucun. Effet local : src/data/blog.json.
 *
 * Options disponibles : aucune.
 *
 * Code de sortie : 1 si une erreur inattendue arrête le script.
 *
 * Exemple d'utilisation :
 *   node scripts/seo/blog-metadata.js
 */

import fs from 'node:fs';
import path from 'node:path';
import { computeReadingTime } from '../../src/lib/admin/reading-time.ts';
import { PROJECT_ROOT } from '../lib/env.mjs';

const BLOG_DIR = path.join(PROJECT_ROOT, 'src/content/blog');
const OUTPUT_FILE = path.join(PROJECT_ROOT, 'src/data/blog.json');

/**
 * Enchaîne le calcul pour tous les articles.
 *
 * @returns {void}
 */
function main() {
    const blogData = fs.existsSync(OUTPUT_FILE) ? JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8')) : {};
    const files = fs
        .readdirSync(BLOG_DIR, { recursive: true })
        .map(String)
        .filter((file) => /\.mdx?$/.test(file));

    let addedCount = 0;
    for (const file of files) {
        const slug = file
            .replace(/\.mdx?$/, '')
            .split(path.sep)
            .join('/');
        if (blogData[slug]?.readingTime) continue;

        const content = fs.readFileSync(path.join(BLOG_DIR, file), 'utf8');
        const body = content.replace(/^---\r?\n[\s\S]*?\r?\n---/, '');
        const readingTime = computeReadingTime(body);
        blogData[slug] = { id: slug, readingTime };
        console.log(`${slug} : ${readingTime}`);
        addedCount++;
    }

    if (addedCount > 0) fs.writeFileSync(OUTPUT_FILE, JSON.stringify(blogData, null, 2));
    console.log(`${addedCount} temps de lecture ajouté(s), ${files.length - addedCount} déjà présent(s).`);
}

try {
    main();
} catch (error) {
    // POURQUOI : l'admin et update-content.mjs jugent le succès sur le code de sortie.
    console.error(error);
    process.exit(1);
}
