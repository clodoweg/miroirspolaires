/**
 * Rehype Masonry Plugin
 *
 * Transforms paragraphs containing multiple images into responsive masonry
 * galleries with Cloudflare Worker optimization, srcset generation, and
 * R2 fallback. Also handles caption extraction and image dimension probing.
 */
import { visit } from 'unist-util-visit';
import probe from 'probe-image-size';
import 'dotenv/config';
import { createRequire } from 'node:module';
import { IMAGE_CONFIG } from '../config/imageConfig.mjs';
import { buildWebImageSrcset, getWebImageWidths, pickWebImageWidth, webImageUrl } from '../utils/webImages.mjs';

// POURQUOI : createRequire plutôt que `import … with { type: 'json' }`, qui a cassé le déploiement
// Vercel (voir rehype-probe-dimensions.mjs). Le chemin est relatif à ce fichier.
const require = createRequire(import.meta.url);
const WEB_IMAGES = require('../data/web-images.json');

function getR2Url(src, options) {
    const r2Base =
        options?.r2Url || process.env.PUBLIC_R2_URL || process.env.R2_URL || 'https://pub-r2.miroirspolaires.fr';
    const cleanPath = src.replace(/^(\.\.\/)+/, '');
    let assetPath = cleanPath.startsWith('/') ? cleanPath.slice(1) : cleanPath;
    if (assetPath.startsWith('assets/')) {
        assetPath = assetPath.replace('assets/', '');
    }
    return `${r2Base}/${assetPath}`;
}

const sizeCache = new Map();

async function probeImage(node, options) {
    if (node.properties.width && node.properties.height) return; // Already has dimensions

    const src = node.properties.src;
    if (!src || src.startsWith('http') || src.startsWith('//') || src.startsWith('data:')) return;

    // Construct the URL to probe
    const probeUrl = getR2Url(src, options);

    if (sizeCache.has(probeUrl)) {
        const { width, height } = sizeCache.get(probeUrl);
        node.properties.width = width;
        node.properties.height = height;
        return;
    }

    try {
        const result = await probe(probeUrl, { timeout: 2000 });
        if (result) {
            node.properties.width = result.width;
            node.properties.height = result.height;
            sizeCache.set(probeUrl, { width: result.width, height: result.height });
        }
    } catch {
        // console.warn(`[rehype-masonry] Failed to probe image ${probeUrl}: ${e.message}`);
    }
}

function hastToHtml(nodes) {
    if (!nodes) return '';
    if (!Array.isArray(nodes)) nodes = [nodes];
    return nodes
        .map((node) => {
            if (node.type === 'text') {
                return node.value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            }
            if (node.type === 'element') {
                const props = Object.entries(node.properties || {})
                    .map(([k, v]) => {
                        const val = Array.isArray(v) ? v.join(' ') : v;
                        // handle special case like className -> class in HTML output
                        const key = k === 'className' ? 'class' : k;
                        return `${key}="${String(val).replace(/"/g, '&quot;')}"`;
                    })
                    .join(' ');
                const tag = node.tagName;
                const content = hastToHtml(node.children || []);
                return `<${tag}${props ? ' ' + props : ''}>${content}</${tag}>`;
            }
            return '';
        })
        .join('');
}

