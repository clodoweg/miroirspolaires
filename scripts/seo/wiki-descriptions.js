/**
 * Descriptions des astrophotos depuis Wikipedia, sans modèle de langage
 *
 * Responsabilité principale :
 * - Lire les photos du CSV data/astrobin_clodoweg_gallery_python.csv.
 * - Pour celles sans description, chercher sur Wikipedia en français les objets du titre, puis ceux du champ.
 * - Reprendre l'introduction de l'article, coupée à la fin d'une phrase (scripts/lib/wiki-intro.mjs), et
 *   l'écrire dans src/data/wikipedia.json avec l'URL de la source, affichée sur la page de la photo.
 *
 * WARNING: le texte est repris tel quel de Wikipedia (licence CC BY-SA) : garder le lien vers la source.
 *
 * Effet distant : lecture de l'API de Wikipedia. Effet local : src/data/wikipedia.json. Une description
 * existante n'est jamais remplacée.
 *
 * Options disponibles : aucune.
 *
 * Code de sortie : 1 si une erreur inattendue arrête le script. Une photo sans article trouvé n'est pas une erreur.
 *
 * Exemple d'utilisation :
 *   node scripts/seo/wiki-descriptions.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Papa from 'papaparse';
import { buildWikiIntro } from '../lib/wiki-intro.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CSV_PATH = path.join(__dirname, '../../data/astrobin_clodoweg_gallery_python.csv');
const OUTPUT_FILE = path.join(__dirname, '../../src/data/wikipedia.json');

/**
 * Fetches the introduction and metadata for a given query from the French Wikipedia.
 *
 * @param {string} query - The search term or page title.
 * @returns {Promise<{text: string, title: string, url: string}|null>} Page content or null if not found/disambiguation.
 */
async function fetchWikiIntro(query) {
    if (!query) return null;
    try {
        console.log(`  Fetching Wiki: ${query}`);
        const params = new URLSearchParams({
            action: 'query',
            format: 'json',
            prop: 'extracts',
            exintro: 'true',
            explaintext: 'true',
            titles: query,
            origin: '*',
            redirects: '1',
        });

        const url = `https://fr.wikipedia.org/w/api.php?${params.toString()}`;
        const res = await fetch(url, { headers: { 'User-Agent': 'PortfolioAstroBot/1.0' } });

        if (!res.ok) return null;

        const data = await res.json();
        const pages = data.query?.pages;
        if (!pages) return null;

        const pageId = Object.keys(pages)[0];
        const page = pages[pageId];

        if (pageId === '-1' || !page.extract) return null;

        const text = page.extract;

        // Detect disambiguation pages
        if (
            text.includes('peut faire référence à') ||
            text.includes('peut désigner :') ||
            text.includes('homonymie') ||
            text.includes('utilisé dans différents contextes')
        ) {
            console.log(`  Skipping Disambiguation: ${page.title}`);
            return null;
        }

        return {
            text,
            title: page.title,
            url: `https://fr.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
        };
    } catch (e) {
        console.error(`  Error fetching ${query}:`, e.message);
        return null;
    }
}

/**
 * Cherche l'introduction du premier objet trouvé sur Wikipedia.
 *
 * @param {Record<string, string>} row - Ligne du CSV.
 * @returns {Promise<{description: string, url: string}|null>} La description et sa source, ou null.
 */
async function findDescription(row) {
    // POURQUOI : On priorise les objets mentionnés directement dans le titre (ex: NGC 2020 / NGC 2014)
    // avant les objets secondaires du champ astronomique pour que la description cible le sujet principal.
    const titleObjects = (row.Title || '').match(/(NGC|IC|M|Sh2-|Barnard|vdB)\s*\d+/gi) || [];
    const objects = (row['Objects in Field'] || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    const candidates = [...new Set([...titleObjects.map((s) => s.replace(/\s+/, ' ')), ...objects])];

    for (const input of candidates) {
        const queries = /^M\s?\d+$/.test(input) ? [input, input.replace(/^M\s?/, 'Messier ')] : [input];
        for (const query of queries) {
            const page = await fetchWikiIntro(query);
            const description = page ? buildWikiIntro(page.text) : null;
            if (description) return { description, url: page.url };
        }
    }
    return null;
}

/**
 * Main execution flow for generating missing astronomical descriptions.
 */
async function main() {
    const csvContent = fs.readFileSync(CSV_PATH, 'utf8');
    const { data } = Papa.parse(csvContent, { header: true });

    let existing = {};
    if (fs.existsSync(OUTPUT_FILE)) {
        try {
            existing = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
        } catch {
            // POURQUOI : JSON illisible, on repart d'un cache vide.
        }
    }

    console.log(`Found ${data.length} photos.`);
    let skippedCount = 0;

    for (const row of data) {
        if (!row.ID) continue;

        if (existing[row.ID]?.description?.trim()) {
            skippedCount++;
            continue;
        }

        console.log(`Processing ${row.ID}: ${row.Title}`);
        const found = await findDescription(row);

        if (found) {
            existing[row.ID] = { id: row.ID, description: found.description, source: found.url };
            console.log(`  -> ${found.description.length} caractères repris de ${found.url}`);
            fs.writeFileSync(OUTPUT_FILE, JSON.stringify(existing, null, 2));
        } else {
            console.log('  -> No Wiki content found.');
        }
    }
    console.log(`${skippedCount} description(s) déjà présente(s).`);
}

// POURQUOI : l'admin et update-photos.mjs jugent le succès sur le code de sortie.
main().catch((error) => {
    console.error(error);
    process.exit(1);
});
