/**
 * Responsive hero image generator that composites multiple asset tiles into a mosaic.
 *
 * Responsibility:
 * - Defines various viewport configurations (xs to 2xl) for responsive delivery.
 * - Interleaves and shuffles curated voyage cover images and astrophotography snapshots.
 * - Uses the Sharp library to resize tiles and composite them into a single high-resolution background.
 * - Outputs optimized JPEG files to src/assets/index (hero-xs.jpg … hero-2xl.jpg).
 *
 * CLI Options: none.
 *
 * Examples of Usage:
 *   node scripts/build/hero-mosaic.mjs
 */

import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// __dirname is scripts/build/, so ../.. resolves to the project root.
const ROOT = path.resolve(__dirname, '../..');
const OUTPUT_DIR = path.join(ROOT, 'src/assets/index');

const HERO_CONFIGS = [
    // 2x resolution for Retina displays
    // Dimensions match typical viewport ratios (minus navbar ~60-80px)
    // Using 1:1 square tiles for consistent cropping across all sizes
    // Format: { name, width, height, cols, rows, tileW, tileH }

    // Mobile portrait (iPhone 14: 390×844, hero ~790px high) → ratio ~1:2
    { name: 'xs', width: 780, height: 1580, cols: 3, rows: 6, tileW: 260, tileH: 263 },

    // Mobile landscape / small screens (640×480, hero ~420px) → ratio ~3:2
    { name: 'sm', width: 1280, height: 840, cols: 4, rows: 3, tileW: 320, tileH: 280 },

    // Tablet portrait (768×1024, hero ~960px) → ratio ~4:5
    { name: 'md', width: 1536, height: 1920, cols: 4, rows: 5, tileW: 384, tileH: 384 },

    // Tablet landscape (1024×768, hero ~700px) → ratio ~3:2
    { name: 'lg', width: 2048, height: 1400, cols: 5, rows: 4, tileW: 410, tileH: 350 },

    // Desktop (1440×900, hero ~830px) → ratio ~7:4
    { name: 'xl', width: 2880, height: 1660, cols: 6, rows: 4, tileW: 480, tileH: 415 },

    // Large desktop (1920×1080, hero ~1000px) → ratio ~2:1
    { name: '2xl', width: 3840, height: 2000, cols: 8, rows: 4, tileW: 480, tileH: 500 },
];

const JPEG_QUALITY = 85;

// Voyage cover images (8 total)
const VOYAGE_IMAGES = [
    'src/assets/voyages/2025/la-cote-est-du-groenland/cover.jpg',
    'src/assets/voyages/2024/la-cote-ouest-du-groenland/cover.jpg',
    'src/assets/voyages/2025/la-west-highland-way-a-travers-lecosse/cover.jpg',
    'src/assets/voyages/2022/la-baie-du-roi-au-spitzberg/cover.jpg',
    'src/assets/voyages/2020/lile-de-senja-en-norvege/cover.jpg',
    'src/assets/voyages/2011/la-region-de-leverest/cover.jpg',
    'src/assets/voyages/2009/le-massif-du-langtang-au-nepal/cover.jpg',
    'src/assets/voyages/2017/les-hautes-terres-decosse/cover.jpg',
].map((f) => path.join(ROOT, f));

// Astrophotography mini images (7 total - using mini versions)
const ASTRO_IMAGES = [
    'src/assets/astrophotographies/mini/2025/1142059_raw.jpg',
    'src/assets/astrophotographies/mini/2025/1092164_raw.jpg',
    'src/assets/astrophotographies/mini/2025/1051264_raw.jpg',
    'src/assets/astrophotographies/mini/2024/997026_raw.jpg',
    'src/assets/astrophotographies/mini/2024/954054_raw.jpg',
    'src/assets/astrophotographies/mini/2024/906317_raw.jpg',
    'src/assets/astrophotographies/mini/2023/861116_raw.jpg',
].map((f) => path.join(ROOT, f));

/**
 * Standard Fisher-Yates shuffle algorithm.
 *
 * @param {Array} array - The array to shuffle.
 * @returns {Array} A new shuffled array.
 */
