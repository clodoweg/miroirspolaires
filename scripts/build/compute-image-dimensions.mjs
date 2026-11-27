/**
 * Pre-computes intrinsic dimensions of all R2-served images and writes them
 * to src/data/image-dimensions.json. Required because src/assets/{astrophotographies,
 * voyages,blog}/ are .gitignored (synced from R2) — at Vercel build time
 * `import.meta.glob` returns nothing, so we can't probe locally and pages
 * fall back to hardcoded ratios (visible artefact: portrait voyage photos
 * squished into 3/2 boxes — observed 2026-05-24).
 *
 * Sources scanned:
 *   - data/astrobin_clodoweg_gallery_python.csv  → astrophotography raw JPGs
 *   - src/content/voyages/**\*.md frontmatter    → cover + gallery
 *   - src/content/blog/**\*.md frontmatter       → cover
 *   - src/content/videos/**\*.md frontmatter     → thumbnail
 *
 * Output JSON shape:
 *   { "astrophotographies/2026/1213620_raw.jpg": { width: 19318, height: 13471 },
 *     "voyages/2026/la-transylvanie/_dsc1042-hdr.jpg": { width: 6720, height: 4480 }, ... }
 *
 * Keys are paths RELATIVE TO src/assets/ — same key format that
 * getLocalImageDimensions in src/utils/imageService.ts looks up.
 *
 * Usage:
 *   node scripts/build/compute-image-dimensions.mjs            # local first, then cache, then R2
 *   node scripts/build/compute-image-dimensions.mjs --force-r2 # ignore local, probe R2 only
 *   node scripts/build/compute-image-dimensions.mjs --only=voyages,blog  # subset
 *
 * Re-run after adding photos or new voyage/blog posts. ~2s per missing photo via R2.
 * Un fichier local est toujours relu (une image remplacée met sa taille à jour) ; une image absente du disque
 * garde sa taille en cache, sauf avec --force-r2 qui relit tout sur R2.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import probe from 'probe-image-size';
import Papa from 'papaparse';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../');

const OUT_PATH = path.join(rootDir, 'src/data/image-dimensions.json');
const ASSETS_DIR = path.join(rootDir, 'src/assets');
const R2_BASE = (process.env.PUBLIC_R2_URL || 'https://pub-r2.miroirspolaires.fr').replace(/\/$/, '');
const CSV_PATH = path.join(rootDir, 'data/astrobin_clodoweg_gallery_python.csv');

const forceR2 = process.argv.includes('--force-r2');
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const ONLY = onlyArg ? new Set(onlyArg.slice('--only='.length).split(',')) : null;
const CONCURRENCY = 8;

function isSelected(source) {
    return !ONLY || ONLY.has(source);
}

/** Normalise a frontmatter path or relative reference to a key under src/assets/. */
function toAssetKey(input) {
    if (!input) return null;
    let s = input.trim().replace(/^['"]|['"]$/g, '');
    // Strip relative prefix and leading slashes
    s = s.replace(/^(\.\.?\/)+/, '');
    if (s.startsWith('/')) s = s.slice(1);
    // Strip src/assets/ or assets/
    if (s.startsWith('src/assets/')) s = s.slice('src/assets/'.length);
    else if (s.startsWith('assets/')) s = s.slice('assets/'.length);
    return s;
}

function readFrontmatterField(md, field) {
    const fmMatch = md.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!fmMatch) return null;
    // POURQUOI : On retire les retours chariot (\r) sous Windows pour éviter que le symbole de fin
    // de ligne ($) dans les regex échoue à cause du caractère \r non consommé par le point (.).
    const fm = fmMatch[1].replace(/\r/g, '');
    const lines = fm.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(new RegExp(`^${field}\\s*:\\s*(.*)$`));
        if (m) return m[1].trim().replace(/^['"]|['"]$/g, '');
    }
    return null;
}

function readFrontmatterArray(md, field) {
    const fmMatch = md.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!fmMatch) return [];
    // POURQUOI : Même raison, suppression des \r pour assurer la correspondance des expressions régulières.
    const fm = fmMatch[1].replace(/\r/g, '');
    const lines = fm.split('\n');
    const out = [];
    let inField = false;
    for (const line of lines) {
        if (new RegExp(`^${field}\\s*:`).test(line)) {
            inField = true;
            continue;
        }
        if (inField) {
            const m = line.match(/^\s*-\s*(.+)$/);
            if (m) out.push(m[1].trim().replace(/^['"]|['"]$/g, ''));
            else if (line.match(/^\S/)) break; // next top-level field
        }
    }
    return out;
}

function collectFromCsv() {
    if (!isSelected('astro')) return [];
    if (!fs.existsSync(CSV_PATH)) return [];
    const { data } = Papa.parse(fs.readFileSync(CSV_PATH, 'utf8'), { header: true, skipEmptyLines: true });
    const out = [];
    for (const row of data) {
        const id = row.ID;
        const uploaded = row.Uploaded;
        if (!id || !uploaded) continue;
        const year = new Date(uploaded).getFullYear();
        if (!Number.isFinite(year)) continue;
        out.push(`astrophotographies/${year}/${id}_raw.jpg`);
    }
    return out;
}

function walkContent(subdir, predicate) {
    const root = path.join(rootDir, 'src/content', subdir);
    if (!fs.existsSync(root)) return [];
    const out = [];
    function walk(dir) {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, e.name);
            if (e.isDirectory()) walk(p);
            else if (e.isFile() && (e.name.endsWith('.md') || e.name.endsWith('.mdx'))) {
                const md = fs.readFileSync(p, 'utf8');
                predicate(md, p).forEach((k) => out.push(k));
            }
        }
    }
    walk(root);
    return out;
}

function collectFromVoyages() {
    if (!isSelected('voyages')) return [];
    return walkContent('voyages', (md) => {
        const keys = [];
        const cover = toAssetKey(readFrontmatterField(md, 'image'));
        if (cover) keys.push(cover);
        for (const item of readFrontmatterArray(md, 'gallery')) {
            const k = toAssetKey(item);
            if (k) keys.push(k);
        }
        keys.push(...collectInlineMarkdownImages(md));
        return keys;
    });
}

/** Extracts `![alt](path)` references from markdown body. The body is
 *  everything after the frontmatter `---` block. Captures absolute
 *  (`/assets/...`) and relative paths. */
function collectInlineMarkdownImages(md) {
    const fmEnd = md.indexOf('\n---', 4);
    const body = fmEnd > 0 ? md.slice(fmEnd + 4) : md;
    const re = /!\[[^\]]*\]\(([^)\s]+)/g;
    const out = [];
    let m;
    while ((m = re.exec(body)) !== null) {
        const k = toAssetKey(m[1]);
        if (k) out.push(k);
    }
    return out;
}

function collectFromBlog() {
    if (!isSelected('blog')) return [];
    return walkContent('blog', (md) => {
        const keys = [];
        const cover = toAssetKey(readFrontmatterField(md, 'image'));
        if (cover) keys.push(cover);
        keys.push(...collectInlineMarkdownImages(md));
        return keys;
    });
}

function collectFromVideos() {
    if (!isSelected('videos')) return [];
    return walkContent('videos', (md) => {
        const cover = toAssetKey(readFrontmatterField(md, 'image'));
        return cover ? [cover] : [];
    });
}

const HEAD_BYTES = 1024 * 1024;

function readHead(file, bytes) {
    const fd = fs.openSync(file, 'r');
    try {
        const buffer = Buffer.alloc(bytes);
        const read = fs.readSync(fd, buffer, 0, bytes, 0);
        return buffer.subarray(0, read);
    } finally {
        fs.closeSync(fd);
    }
}

async function probeLocal(key) {
    const local = path.join(ASSETS_DIR, key);
    if (!fs.existsSync(local)) return null;
    try {
        // POURQUOI : les raws pèsent jusqu'à 110 Mo et ce fichier est relu à chaque passage ; l'en-tête suffit
        // presque toujours. Le fichier entier ne sert qu'en secours (métadonnées EXIF ou ICC très longues).
        const d = probe.sync(readHead(local, HEAD_BYTES)) ?? probe.sync(fs.readFileSync(local));
        return d?.width && d?.height ? { width: d.width, height: d.height } : null;
    } catch {
        return null;
    }
}

async function probeRemote(key) {
    const url = `${R2_BASE}/${key}`;
    try {
        const r = await probe(url, { timeout: 8000 });
        return r?.width && r?.height ? { width: r.width, height: r.height } : null;
    } catch (e) {
        return { error: e.message };
    }
}

async function pool(items, concurrency, fn) {
    const out = new Array(items.length);
    let i = 0;
    await Promise.all(
        Array.from({ length: concurrency }, async () => {
            while (i < items.length) {
                const idx = i++;
                out[idx] = await fn(items[idx], idx);
            }
        }),
    );
    return out;
}

async function main() {
    console.log(`📂 Output: ${OUT_PATH}`);
    console.log(`📂 Assets dir: ${ASSETS_DIR}`);
    console.log(`🌐 R2 base: ${R2_BASE}`);
    console.log(
        `⚙️  Concurrency: ${CONCURRENCY}${forceR2 ? ' (forcing R2)' : ''}${ONLY ? ` (only: ${[...ONLY].join(',')})` : ''}`,
    );

    let existing = {};
    if (fs.existsSync(OUT_PATH)) {
        try {
            existing = JSON.parse(fs.readFileSync(OUT_PATH, 'utf8'));
        } catch {
            // POURQUOI : JSON illisible, on repart d'un cache vide.
        }
    }

    const allKeys = new Set([
        ...collectFromCsv(),
        ...collectFromVoyages(),
        ...collectFromBlog(),
        ...collectFromVideos(),
    ]);
    const keys = [...allKeys];

    console.log(`📊 ${keys.length} unique image keys (${Object.keys(existing).length} cached)\n`);

    let local = 0,
        remote = 0,
        cached = 0,
        errors = 0;

    const results = await pool(keys, CONCURRENCY, async (k) => {
        // POURQUOI : un fichier présent en local est relu avant le cache. Sinon, une photo retraitée et
        // réimportée (update-photos.mjs --ci --force-media ou --refresh-ids) gardait la taille de l'ancienne
        // version : 13 astrophotos fausses le 27/11/2026. Lire l'en-tête d'un fichier local est quasi gratuit.
        let d = null;
        if (!forceR2) d = await probeLocal(k);
        if (d) {
            local++;
            return d;
        }

        if (!forceR2 && existing[k]?.width) {
            cached++;
            return existing[k];
        }

        d = await probeRemote(k);
        if (d?.error) {
            errors++;
            console.warn(`  ✗ ${k} — ${d.error}`);
            return existing[k] || null;
        }
        if (d) {
            remote++;
            return d;
        }
        return null;
    });

    const unsorted = {};
    keys.forEach((k, i) => {
        if (results[i]?.width && results[i]?.height) {
            unsorted[k] = { width: results[i].width, height: results[i].height };
        }
    });
    // Merge with existing entries we didn't touch (e.g. when --only is used).
    const merged = { ...existing, ...unsorted };
    const out = Object.fromEntries(Object.entries(merged).sort(([a], [b]) => a.localeCompare(b)));

    fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + '\n');

    console.log(`\n✅ Wrote ${Object.keys(out).length} entries (${Object.keys(unsorted).length} touched this run)`);
    console.log(`   ${local} local · ${remote} remote · ${cached} cached · ${errors} errors`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