function transformImage(node, isGrid, options, caption = null, captionNodes = []) {
    if (node.tagName !== 'img') return;

    if (captionNodes && captionNodes.length > 0 && typeof captionNodes[0] !== 'undefined') {
        // WARNING: Debug-only logging for caption node inspection
    }

    const src = node.properties.src;
    if (!src || src.startsWith('data:')) return;

    // Worker is primary, R2 is fallback on error
    const useR2 = options?.useR2 === true;
    const imageWorkerUrl =
        options?.imageWorkerUrl || process.env.IMAGE_WORKER_URL || 'https://image-resizer.clodoweg.workers.dev';

    // Extract asset path from various URL formats
    let assetPath = '';

    // Check if this is a worker URL that needs conversion to R2
    if (src.includes('images.miroirspolaires.fr') || src.includes('image-resizer.clodoweg.workers.dev')) {
        // Extract path from worker URL: https://images.../w_xxx,q_xxx,f_xxx/path/to/image.jpg
        const match = src.match(/\/w_\d+,q_\d+,f_\w+\/(.+)$/);
        if (match) {
            assetPath = match[1];
        }
    } else if (src.startsWith('http') || src.startsWith('//')) {
        // Other HTTP URLs - skip
        return;
    } else {
        // Local path
        const cleanPath = src.replace(/^(\.\.\/)+/, '');
        assetPath = cleanPath.startsWith('/') ? cleanPath.slice(1) : cleanPath;
        if (assetPath.startsWith('assets/')) {
            assetPath = assetPath.replace('assets/', '');
        }
    }

    if (!assetPath) return;

    // Checking for FORCE_LOCAL_IMAGES
    const forceLocal = process.env.FORCE_LOCAL_IMAGES === 'true' || process.env.PUBLIC_FORCE_LOCAL_IMAGES === 'true';

    if (forceLocal) {
        // Just add classes and caption, assume standard Astro handling for src
        node.properties.className = node.properties.className || [];
        if (!Array.isArray(node.properties.className)) node.properties.className = [node.properties.className];
        if (!node.properties.className.includes('gallery-image')) {
            node.properties.className.push('gallery-image');
        }
        node.properties.className.push('cursor-pointer', 'rounded-lg', 'object-cover');

        if (caption) {
            node.properties['data-caption'] = caption;
            if (captionNodes && captionNodes.length > 0) {
                node.properties['data-caption-safe-markup'] = encodeURIComponent(hastToHtml(captionNodes));
            }
        }

        return;
    }

    if (useR2) {
        // Fallback to direct R2 URL (no resizing)
        const newUrl = getR2Url(src, options);

        node.properties.src = newUrl;
        node.properties.dataset = node.properties.dataset || {};
        node.properties.dataset.fullSrc = newUrl;
        node.properties['data-full-src'] = newUrl;
        if (caption) {
            node.properties['data-caption'] = caption;
            if (captionNodes && captionNodes.length > 0) {
                node.properties['data-caption-safe-markup'] = encodeURIComponent(hastToHtml(captionNodes));
            }
        }

        // Classes
        node.properties.className = node.properties.className || [];
        if (!Array.isArray(node.properties.className)) node.properties.className = [node.properties.className];
        if (!node.properties.className.includes('gallery-image')) {
            node.properties.className.push('gallery-image');
        }
        node.properties.className.push('cursor-pointer', 'rounded-lg', 'object-cover');

        return;
    }

    if (imageWorkerUrl) {
        const workerBase = imageWorkerUrl.replace(/\/$/, '');

        // Quality settings (split desktop/mobile) from config
        const desktopQuality = IMAGE_CONFIG.QUALITY.DESKTOP;
        const mobileQuality = IMAGE_CONFIG.QUALITY.MOBILE;

        // Widths from config
        const widths = IMAGE_CONFIG.WIDTHS;

        // Generate srcsets.
        // NOTE: f_jpeg (not f_webp) — the worker's Photon WASM only encodes
        // lossless WebP which bloats files ~5×. See docs/audits/2026-05-performance-audit.md §6.1.
        let desktopSrcset = widths
            .map((width) => `${workerBase}/w_${width},q_${desktopQuality},f_jpeg/${assetPath} ${width}w`)
            .join(', ');
        let mobileSrcset = widths
            .map((width) => `${workerBase}/w_${width},q_${mobileQuality},f_jpeg/${assetPath} ${width}w`)
            .join(', ');
        let defaultSrc = `${workerBase}/w_${IMAGE_CONFIG.DEFAULT_WIDTH},q_${desktopQuality},f_jpeg/${assetPath}`;

        // POURQUOI : si l'image a des versions web 400/800/1200 px sur R2 (src/data/web-images.json),
        // les servir directement : le worker renverrait l'original au-delà de 500 Ko ou 1,8 MP.
        const webImageWidths = getWebImageWidths(WEB_IMAGES, assetPath);
        if (webImageWidths) {
            const r2Base = getR2Url('', options).replace(/\/$/, '');
            desktopSrcset = buildWebImageSrcset(r2Base, assetPath, webImageWidths);
            mobileSrcset = desktopSrcset;
            defaultSrc = webImageUrl(r2Base, assetPath, pickWebImageWidth(webImageWidths, IMAGE_CONFIG.DEFAULT_WIDTH));
        }

        const sizes = isGrid ? IMAGE_CONFIG.SIZES.GRID : IMAGE_CONFIG.SIZES.DEFAULT;

        // ... (rest of the logic remains the same)

        // Fallback Logic
        const r2FallbackUrl = getR2Url(src, options);

        // Classes for the img element
        const imgClasses = ['gallery-image', 'cursor-pointer', 'rounded-lg', 'object-cover'];

        // Transform the img node into a picture element structure
        // First, store original properties we want to keep
        const alt = node.properties.alt || '';
        const width = node.properties.width;
        const height = node.properties.height;

        // Determine loading strategy: Lazy if we have dimensions, Eager otherwise (for masonry layout safety)
        // Auto-eager load first 6 images logic is handled in rehype-image-loading, not here.
        // Here we just ensure we have "some" loading attribute if missing.
        const loadingStrategy = width && height ? 'lazy' : 'eager';

        // Create the img element that will be inside picture
        // Worker URL for optimization, R2 as fallback
        if (captionNodes && captionNodes.length > 0) {
            // console.log("!!! SETTING data-caption-safe-markup to !!!", encodeURIComponent(hastToHtml(captionNodes)));
        }

        const imgNode = {
            type: 'element',
            tagName: 'img',
            properties: {
                src: defaultSrc, // Worker URL for optimization (Desktop quality default)
                alt: alt,
                width: width,
                height: height,
                sizes: sizes, // Keep sizes for the img tag too
                'data-full-src': r2FallbackUrl,
                'data-fallback-src': r2FallbackUrl,
                ...(caption ? { 'data-caption': caption } : {}),
                ...(captionNodes && captionNodes.length > 0
                    ? { 'data-caption-safe-markup': encodeURIComponent(hastToHtml(captionNodes)) }
                    : {}),
                className: imgClasses,
                loading: loadingStrategy,
            },
            children: [],
        };

        // POURQUOI : pas de gestionnaire `onerror`/`onload` inline (refusés par la CSP sans `'unsafe-inline'`).
        // Le repli vers `data-fallback-src` (retrait des <source>, bascule sur R2) est assuré par l'écouteur
        // `error`/`load` en capture posé dans le <head> de BaseLayout.astro.

        // Mobile Source (< 768px) - Quality form Config
        const mobileSource = {
            type: 'element',
            tagName: 'source',
            properties: {
                media: '(max-width: 767px)',
                type: 'image/jpeg',
                srcset: mobileSrcset,
                sizes: sizes,
                width: width,
                height: height,
            },
            children: [],
        };

        // Desktop Source (>= 768px) - Quality from Config
        const desktopSource = {
            type: 'element',
            tagName: 'source',
            properties: {
                media: '(min-width: 768px)',
                type: 'image/jpeg',
                srcset: desktopSrcset,
                sizes: sizes,
                width: width,
                height: height,
            },
            children: [],
        };

        // Transform the current img node into a picture element
        // Transform the current img node into a picture element
        node.tagName = 'picture';
        node.properties = {};
        // Add children in correct order for standard behavior -> <source>, <img>
        node.children = [];
        if (mobileSource) node.children.push(mobileSource);
        if (desktopSource) node.children.push(desktopSource);
        node.children.push(imgNode);
    }
}

