/**
 * Image Service — Resolution & Loading
 *
 * Resolves image paths to either local ImageMetadata objects (via Astro glob)
 * or remote Cloudflare R2 URLs, depending on environment configuration.
 * Handles mini-image variants and local-only directory exceptions.
 */
import type { ImageMetadata } from 'astro';

/**
 * Returns the current image configuration based on environment variables.
 * Dynamic to allow mocking in tests.
 */
export function getImageConfig() {
    const FORCE_LOCAL_VALUES = [
        import.meta.env?.FORCE_LOCAL_IMAGES,
        import.meta.env?.PUBLIC_FORCE_LOCAL_IMAGES,
        process.env.FORCE_LOCAL_IMAGES,
        process.env.PUBLIC_FORCE_LOCAL_IMAGES,
    ];
    return {
        FORCE_LOCAL_IMAGES: FORCE_LOCAL_VALUES.some((v) => String(v).trim().toLowerCase() === 'true'),
        R2_URL: import.meta.env?.PUBLIC_R2_URL || process.env.PUBLIC_R2_URL || '',
    };
}

// Load all assets eagerly so we can resolve them synchronously
const localImages = import.meta.glob('/src/assets/**/*.{jpeg,jpg,png,gif,webp,svg}', { eager: true });

// Pre-computed dimensions for every R2-served image (built by
// scripts/build/compute-image-dimensions.mjs). Keyed by the path
// relative to src/assets/ — e.g. "voyages/2026/la-transylvanie/_dsc1042-hdr.jpg".
//
// Necessary because src/assets/{astrophotographies,voyages,blog}/ are
// .gitignored (synced from R2), so the glob below is empty in CI and
// we can't probe local files at build time. Without it, galleries
// fall back to hardcoded 3/2 and squish portrait images.
import imageDimensions from '@/data/image-dimensions.json';
import { LOCAL_ONLY_DIRS } from '@/config/imageConfig.mjs';
import { composeWorkerUrl } from './workerUrl';
import webImagesManifest from '@/data/web-images.json';
import {
    WEB_IMAGE_WIDTHS,
    getWebImageWidths,
    normalizeAssetKey,
    pickWebImageWidth,
    webImageUrl,
} from './webImages.mjs';
const imageDimensionsMap = imageDimensions as Record<string, { width: number; height: number }>;
const webImages = webImagesManifest as Record<string, number[]>;

/** Plus grand côté des `mini/` d'astrophotos (`MAX_SIZE` de scripts/pipeline/generate-mini.mjs). */
const MINI_MAX_SIDE = 1600;

export interface WebImageSet {
    /** Clé R2 de l'image source. */
    key: string;
    /** Versions disponibles, par largeur croissante. */
    candidates: { width: number; url: string }[];
    /** `srcset` correspondant. */
    srcset: string;
    /** URL de la plus petite version au moins aussi large que `width` (sinon la plus large). */
    pick: (width: number) => string;
}

/**
 * Versions web pré-générées d'une image (voir `src/utils/webImages.mjs`).
 *
 * Pour une `mini/` d'astrophoto, la mini elle-même (1 600 px) termine le `srcset` : la fiche d'une
 * photo garde sa définition sur écran haute densité, les cartes prennent 400 ou 800 px.
 *
 * @param path - Chemin relatif, `/assets/…`, clé R2 ou URL R2/worker de l'image source.
 * @param version - Paramètre `?v=` ajouté à chaque URL (invalidation du cache), facultatif.
 * @returns Les versions, ou `null` si l'image n'en a pas ou si `PUBLIC_R2_URL` n'est pas défini.
 */
