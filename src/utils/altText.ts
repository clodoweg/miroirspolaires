import altDataRaw from '../data/alt.json';
import type { ImageMetadata } from 'astro';

const altData = altDataRaw as Record<string, string>;

/**
 * Retrieves the alt text for a given image source from the central database.
 *
 * @param src - The image source (string path or ImageMetadata object)
 * @param fallback - Optional fallback text if no entry is found
 * @returns The resolved alt text
 */
export function getAltText(src: string | ImageMetadata | null | undefined, fallback: string = ''): string {
    if (!src) return fallback;

    let pathStr = '';

    if (typeof src === 'string') {
        pathStr = src;
    } else if ('src' in src) {
        pathStr = src.src;
    }

    // Normalize path to match keys in alt.json (which are like "/assets/path/to/image.jpg")
    // Input might be:
    // - "../assets/foo.jpg"
    // - "/src/assets/foo.jpg"
    // - "/_astro/foo.hash.jpg" (in build? hard to map back, but usually we deal with src inputs)
    // - "https://domain.com/assets/foo.jpg"

    // 1. Remove query params
    pathStr = pathStr.split('?')[0];

    // 2. Keep the part starting with '/assets/' (also covers 'src/assets/…', which contains it).
    const assetsIndex = pathStr.indexOf('/assets/');
    if (assetsIndex !== -1) {
        pathStr = pathStr.substring(assetsIndex);
    }

    // Ensure it starts with /assets/
    if (!pathStr.startsWith('/assets/')) {
        // Try fallback: maybe it's a relative path relative to project root?
        // difficult to guess.
        // Let's check if the raw path exists as a key just in case
        if (altData[pathStr]) return altData[pathStr];

        return fallback;
    }

    // Exact match check
    if (altData[pathStr]) {
        return altData[pathStr];
    }

    // Sometimes keys in json might be encoded or decoded differently?
    // Keys in json seem to be plain paths.

    return fallback;
}
