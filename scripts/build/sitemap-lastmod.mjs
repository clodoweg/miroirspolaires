// Build a map { '<url>' → Date } so @astrojs/sitemap can serialize a
// realistic `lastmod` per page. Read at config-load time, so all I/O is
// synchronous against the working tree.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Papa from 'papaparse';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// POURQUOI : ce fichier vit dans scripts/build/ ; la racine du dépôt est deux niveaux au-dessus.
const ROOT = path.resolve(__dirname, '../..');
const SITE = 'https://www.miroirspolaires.fr';

function generateSlug(title) {
    return String(title)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
}

function parseFrontmatter(raw) {
    // POURQUOI : On supporte les fins de ligne CRLF (\r\n) sous Windows pour éviter d'échouer la capture du bloc YAML.
    const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!m) return {};
    const out = {};
    for (const line of m[1].split(/\r?\n/)) {
        const kv = line.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/);
        if (!kv) continue;
        let v = kv[2].trim();
        if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
        out[kv[1]] = v;
    }
    return out;
}

function walkMd(dir) {
    if (!fs.existsSync(dir)) return [];
    const out = [];
    const stack = [dir];
    while (stack.length) {
        const cur = stack.pop();
        for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
            const full = path.join(cur, entry.name);
            if (entry.isDirectory()) stack.push(full);
            else if (/\.mdx?$/.test(entry.name)) out.push(full);
        }
    }
    return out;
}

function toDate(s) {
    if (!s) return null;
    const d = new Date(s);
    return Number.isFinite(d.getTime()) ? d : null;
}

export function buildLastmodMap() {
    const map = new Map();

    // ── Blog (slug includes the year folder)
    for (const file of walkMd(path.join(ROOT, 'src/content/blog'))) {
        const fm = parseFrontmatter(fs.readFileSync(file, 'utf8'));
        const slug = path.relative(path.join(ROOT, 'src/content/blog'), file).replace(/\.mdx?$/, '');
        const d = toDate(fm.date);
        if (d) map.set(`${SITE}/blog/${slug}/`, d);
    }

    // ── Voyages
    for (const file of walkMd(path.join(ROOT, 'src/content/voyages'))) {
        const fm = parseFrontmatter(fs.readFileSync(file, 'utf8'));
        const slug = path.relative(path.join(ROOT, 'src/content/voyages'), file).replace(/\.mdx?$/, '');
        // Voyages have no `date` field but a `year`. Use Jan 1 of the year.
        const d = fm.date ? toDate(fm.date) : fm.year ? toDate(`${fm.year}-01-01`) : null;
        if (d) map.set(`${SITE}/voyages/${slug}/`, d);
    }

    // ── Videos
    for (const file of walkMd(path.join(ROOT, 'src/content/videos'))) {
        const fm = parseFrontmatter(fs.readFileSync(file, 'utf8'));
        const slug = path.relative(path.join(ROOT, 'src/content/videos'), file).replace(/\.mdx?$/, '');
        const d = toDate(fm.date);
        if (d) map.set(`${SITE}/videos/${slug}/`, d);
    }

    // ── Astrophotos (CSV)
    const csvPath = path.join(ROOT, 'data/astrobin_clodoweg_gallery_python.csv');
    if (fs.existsSync(csvPath)) {
        const csv = fs.readFileSync(csvPath, 'utf8');
        const parsed = Papa.parse(csv, {
            header: true,
            skipEmptyLines: true,
            transformHeader: (h) => h.trim(),
        });
        for (const row of parsed.data) {
            if (!row.ID || !row.Title) continue;
            const slug = `${generateSlug(row.Title)}-${row.ID}`;
            const d = toDate(row.Uploaded);
            if (d) map.set(`${SITE}/astrophotographies/${slug}/`, d);
        }
    }

    // ── Most-recent for the listing pages
    const allDates = [...map.values()].sort((a, b) => b.getTime() - a.getTime());
    const latest = allDates[0] ?? new Date();

    map.set(`${SITE}/`, latest);
    map.set(`${SITE}/blog/`, latest);
    map.set(`${SITE}/voyages/`, latest);
    map.set(`${SITE}/videos/`, latest);
    map.set(`${SITE}/astrophotographies/`, latest);

    return map;
}