export function getWebImageSet(path: string, version?: string): WebImageSet | null {
    const r2 = getImageConfig().R2_URL;
    if (!r2 || !path) return null;
    const worker = import.meta.env?.IMAGE_WORKER_URL || process.env.IMAGE_WORKER_URL || '';
    let candidatePath = path;
    if (candidatePath.startsWith(r2)) candidatePath = candidatePath.slice(r2.length);
    else if (worker && candidatePath.startsWith(worker)) {
        candidatePath = candidatePath.slice(worker.length).replace(/^\/[^/]+\//, '/');
    }
    const key = normalizeAssetKey(candidatePath);
    const widths = getWebImageWidths(webImages, key);
    if (!widths) return null;

    const versionQuery = version ? `?v=${version}` : '';
    const candidates = widths.map((width) => ({ width, url: `${webImageUrl(r2, key, width)}${versionQuery}` }));
    if (key.includes('/mini/')) {
        const original = getLocalImageDimensions(key);
        const miniWidth = original
            ? Math.round(original.width * Math.min(1, MINI_MAX_SIDE / Math.max(original.width, original.height)))
            : 0;
        if (miniWidth > widths[widths.length - 1]) {
            candidates.push({ width: miniWidth, url: `${r2.replace(/\/$/, '')}/${encodeURI(key)}${versionQuery}` });
        }
    }

    const candidateWidths = candidates.map((candidate) => candidate.width);
    return {
        key,
        candidates,
        srcset: candidates.map(({ width, url }) => `${url} ${width}w`).join(', '),
        pick: (width) => {
            const chosen = pickWebImageWidth(candidateWidths, width);
            return candidates.find((candidate) => candidate.width === chosen)!.url;
        },
    };
}

/**
 * Returns the intrinsic dimensions of a local image.
 *
 * Lookup order:
 *   1. The eager glob (works for tracked assets like a-propos/, index/, etc.)
 *   2. The pre-computed image-dimensions.json (works for git-ignored
 *      astrophoto, voyage and blog files; populated by
 *      scripts/build/compute-image-dimensions.mjs).
 *
 * Use this when you need to pin `width`/`height` (or compute an aspect
 * ratio) for a `<picture>` whose `src` is a remote worker URL — without
 * those attributes, the image loads with unreserved space and triggers
 * a layout shift (cf. docs/audits/2026-05-performance-audit.md §6.3).
 *
 * Returns null if neither lookup succeeds.
 */
export function getLocalImageDimensions(path: string | undefined | null): { width: number; height: number } | null {
    if (!path) return null;
    let cleanPath = path.replace(/^(\.\.?\/)+/, '');
    if (cleanPath.startsWith('/')) cleanPath = cleanPath.slice(1);
    if (cleanPath.startsWith('assets/')) cleanPath = `src/${cleanPath}`;
    else if (!cleanPath.startsWith('src/')) cleanPath = `src/assets/${cleanPath}`;

    // 1. Try the eager glob (committed assets only).
    const mod = localImages[`/${cleanPath}`] as { default: ImageMetadata } | undefined;
    if (mod?.default?.width && mod?.default?.height) {
        return { width: mod.default.width, height: mod.default.height };
    }

    // 2. Try the pre-computed JSON. Keys are relative to src/assets/.
    //    Also try without a "mini/" segment since the mini variant has
    //    the same aspect ratio as the original.
    const stripped = cleanPath.replace(/^src\/assets\//, '');
    const candidates = [stripped, stripped.replace('astrophotographies/mini/', 'astrophotographies/')];
    for (const key of candidates) {
        const cached = imageDimensionsMap[key];
        if (cached?.width && cached?.height) {
            return { width: cached.width, height: cached.height };
        }
    }

    return null;
}

/**
 * Checks if an image exists in the local assets.
 */
export function imageExists(path: string | undefined | null): boolean {
    if (!path) return false;
    let cleanPath = path.replace(/^(\.\.?\/)+/, '');
    if (cleanPath.startsWith('/')) {
        cleanPath = cleanPath.slice(1);
    }
    if (cleanPath.startsWith('assets/')) {
        cleanPath = `src/${cleanPath}`;
    } else if (!cleanPath.startsWith('src/')) {
        cleanPath = `src/assets/${cleanPath}`;
    }
    const key = `/${cleanPath}`;
    return !!localImages[key];
}

/**
 * Checks if an asset exists on R2.
 * ONLY intended for use at build-time (e.g. in getStaticPaths).
 *
 * WARNING: skipped entirely when FORCE_LOCAL_IMAGES is true to avoid
 * unnecessary network calls during local development.
 */
export async function remoteAssetExists(path: string): Promise<boolean> {
    const { R2_URL, FORCE_LOCAL_IMAGES } = getImageConfig();

    // Skip remote checks in local-dev mode — no network needed
    if (FORCE_LOCAL_IMAGES || !R2_URL || !path) return false;

    // Normalize path for R2
    let r2Path = path.replace(/^(\.\.?\/)+/, '');
    if (r2Path.startsWith('src/assets/')) {
        r2Path = r2Path.replace('src/assets/', '');
    } else if (r2Path.startsWith('assets/')) {
        r2Path = r2Path.replace('assets/', '');
    }

    const baseUrl = R2_URL.replace(/\/$/, '');
    const remoteUrl = `${baseUrl}/${r2Path}`;

    try {
        // 3s timeout to fail fast in restricted network environments
        const response = await fetch(remoteUrl, {
            method: 'HEAD',
            signal: AbortSignal.timeout(3000),
        });
        return response.ok;
    } catch (e) {
        // Log only unexpected failures (not timeouts in dev)
        const isTimeout = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
        if (!isTimeout) {
            console.warn(`[remoteAssetExists] Check failed for ${remoteUrl}:`, e);
        }
        return false;
    }
}

/**
 * Substitutes a blog/voyage R2 URL with its `-thumb` variant when one is
 * expected to exist on R2 (cf. compressImage in src/lib/admin/image-process.ts).
 *
 * Used by listing cards so the browser fetches a ~50 KB JPEG instead of the
 * full 500–900 KB HDR composite. The full image stays available at the
 * original URL for detail pages.
 *
 * Passes ImageMetadata (local Astro assets) through unchanged — only string
 * URLs (R2-served content) are transformed.
 */
export function toThumbUrl(src: ImageMetadata | string): ImageMetadata | string {
    if (typeof src !== 'string') return src;
    // Only swap when there's a recognizable extension; leave other strings alone.
    return src.replace(/(\.[a-z]+)$/i, '-thumb$1');
}

/**
 * Resolves an image path (e.g. "../../../assets/...")
 * to either a local ImageMetadata object or a remote R2 URL string.
 */
export function resolveImage(path: string, useMini: boolean = false, version?: string): ImageMetadata | string {
    if (!path) return '';

    // If it's already a remote URL, return as-is
    if (path.startsWith('http://') || path.startsWith('https://')) {
        return path;
    }

    // Normalize path to remove relative markers or leading slashes
    let cleanPath = path.replace(/^(\.\.?\/)+/, '');
    if (cleanPath.startsWith('/')) {
        cleanPath = cleanPath.slice(1);
    }

    // =========================================================================
    // These directories are committed to git and served directly by Astro's asset
    // pipeline. They are NOT synced to Cloudflare R2, so requesting them via R2_URL
    // would return a 404. Any new section whose assets stay in git must be added here.
    // =========================================================================
    const isLocalOnlyDir = LOCAL_ONLY_DIRS.some(
        (dir) => cleanPath.includes(`assets/${dir}/`) || cleanPath.includes(`/${dir}/`),
    );

    // Identify if it's an image that could have a mini version
    const isMiniCapable =
        (cleanPath.includes('astrophotographies/') || cleanPath.includes('assets/index/')) &&
        !cleanPath.includes('annotations/') &&
        !cleanPath.includes('mini/');

    // Get config dynamically (allows mocking in tests)
    const { FORCE_LOCAL_IMAGES, R2_URL } = getImageConfig();

    // If we force local, OR it's a local-only directory, OR don't have R2 URL → resolve locally
    if (FORCE_LOCAL_IMAGES || isLocalOnlyDir || !R2_URL) {
        let finalLocalPath = cleanPath;

        // Ensure it starts with "src/assets" for the glob key
        if (finalLocalPath.startsWith('assets/')) {
            finalLocalPath = `src/${finalLocalPath}`;
        } else if (!finalLocalPath.startsWith('src/')) {
            finalLocalPath = `src/assets/${finalLocalPath}`;
        }

        // Apply mini redirect if requested and applicable.
        // "mini" variants are pre-generated thumbnails (~300px) used in gallery grids
        // to avoid loading full-resolution images (often >5 MB) for layout purposes.
        if (useMini && isMiniCapable) {
            if (finalLocalPath.includes('astrophotographies/')) {
                finalLocalPath = finalLocalPath.replace('astrophotographies/', 'astrophotographies/mini/');
            } else if (finalLocalPath.includes('assets/index/')) {
                finalLocalPath = finalLocalPath.replace('assets/index/', 'assets/index/mini/');
            }
        }

        const key = `/${finalLocalPath}`;
        const mod = localImages[key] as { default: ImageMetadata } | undefined;

        if (mod && mod.default) {
            return mod.default;
        }

        // If mini not found, fallback to original
        if (useMini && isMiniCapable) {
            const originalPath = `/${cleanPath.startsWith('src/') ? cleanPath : cleanPath.startsWith('assets/') ? `src/${cleanPath}` : `src/assets/${cleanPath}`}`;
            const originalMod = localImages[originalPath] as { default: ImageMetadata } | undefined;
            if (originalMod && originalMod.default) {
                console.warn(`[resolveImage] Mini NOT found, falling back to original: ${originalPath}`);
                return originalMod.default;
            }
        }

        console.warn(`[resolveImage] Local image NOT found: ${key} (Input: ${path})`);
        return path;
    }

    // Remote R2 Logic
    let r2Path = cleanPath;

    // Remove 'assets/' or 'src/assets/' prefix if present for R2
    if (r2Path.startsWith('src/assets/')) {
        r2Path = r2Path.replace('src/assets/', '');
    } else if (r2Path.startsWith('assets/')) {
        r2Path = r2Path.replace('assets/', '');
    }

    // Apply mini redirect for R2
    if (useMini && isMiniCapable) {
        if (r2Path.includes('astrophotographies/')) {
            r2Path = r2Path.replace('astrophotographies/', 'astrophotographies/mini/');
        } else if (r2Path.includes('index/')) {
            r2Path = r2Path.replace('index/', 'index/mini/');
        }
    }

    const baseUrl = R2_URL.replace(/\/$/, '');
    let remoteUrl = `${baseUrl}/${r2Path}`;
    if (version) {
        remoteUrl += `?v=${version}`;
    }
    return remoteUrl;
}

/**
 * Builds a Cloudflare Images worker URL (e.g. images.miroirspolaires.fr/w_2400,q_85,f_jpeg/<key>)
 * from any asset path (relative markdown path, /assets/..., or full R2 URL).
 * Falls back to the input when the worker URL is not configured (local dev without IMAGE_WORKER_URL).
 *
 * NOTE: default format is "jpeg" — the worker's Photon WASM only does lossless
 * WebP which bloats files ~5×, and AVIF isn't supported. See docs/audits/2026-05-performance-audit.md §6.1.
 *
 * POURQUOI : Si l'image demandée est déjà une vignette pré-optimisée (`/mini/` ou `-thumb.jpg`),
 * la faire retraiter par le Worker via WASM (Photon) consomme inutilement le budget CPU Cloudflare
 * (limité à 10 ms sur l'offre gratuite) et provoque des erreurs HTTP 503 (images cassées).
 * On renvoie donc directement l'URL R2 de la vignette sans passer par le Worker.
 *
 * Une image qui a des versions web (`src/data/web-images.json`) est servie depuis R2 dans la plus
 * petite version au moins aussi large que `opts.width`. Au-delà de 1 200 px (visionneuse en
 * 2 400 px), on garde le worker, pour ne pas perdre de définition.
 *
 * @param inputPath - Chemin relatif de l'asset ou URL distante R2/Worker
 * @param opts - Options de redimensionnement et compression (width, quality, format)
 * @returns URL optimisée pour le Worker ou URL R2 directe pour les miniatures précalculées
 */
export function buildOptimizedUrl(
    inputPath: string,
    opts: { width: number; quality?: number; format?: 'webp' | 'avif' | 'jpeg' } = { width: 2400 },
): string {
    if (!inputPath) return '';

    if (opts.width <= WEB_IMAGE_WIDTHS[WEB_IMAGE_WIDTHS.length - 1]) {
        const webImageSet = getWebImageSet(inputPath);
        if (webImageSet) return webImageSet.pick(opts.width);
    }

    // Détection des miniatures déjà précalculées
    const isAlreadyThumbnail = inputPath.includes('/mini/') || inputPath.includes('-thumb.');

    if (inputPath.startsWith('http://') || inputPath.startsWith('https://')) {
        const worker = import.meta.env?.IMAGE_WORKER_URL || process.env.IMAGE_WORKER_URL || '';
        const r2 = import.meta.env?.PUBLIC_R2_URL || process.env.PUBLIC_R2_URL || '';

        // Si c'est déjà une vignette sur R2, on la retourne directement
        if (isAlreadyThumbnail && r2 && inputPath.startsWith(r2)) {
            return inputPath;
        }

        // If it's already a worker URL, strip the existing transform and re-apply.
        if (worker && inputPath.startsWith(worker)) {
            const tail = inputPath.replace(worker, '').replace(/^\/[^/]+\//, '/');
            if (isAlreadyThumbnail) {
                return r2 ? `${r2.replace(/\/$/, '')}${tail}` : tail;
            }
            return composeWorker(tail, opts);
        }
        if (r2 && inputPath.startsWith(r2)) {
            return composeWorker(inputPath.replace(r2, ''), opts);
        }
        return inputPath;
    }

    let clean = inputPath.replace(/^(\.\.?\/)+/, '');
    if (clean.startsWith('src/assets/')) clean = clean.slice('src/assets/'.length);
    else if (clean.startsWith('assets/')) clean = clean.slice('assets/'.length);
    if (!clean.startsWith('/')) clean = '/' + clean;

    if (isAlreadyThumbnail) {
        const r2 = import.meta.env?.PUBLIC_R2_URL || process.env.PUBLIC_R2_URL || '';
        return r2 ? `${r2.replace(/\/$/, '')}${clean}` : clean;
    }

    return composeWorker(clean, opts);
}

function composeWorker(
    keyWithSlash: string,
    opts: { width: number; quality?: number; format?: 'webp' | 'avif' | 'jpeg' },
): string {
    const worker = import.meta.env?.IMAGE_WORKER_URL || process.env.IMAGE_WORKER_URL || '';
    const r2 = import.meta.env?.PUBLIC_R2_URL || process.env.PUBLIC_R2_URL || '';
    if (!worker) {
        // No worker configured: best effort fallback to R2 direct.
        return r2 ? `${r2.replace(/\/$/, '')}${keyWithSlash}` : keyWithSlash;
    }
    return composeWorkerUrl(worker, keyWithSlash, opts);
}
