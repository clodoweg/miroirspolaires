/**
 * Rehype Probe Dimensions Plugin
 *
 * Reads physical width/height from local image files via probe-image-size
 * and injects them on `<img>` nodes that don't already carry them. Without
 * this, markdown-embedded images render with no intrinsic ratio — Tailwind
 * `object-cover` + zero-height container = invisible image, only the alt
 * text shows with a broken-icon placeholder (observed 2026-05-25 on
 * /blog/2025/sermilik on Vercel CI where src/assets/blog/ is .gitignored
 * and the disk probe returns nothing).
 *
 * Must run BEFORE rehype-masonry so the dimensions get propagated to the
 * <picture><source><img> structure it produces.
 *
 * Lookup order:
 *   1. Already has width+height → keep.
 *   2. Local disk via probe-image-size (works in dev).
 *   3. Pre-computed src/data/image-dimensions.json (works in CI; produced
 *      by scripts/build/compute-image-dimensions.mjs).
 *   4. Give up — masonry will fall back to its own R2 probe.
 */
import { visit } from 'unist-util-visit';
import probe from 'probe-image-size';
import fs from 'node:fs';
import path from 'node:path';

import { createRequire } from 'node:module';

// JSON loaded via createRequire — works in both Node 18 (Vercel default
// LTS) and 20+ regardless of import-attributes support. `import ... with
// { type: 'json' }` failed in Vercel CI (deploy 3c15fe7); the inline
// markdown images on /blog/2025/sermilik never got width/height. The
// require path is relative to *this file*, not cwd, so it survives
// whatever working directory the Astro build runs from.
const require = createRequire(import.meta.url);
const DIMS_MAP = require('../data/image-dimensions.json');
// One-line diagnostic so Vercel build logs reveal whether the JSON is
// actually being loaded. If this prints `entries=0` we know the require
// is silently returning an empty object instead of the committed file.
console.log(`[rehype-probe-dimensions] loaded JSON entries=${Object.keys(DIMS_MAP).length}`);

/** Try `image-dimensions.json` for `src` (markdown reference). Returns null
 *  on miss. Keys in the JSON are normalised to "subdir/file.jpg" relative
 *  to src/assets/. */
function lookupJson(src) {
    if (!src) return null;
    let key = src.replace(/^(\.\.?\/)+/, '');
    if (key.startsWith('/')) key = key.slice(1);
    if (key.startsWith('src/assets/')) key = key.slice('src/assets/'.length);
    else if (key.startsWith('assets/')) key = key.slice('assets/'.length);
    const dims = DIMS_MAP[key];
    return dims?.width && dims?.height ? dims : null;
}

const warned = new Set();

function warnOnce(key, msg) {
    if (warned.has(key)) return;
    warned.add(key);
    console.warn(`[rehype-probe-dimensions] ${msg}`);
}

/** @returns {import('unified').Plugin} */
export function rehypeProbeDimensions() {
    return (tree, file) => {
        if (!file?.path) return;
        const mdDir = path.dirname(file.path);

        let imgCount = 0;
        let setCount = 0;
        let firstFewSrcs = [];
        visit(tree, 'element', (node) => {
            if (node.tagName !== 'img') return;
            const props = node.properties || {};
            imgCount++;
            if (firstFewSrcs.length < 3) {
                firstFewSrcs.push(String(props.src || '?').substring(0, 80));
            }
            if (props.width && props.height) return;

            const src = props.src;
            if (typeof src !== 'string' || !src) return;
            // Remote URLs (worker, R2, external) cannot be probed at build time
            // without network calls — skip them.
            if (/^(https?:)?\/\//.test(src) || src.startsWith('data:')) return;

            // 2. Try pre-computed JSON FIRST — bundled at build time, no I/O.
            //    Source files in src/assets/{astrophotographies,blog,voyages}/
            //    are .gitignored, so the on-disk probe below only fires for tracked
            //    assets (a-propos/, observatoires/, etc.). Putting JSON first makes
            //    dev and CI behaviour identical and exposes JSON misses immediately.
            const jsonDims = lookupJson(src);
            if (jsonDims) {
                props.width = jsonDims.width;
                props.height = jsonDims.height;
                node.properties = props;
                setCount++;
                return;
            }

            // 3. Fallback: on-disk probe for tracked assets that aren't in the JSON
            //    (the script only scans markdown frontmatter/body and the astrobin
            //    CSV — not every random imported image).
            let cleanSrc = src.replace(/^\.\//, '');
            const candidates = [path.resolve(mdDir, cleanSrc)];
            if (cleanSrc.startsWith('/assets/')) {
                candidates.push(path.resolve(process.cwd(), 'src', cleanSrc.slice(1)));
            } else if (cleanSrc.startsWith('assets/')) {
                candidates.push(path.resolve(process.cwd(), 'src', cleanSrc));
            }

            const filePath = candidates.find((p) => {
                try {
                    return fs.statSync(p).isFile();
                } catch {
                    return false;
                }
            });

            if (filePath) {
                try {
                    const buf = fs.readFileSync(filePath);
                    const dims = probe.sync(buf);
                    if (dims?.width && dims?.height) {
                        props.width = dims.width;
                        props.height = dims.height;
                        node.properties = props;
                        return;
                    }
                } catch (e) {
                    warnOnce(filePath, `probe failed for ${filePath}: ${e.message}`);
                }
            }

            warnOnce(src, `no dims for "${src}" (md: ${mdDir})`);
        });
        // Per-file diagnostic so the build log shows where dim setting fails.
        if (imgCount > 0) {
            console.log(
                `[rehype-probe-dimensions] ${file.path.split('/').slice(-2).join('/')}: ${setCount}/${imgCount} dims set. First srcs: ${JSON.stringify(firstFewSrcs)}`,
            );
        }
    };
}
