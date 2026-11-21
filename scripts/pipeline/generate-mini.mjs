/**
 * Image optimization script that generates downscaled versions of astrophotography and index assets.
 *
 * Responsibility:
 * - Recursively walks through asset directories.
 * - Resizes large images to a standardized MAX_SIZE (1600px, voir la constante) using Sharp.
 * - Stores optimized versions in 'mini' subdirectories to improve frontend performance.
 * - Skips already existing files by default; use --force to overwrite.
 *
 * Options disponibles (toute autre option est refusée, code de sortie 1) :
 *   --only=astro|index : limite le traitement aux astrophotos ou aux images de l'accueil (défaut : les deux).
 *   --force            : réécrit les miniatures existantes.
 *
 * Usage:
 *   node scripts/pipeline/generate-mini.mjs --only=astro           # incremental (skip existing)
 *   node scripts/pipeline/generate-mini.mjs --only=index --force   # overwrite existing files
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { parseCliArgs } from '../lib/args.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// __dirname is scripts/pipeline/, so ../.. resolves to the project root.
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const SOURCE_DIR = path.join(PROJECT_ROOT, 'src/assets/astrophotographies');
const TARGET_DIR = path.join(SOURCE_DIR, 'mini');

// 1600px keeps mini/ files under ~200 KB (well below the worker's 500 KB passthrough
// threshold) while providing beautiful details for high-DPI/Retina/scaled displays.
const MAX_SIZE = 1600;
const parsedArgs = parseCliArgs(process.argv.slice(2), { flags: { force: ['--force'] }, valueOptions: ['--only'] });
const FORCE = parsedArgs.flags.force;
const ONLY = parsedArgs.values['--only'];
if (ONLY && !['astro', 'index'].includes(ONLY)) {
    console.error('Usage : generate-mini.mjs [--only=astro|index] [--force]');
    process.exit(1);
}

/**
 * Ensures a directory exists, creating it recursively if necessary.
 *
 * @param {string} dir - Directory path.
 */
function ensureDirectoryExists(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

/**
 * Recursively processes a directory of images to generate optimized versions.
 *
 * @param {string} sourcePath - Input directory.
 * @param {string} targetPath - Output directory for 'mini' versions.
 */
async function processImageDirectory(sourcePath, targetPath) {
    const files = fs.readdirSync(sourcePath);

    for (const file of files) {
        const fullSourcePath = path.join(sourcePath, file);
        const stat = fs.statSync(fullSourcePath);

        if (stat.isDirectory()) {
            if (file === 'mini' || file === 'annotations' || file === 'skyplots') continue;

            await processImageDirectory(fullSourcePath, path.join(targetPath, file));
        } else if (file.match(/\.(jpg|jpeg|png|webp)$/i)) {
            const fullTargetPath = path.join(targetPath, file);

            if (!FORCE && fs.existsSync(fullTargetPath)) continue;

            ensureDirectoryExists(targetPath);
            console.log(`Processing: ${file}...`);

            try {
                // Use sharp to resize to MAX_SIZE (keeping aspect ratio)
                // 'inside' means the image will be resized to be as large as possible while
                // ensuring its dimensions are less than or equal to both MAX_SIZE.
                // POURQUOI: limitInputPixels: false permet de traiter les mosaïques astrophotographiques
                // géantes (ex: M31 à 312 Mégapixels) qui dépassent la limite par défaut de Sharp (268 MP).
                await sharp(fullSourcePath, { limitInputPixels: false })
                    .resize(MAX_SIZE, MAX_SIZE, {
                        fit: 'inside',
                        withoutEnlargement: true,
                    })
                    .toFile(fullTargetPath);
            } catch (error) {
                console.error(`Error processing ${file}:`, error.message);
            }
        }
    }
}

/**
 * Main execution flow for bulk image optimization across asset folders.
 */
async function main() {
    if (ONLY !== 'index') {
        console.log('--- Generating mini versions of astrophotographies ---');
        console.log(`Source: ${SOURCE_DIR}`);
        console.log(`Target: ${TARGET_DIR}`);
        await processImageDirectory(SOURCE_DIR, TARGET_DIR);
    }

    if (ONLY !== 'astro') {
        const INDEX_SOURCE_DIR = path.join(PROJECT_ROOT, 'src/assets/index');
        const INDEX_TARGET_DIR = path.join(INDEX_SOURCE_DIR, 'mini');

        console.log('\n--- Generating mini versions of index assets ---');
        console.log(`Source: ${INDEX_SOURCE_DIR}`);
        console.log(`Target: ${INDEX_TARGET_DIR}`);
        await processImageDirectory(INDEX_SOURCE_DIR, INDEX_TARGET_DIR);
    }

    console.log('\n--- Done! ---');
}

main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