function shuffleArray(array) {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

/**
 * Interleaves and shuffles image lists to ensure balanced representation in the mosaic.
 *
 * @param {string[]} voyageImages - List of voyage covers.
 * @param {string[]} astroImages - List of astronomical mini images.
 * @param {number} totalCount - Required number of tiles.
 * @returns {string[]} A list of image paths ready for tiling.
 */
function prepareMosaicImages(voyageImages, astroImages, totalCount) {
    const interleaved = [];
    const maxLen = Math.max(voyageImages.length, astroImages.length);

    for (let i = 0; i < maxLen; i++) {
        if (i < voyageImages.length) interleaved.push(voyageImages[i]);
        if (i < astroImages.length) interleaved.push(astroImages[i]);
    }

    const shuffled = shuffleArray(interleaved);

    const result = [];
    while (result.length < totalCount) {
        result.push(...shuffleArray([...shuffled]));
    }

    return result.slice(0, totalCount);
}

/**
 * Generates a single hero mosaic based on a configuration object.
 *
 * @param {Object} config - Mosaic dimensions and layout.
 * @param {string[]} sourceImages - Pool of images to draw from.
 * @returns {Promise<string>} Path to the generated image.
 */
async function generateHeroMosaic(config, sourceImages) {
    const { name, width, height, cols, rows, tileW, tileH } = config;
    const tileCount = cols * rows;

    const imagesToUse = sourceImages.slice(0, tileCount);

    if (imagesToUse.length < tileCount) {
        console.warn(`[${name}] Warning: Only ${imagesToUse.length} images available, need ${tileCount}`);
    }

    const tileWidth = tileW;
    const tileHeight = tileH;

    console.log(`[${name}] Generating ${width}x${height} mosaic (${cols}x${rows} grid)`);

    const tiles = await Promise.all(
        imagesToUse.map(async (imagePath, index) => {
            const col = index % cols;
            const row = Math.floor(index / cols);

            const resizedBuffer = await sharp(imagePath)
                .resize(tileWidth, tileHeight, { fit: 'cover', position: 'center' })
                .toBuffer();

            return {
                input: resizedBuffer,
                left: col * tileWidth,
                top: row * tileHeight,
            };
        }),
    );

    // Create the composite image
    const outputPath = path.join(OUTPUT_DIR, `hero-${name}.jpg`);

    await sharp({
        create: {
            width,
            height,
            channels: 3,
            background: { r: 10, g: 10, b: 20 }, // Dark fallback color
        },
    })
        .composite(tiles)
        .jpeg({ quality: JPEG_QUALITY, progressive: true })
        .toFile(outputPath);

    console.log(`[${name}] ✓ Saved to ${outputPath}`);
    return outputPath;
}

/**
 * Main execution flow for generating all responsive hero mosaics.
 */
async function main() {
    console.log('='.repeat(60));
    console.log('Hero Mosaic Generator (Curated Images)');
    console.log('='.repeat(60));

    // Log curated images
    console.log(`\n[Voyage] Using ${VOYAGE_IMAGES.length} curated cover images`);
    console.log(`[Astro] Using ${ASTRO_IMAGES.length} curated mini images`);

    // Verify all files exist
    const allImages = [...VOYAGE_IMAGES, ...ASTRO_IMAGES];
    for (const img of allImages) {
        try {
            await sharp(img).metadata();
        } catch (error) {
            throw new Error(`Image not found: ${img}`, { cause: error });
        }
    }
    console.log(`✓ All ${allImages.length} images verified`);

    // Determine max images needed (largest grid)
    const maxTiles = Math.max(...HERO_CONFIGS.map((c) => c.cols * c.rows));
    const selectedImages = prepareMosaicImages(VOYAGE_IMAGES, ASTRO_IMAGES, maxTiles);
    console.log(`Prepared ${selectedImages.length} tile images`);

    // Generate each hero size
    console.log('\nGenerating hero images...\n');

    for (const config of HERO_CONFIGS) {
        await generateHeroMosaic(config, selectedImages);
    }

    console.log('\n' + '='.repeat(60));
    console.log('Done! Generated hero images:');
    HERO_CONFIGS.forEach((c) => console.log(`  - hero-${c.name}.jpg (${c.width}x${c.height})`));
    console.log('='.repeat(60));
}

main().catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
});
