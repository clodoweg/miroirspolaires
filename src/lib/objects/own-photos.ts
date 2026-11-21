/**
 * Match a resolved object against the user's astrophotography catalogue.
 *
 * Strategy: extract identifier-like tokens from each photo (objects in field
 * + title) and require strict equality with one of the resolved aliases,
 * after normalising spaces, dashes and accents. Returns all matches sorted
 * by year (most recent first), each with a ready-to-render thumbnail URL.
 */

import { photos, type Photo } from '@/lib/photos';
import type { OwnPhotoLink } from './types';
import { foldAccents } from '@/utils/normalize';
import webImagesManifest from '@/data/web-images.json';
import { getWebImageWidths, pickWebImageWidth, webImageUrl } from '@/utils/webImages.mjs';

const R2_URL = import.meta.env.PUBLIC_R2_URL || process.env.PUBLIC_R2_URL || '';
const webImages = webImagesManifest as Record<string, number[]>;

const normalize = (s: string): string =>
    foldAccents(s)
        .replace(/[\s_-]+/g, '')
        .trim();

/** Aliases shorter than this are ignored to avoid catastrophic false positives. */
const MIN_ALIAS_LEN = 3;

/**
 * Tokenise a free-form title like "Galaxie d'Andromède (M31)" into the small
 * set of identifier-like tokens it contains. We split on punctuation and
 * whitespace, normalise each fragment, and keep tokens that look like a
 * catalogue identifier (contain at least one digit OR look like a name).
 */
function extractTitleTokens(title: string): string[] {
    if (!title) return [];
    const parts = title.split(/[(),;:·\-–—/\\[\]"'!?]+|\s+/);
    return parts.map(normalize).filter((t) => t.length >= MIN_ALIAS_LEN);
}

function buildPhotoTokens(p: Photo): Set<string> {
    const out = new Set<string>();
    // Curated identifiers from CSV — these are reliable catalogue refs.
    for (const obj of p.objectsInField) {
        const n = normalize(obj);
        if (n.length >= MIN_ALIAS_LEN) out.add(n);
    }
    // Title tokens — looser, used as a fallback.
    for (const tok of extractTitleTokens(p.title)) out.add(tok);
    return out;
}

/**
 * Vignette d'une astrophoto pour la carte « vos photos ».
 *
 * WARNING: ne jamais viser l'original (`astrophotographies/<année>/…_raw.jpg`) : au-delà de 500 Ko,
 * le worker le renvoie entier, soit des dizaines de Mo pour une vignette (71,7 Mo mesurés pour
 * M42). On sert la version web de 400 px de la mini/ si elle existe, sinon la mini/ elle-même.
 * Pas d'import de `imageService.ts` ici : son `import.meta.glob` de tous les assets alourdirait la
 * fonction serverless de /api/object/resolve.
 *
 * @param imagePath - Chemin `<année>/<id>_raw.jpg` de la photo.
 * @param version - Paramètre `?v=` d'invalidation du cache, facultatif.
 * @returns L'URL, ou `undefined` sans `PUBLIC_R2_URL`.
 */
function buildThumbUrl(imagePath: string, version: string): string | undefined {
    if (!R2_URL) return undefined;
    const miniKey = `astrophotographies/mini/${imagePath}`;
    const widths = getWebImageWidths(webImages, miniKey);
    const url = widths
        ? webImageUrl(R2_URL, miniKey, pickWebImageWidth(widths, 400))
        : `${R2_URL.replace(/\/$/, '')}/${miniKey}`;
    return version ? `${url}?v=${version}` : url;
}

/**
 * Find every own photo whose tokens match any of the resolved aliases,
 * sorted most recent first.
 */
export function findOwnPhotos(aliases: string[]): OwnPhotoLink[] {
    const normalized = new Set(aliases.map(normalize).filter((a) => a.length >= MIN_ALIAS_LEN));
    if (!normalized.size) return [];

    const matches: OwnPhotoLink[] = [];
    for (const photo of photos) {
        const tokens = buildPhotoTokens(photo);
        let hit = false;
        for (const tok of tokens) {
            if (normalized.has(tok)) {
                hit = true;
                break;
            }
        }
        if (!hit) continue;
        matches.push({
            slug: photo.slug,
            title: photo.title,
            href: `/astrophotographies/${photo.slug}`,
            imagePath: photo.imagePath,
            year: photo.year,
            thumbnailUrl: buildThumbUrl(photo.imagePath, photo.version),
        });
    }

    return matches.sort((a, b) => b.year - a.year);
}