/**
 * Creates a rehype plugin that transforms image-heavy paragraphs into
 * responsive masonry galleries with Worker-based optimization.
 * @param {Object} options - Plugin options (r2Url, imageWorkerUrl, etc.)
 * @returns {Function} Rehype async transformer
 */
export function rehypeMasonry(options) {
    return async (tree, file) => {
        let hideImageCaptions = false;
        if (file?.data?.astro?.frontmatter) {
            hideImageCaptions = file.data.astro.frontmatter.hideImageCaptions === true;
        } else if (file?.path) {
            try {
                const fs = await import('node:fs');
                if (fs.existsSync(file.path)) {
                    const content = fs.readFileSync(file.path, 'utf8');
                    const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
                    if (match) {
                        const fm = match[1].replace(/\r/g, '');
                        const hideMatch = fm.match(/^hideImageCaptions\s*:\s*(true|false)/m);
                        if (hideMatch) {
                            hideImageCaptions = hideMatch[1] === 'true';
                        }
                    }
                }
            } catch {
                // ignore
            }
        }

        const paragraphs = [];
        visit(tree, 'element', (node, index, parent) => {
            if (node.tagName === 'p') {
                paragraphs.push({ node, index, parent });
            }
        });

        await Promise.all(
            paragraphs.map(async ({ node, index, parent }) => {
                const children = node.children;
                let imagesData = [];
                let isGalleryCandidate = true;
                let processedIndices = new Set();

                for (let i = 0; i < children.length; i++) {
                    if (processedIndices.has(i)) continue;

                    const child = children[i];
                    if (child.type === 'text') {
                        if (child.value.trim().length > 0) isGalleryCandidate = false;
                    } else if (child.type === 'comment') {
                        // ignore
                    } else if (child.type === 'element') {
                        if (child.tagName === 'img') {
                            // POURQUOI : Les images 360° (photosphères) ne doivent jamais être groupées en grille masonry
                            // afin de pouvoir être rendues sous forme de visualiseur panoramique pleine largeur interactif.
                            const is360 =
                                (child.properties?.alt && String(child.properties.alt).startsWith('360:')) ||
                                (child.properties?.src && String(child.properties.src).includes('#360'));
                            if (is360) {
                                isGalleryCandidate = false;
                                break;
                            }

                            let caption = '';
                            let captionNodes = [];
                            let j = i + 1;
                            let localIndices = [];
                            while (j < children.length) {
                                const nextNode = children[j];
                                if (
                                    nextNode.type === 'element' &&
                                    (nextNode.tagName === 'br' || nextNode.tagName === 'img')
                                )
                                    break;
                                let isContent = false;
                                if (nextNode.type === 'text') {
                                    if (nextNode.value.trim().length > 0 || caption.length > 0) isContent = true;
                                } else {
                                    isContent = true;
                                }
                                if (isContent) {
                                    captionNodes.push(nextNode);
                                    localIndices.push(j);
                                    if (nextNode.type === 'text') caption += nextNode.value;
                                    else if (nextNode.type === 'element') {
                                        if (['a', 'strong', 'em', 'code', 'span'].includes(nextNode.tagName)) {
                                            const getText = (n) => {
                                                if (n.type === 'text') return n.value;
                                                if (n.children) return n.children.map(getText).join('');
                                                return '';
                                            };
                                            caption += getText(nextNode);
                                        }
                                    }
                                }
                                j++;
                            }
                            caption = caption.trim();
                            if (caption.length === 0) {
                                caption = null;
                                captionNodes = [];
                            } else {
                                localIndices.forEach((idx) => processedIndices.add(idx));
                            }
                            imagesData.push({ node: child, caption, captionNodes });
                        } else if (child.tagName === 'br') {
                            // ignore
                        } else if (child.tagName === 'a') {
                            const linkChildren = child.children.filter(
                                (n) => !(n.type === 'text' && n.value.trim().length === 0),
                            );
                            if (
                                linkChildren.length === 1 &&
                                linkChildren[0].type === 'element' &&
                                linkChildren[0].tagName === 'img'
                            ) {
                                let caption = '';
                                let captionNodes = [];
                                let j = i + 1;
                                let localIndices = [];
                                while (j < children.length) {
                                    const nextNode = children[j];
                                    if (
                                        nextNode.type === 'element' &&
                                        (nextNode.tagName === 'br' || nextNode.tagName === 'img')
                                    )
                                        break;
                                    let isContent = false;
                                    if (nextNode.type === 'text') {
                                        if (nextNode.value.trim().length > 0 || caption.length > 0) isContent = true;
                                    } else {
                                        isContent = true;
                                    }
                                    if (isContent) {
                                        captionNodes.push(nextNode);
                                        localIndices.push(j);
                                        if (nextNode.type === 'text') caption += nextNode.value;
                                        else if (nextNode.type === 'element') {
                                            if (['a', 'strong', 'em', 'code', 'span'].includes(nextNode.tagName)) {
                                                const getText = (n) => {
                                                    if (n.type === 'text') return n.value;
                                                    if (n.children) return n.children.map(getText).join('');
                                                    return '';
                                                };
                                                caption += getText(nextNode);
                                            }
                                        }
                                    }
                                    j++;
                                }
                                caption = caption.trim();
                                if (caption.length === 0) {
                                    caption = null;
                                    captionNodes = [];
                                } else {
                                    localIndices.forEach((idx) => processedIndices.add(idx));
                                }
                                imagesData.push({
                                    node: linkChildren[0],
                                    caption,
                                    captionNodes,
                                    isLinkWrapper: true,
                                    linkNode: child,
                                });
                            } else {
                                isGalleryCandidate = false;
                            }
                        } else {
                            isGalleryCandidate = false;
                        }
                    }
                }

                if (imagesData.length > 0) {
                    const isGrid = isGalleryCandidate && imagesData.length >= 2;

                    await Promise.all(imagesData.map((d) => probeImage(d.node, options)));

                    imagesData.forEach(({ node: img, caption, captionNodes }) => {
                        try {
                            transformImage(img, isGrid, options, caption, captionNodes);
                        } catch {
                            // POURQUOI : une image mal formée ne doit pas faire échouer le build ; elle reste non transformée.
                        }
                    });

                    if (isGrid) {
                        if (parent && index !== undefined) {
                            const newChildren = node.children.filter((n, idx) => {
                                if (processedIndices.has(idx)) return false;
                                if (n.type === 'text' && !n.value.trim()) return false;
                                return true;
                            });
                            node.tagName = 'div';
                            node.properties.className = ['justified-gallery', 'not-prose'];
                            node.children = newChildren;
                        }
                    } else {
                        let newParagraphChildren = [];
                        for (let i = 0; i < children.length; i++) {
                            if (processedIndices.has(i)) continue;
                            const processingData = imagesData.find((d) =>
                                d.isLinkWrapper ? d.linkNode === children[i] : d.node === children[i],
                            );
                            if (processingData && processingData.captionNodes.length > 0) {
                                if (hideImageCaptions) {
                                    newParagraphChildren.push(children[i]);
                                } else {
                                    const figure = {
                                        type: 'element',
                                        tagName: 'figure',
                                        properties: {
                                            className: ['table', 'mx-auto', 'max-w-full'],
                                        },
                                        children: [
                                            children[i],
                                            {
                                                type: 'element',
                                                tagName: 'figcaption',
                                                properties: {
                                                    className: [
                                                        'table-caption',
                                                        'caption-bottom',
                                                        'text-center',
                                                        'italic',
                                                        'text-sm',
                                                        'text-mp-text-muted',
                                                        'mt-2',
                                                    ],
                                                },
                                                children: processingData.captionNodes,
                                            },
                                        ],
                                    };
                                    newParagraphChildren.push(figure);
                                }
                            } else {
                                if (children[i]) newParagraphChildren.push(children[i]);
                            }
                        }
                        node.children = newParagraphChildren;
                        const hasFigure = newParagraphChildren.some((n) => n.tagName === 'figure');
                        if (hasFigure) {
                            node.tagName = 'div';
                        }
                    }
                }
            }),
        );
    };
}
