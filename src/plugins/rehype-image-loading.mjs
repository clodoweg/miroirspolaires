/**
 * Rehype Image Loading Plugin
 *
 * Sets loading="eager" on the first N images (configurable via env)
 * and "lazy" on the rest. Also rewrites `/assets/` paths to be relative
 * to the markdown file so Astro can process them as local assets.
 */
import { visit } from 'unist-util-visit';
import path from 'node:path';

/**
 * Creates a rehype plugin that applies eager/lazy loading strategies to images.
 * @returns {Function} Rehype transformer
 */
export function rehypeImageLoading() {
    return (tree, file) => {
        let imgCount = 0;

        visit(tree, 'element', (node) => {
            if (node.tagName === 'img') {
                const src = node.properties.src;

                const alt = node.properties.alt || '';
                const is360 =
                    (typeof alt === 'string' && alt.startsWith('360:')) ||
                    (typeof src === 'string' && src.includes('#360'));

                if (is360 && typeof src === 'string') {
                    // POURQUOI : Les photos 360° (photosphères) sont chargées par WebGL (Pannellum)
                    // et doivent pointer directement vers Cloudflare R2 (avec CORS activé) en production
                    // pour éviter les 404 sur les serveurs Vercel.
                    const r2Base = process.env.PUBLIC_R2_URL || 'https://pub-r2.miroirspolaires.fr';
                    const cleanPath = src
                        .replace(/^(\.\.\/)+/, '')
                        .replace(/^\/?assets\//, '')
                        .replace(/#360$/, '');
                    const r2Url = `${r2Base.replace(/\/$/, '')}/${cleanPath}`;

                    node.properties.src = r2Url;
                    node.properties['data-full-src'] = r2Url;
                    node.properties['data-is-360'] = 'true';
                } else if (typeof src === 'string' && src.startsWith('/assets/')) {
                    if (file && file.path) {
                        try {
                            const currentDir = path.dirname(file.path);
                            // Assuming project root is process.cwd()
                            const assetsDir = path.join(process.cwd(), 'src/assets');
                            const relativePathToAssets = path.relative(currentDir, assetsDir);

                            // Reconstruct the path
                            // /assets/blog/2022/... -> relative/blog/2022/...
                            // we strip /assets/ (first 8 chars)
                            const pathSuffix = src.substring(8);
                            const newSrc = path.join(relativePathToAssets, pathSuffix);

                            node.properties.src = newSrc;

                            // Fallback logic for worker errors (QUIC protocol error reported)
                            // We set data-fallback-src to the same relative path.
                            // If Astro/Remark transforms the src to a worker URL, the fallback will remain as the relative local path (or whatever Astro resolves it to).
                            // This gives us a safety net.
                            node.properties['data-fallback-src'] = newSrc;
                            node.properties.onerror =
                                "this.onerror=null; console.warn('[Fallback Triggered]', this.dataset.fallbackSrc); this.src=this.dataset.fallbackSrc || this.src;";

                            // console.log(`[rehype-image-loading] Rewrote ${src} to ${newSrc}`);
                        } catch (e) {
                            console.error('[rehype-image-loading] Error rewriting path:', e);
                        }
                    }
                }

                // Determine loading strategy — in markdown articles, only the 1st inline image
                // should be eager (if any); all subsequent body images must be lazy-loaded
                // to avoid bandwidth contention with the page LCP image.
                if (imgCount < 1) {
                    node.properties.loading = 'eager';
                } else {
                    node.properties.loading = 'lazy';
                    node.properties.fetchpriority = 'low';
                }

                imgCount++;
            }
        });
    };
}
