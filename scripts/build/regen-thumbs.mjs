/**
 * Génération des miniatures de couverture (-thumb.jpg) du blog et des voyages
 *
 * Responsabilité principale :
 * - Parcourir les .md de src/content/blog/ et src/content/voyages/ et lire leur champ `image:`.
 * - Résoudre l'image sous src/assets/ (formes `/assets/…`, `../../../assets/…` ou `src/assets/…`) ;
 *   une image absente en local est comptée « missing » et sautée.
 * - Écrire `{base}-thumb.jpg` à côté de la source (800 px max, JPEG q75 mozjpeg, 4:2:0, orientation
 *   EXIF appliquée). Une miniature existante est gardée, sauf avec --force.
 * - Avec --upload, envoyer chaque miniature générée OU déjà présente sur R2 (PUT sans condition, clé =
 *   chemin relatif à src/assets/, ex. blog/2026/…-thumb.jpg).
 *
 * Complète la génération faite à l'envoi par l'admin (src/lib/admin/image-process.ts) : ce script
 * rattrape le contenu antérieur ou applique de nouveaux paramètres de miniature.
 *
 * Sans --upload, envoyer les nouvelles miniatures avec le bouton de synchronisation de l'admin ou avec
 * `node scripts/r2/upload_local_to_r2.js <dossier>` (incrémental par défaut : n'envoie que les clés
 * absentes de R2, donc ne remplace pas une miniature existante ; `-f` pour réécrire).
 *
 * Effet distant : aucun sans --upload. Avec --upload : WARNING: réécrit les miniatures sur R2
 * (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME obligatoires). Le cache du
 * worker peut ensuite servir d'anciennes variantes : `node scripts/r2/purge-cache.mjs blog` (et
 * `voyages`), car sans argument purge-cache ne vise que astrophotographies/.
 *
 * Options disponibles (toute option inconnue est ignorée) :
 *   --force  : régénère et écrase les miniatures locales existantes.
 *   --upload : envoie aussi chaque miniature sur R2 (écrase la clé existante).
 *
 * Code de sortie : 1 seulement sur erreur fatale ; les erreurs par image (génération ou PUT) sont
 * comptées dans le résumé avec le code 0.
 *
 * Exemples d'utilisation :
 *   node scripts/build/regen-thumbs.mjs                     # génère les miniatures manquantes
 *   node scripts/build/regen-thumbs.mjs --force             # régénère toutes les miniatures locales
 *   node scripts/build/regen-thumbs.mjs --upload            # envoie sur R2 sans régénérer l'existant
 *   node scripts/build/regen-thumbs.mjs --force --upload    # régénère puis réécrit tout sur R2
 */

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { PROJECT_ROOT, loadEnv } from '../lib/env.mjs';
import { createR2Client, requireR2Config } from '../lib/r2.mjs';

loadEnv();

const CONTENT_ROOTS = [path.join(PROJECT_ROOT, 'src/content/blog'), path.join(PROJECT_ROOT, 'src/content/voyages')];

const THUMB_MAX = 800;
const THUMB_QUALITY = 75;
const FORCE = process.argv.includes('--force');
const UPLOAD = process.argv.includes('--upload');

// Lazy-init the S3 client only when --upload is requested, so the script
// stays usable without R2 credentials for local-only regeneration.
let _s3 = null;
function s3() {
    if (_s3) return _s3;
    _s3 = createR2Client(requireR2Config());
    return _s3;
}
// POURQUOI : pas de valeur par défaut, pour ne jamais lire ou écrire dans un mauvais bucket.
const BUCKET = process.env.R2_BUCKET_NAME;

/**
 * Recursively collect every `.md` file under a directory.
 *
 * @param {string} dir
 * @returns {string[]}
 */
function findMarkdownFiles(dir) {
    if (!fs.existsSync(dir)) return [];
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.')) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...findMarkdownFiles(full));
        else if (entry.isFile() && entry.name.endsWith('.md')) out.push(full);
    }
    return out;
}

/**
 * Extract the `image:` frontmatter value from a markdown file.
 * Returns null if the frontmatter is missing or the field absent.
 *
 * @param {string} mdPath
 * @returns {string | null}
 */
function readImageFrontmatter(mdPath) {
    const text = fs.readFileSync(mdPath, 'utf-8');
    // POURQUOI : Prise en charge des fins de ligne CRLF (\r\n) sous Windows pour la capture du bloc YAML.
    const match = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n/);
    if (!match) return null;
    const frontmatter = match[1];
    const imageMatch = frontmatter.match(/^image:\s*['"]?([^'"\n]+)['"]?\s*$/m);
    return imageMatch ? imageMatch[1].trim() : null;
}

/**
 * Resolve a frontmatter image value (e.g. `/assets/blog/.../cover.jpg`) to an
 * absolute path under the project root. Returns null when the file is missing
 * locally (asset gitignored / not yet pulled from R2).
 *
 * @param {string} imageRef
 * @returns {string | null}
 */
function resolveAssetPath(imageRef) {
    // Strip any leading `/`, `./`, or `../` chain. Blog frontmatter writes
    // `/assets/blog/...` while voyages use `../../../assets/voyages/...`.
    let clean = imageRef.replace(/^(\.\.?\/)+/, '').replace(/^\/+/, '');
    if (!clean.startsWith('assets/') && !clean.startsWith('src/assets/')) {
        return null;
    }
    if (clean.startsWith('assets/')) clean = `src/${clean}`;
    const abs = path.join(PROJECT_ROOT, clean);
    return fs.existsSync(abs) ? abs : null;
}

/**
 * Generate a `-thumb.jpg` sibling next to the given source image.
 *
 * @param {string} sourceAbs - Absolute path to the source image.
 * @returns {Promise<{ status: 'generated' | 'skipped' | 'missing' | 'error', thumbPath?: string, bytes?: number, error?: string }>}
 */
async function generateThumb(sourceAbs) {
    const ext = path.extname(sourceAbs);
    const base = path.basename(sourceAbs, ext);
    const dir = path.dirname(sourceAbs);
    const thumbAbs = path.join(dir, `${base}-thumb.jpg`);

    if (!FORCE && fs.existsSync(thumbAbs)) {
        return { status: 'skipped', thumbPath: thumbAbs };
    }

    try {
        const info = await sharp(sourceAbs, { failOn: 'truncated' })
            .rotate()
            .resize({ width: THUMB_MAX, height: THUMB_MAX, fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: THUMB_QUALITY, mozjpeg: true, chromaSubsampling: '4:2:0' })
            .toFile(thumbAbs);
        return { status: 'generated', thumbPath: thumbAbs, bytes: info.size };
    } catch (err) {
        return { status: 'error', error: err.message };
    }
}

/**
 * Compute the R2 object key for a local thumb path (drops the
 * `src/assets/` prefix so R2 keys are `blog/...` and `voyages/...`).
 *
 * @param {string} thumbAbs
 * @returns {string}
 */
function r2KeyForThumb(thumbAbs) {
    const assetsRoot = path.join(PROJECT_ROOT, 'src/assets');
    return path.relative(assetsRoot, thumbAbs).split(path.sep).join('/');
}

/**
 * PUT a local thumb to R2 unconditionally. Overwrites if the key exists.
 *
 * @param {string} thumbAbs
 * @returns {Promise<{ key: string, bytes: number }>}
 */
async function uploadThumb(thumbAbs) {
    const Key = r2KeyForThumb(thumbAbs);
    const Body = fs.readFileSync(thumbAbs);
    await s3().send(
        new PutObjectCommand({
            Bucket: BUCKET,
            Key,
            Body,
            ContentType: 'image/jpeg',
        }),
    );
    return { key: Key, bytes: Body.length };
}

/**
 * Walk both content trees and produce thumbs for every referenced cover.
 */
async function main() {
    console.log('Regenerating cover thumbnails');
    console.log(`Mode: ${FORCE ? 'force overwrite' : 'incremental (skip existing)'}${UPLOAD ? ' + R2 PUT' : ''}`);
    console.log(`Params: ${THUMB_MAX} px max, q${THUMB_QUALITY} mozjpeg`);
    console.log('');

    let generated = 0;
    let skipped = 0;
    let missing = 0;
    let errors = 0;
    let uploaded = 0;

    for (const root of CONTENT_ROOTS) {
        const label = path.relative(PROJECT_ROOT, root);
        const mdFiles = findMarkdownFiles(root);
        console.log(`--- ${label} (${mdFiles.length} markdown files) ---`);

        for (const md of mdFiles) {
            const imageRef = readImageFrontmatter(md);
            if (!imageRef) continue;

            const sourceAbs = resolveAssetPath(imageRef);
            if (!sourceAbs) {
                console.warn(`  [missing] ${path.relative(PROJECT_ROOT, md)} → ${imageRef}`);
                missing++;
                continue;
            }

            const result = await generateThumb(sourceAbs);
            const rel = path.relative(PROJECT_ROOT, sourceAbs);
            let thumbAbs;
            if (result.status === 'generated') {
                const kb = Math.round((result.bytes ?? 0) / 1024);
                console.log(`  [ok]      ${rel} → -thumb.jpg (${kb} KB)`);
                generated++;
                thumbAbs = result.thumbPath;
            } else if (result.status === 'skipped') {
                skipped++;
                thumbAbs = result.thumbPath;
            } else {
                console.error(`  [error]   ${rel}: ${result.error}`);
                errors++;
                continue;
            }

            if (UPLOAD && thumbAbs) {
                try {
                    const r = await uploadThumb(thumbAbs);
                    const kb = Math.round(r.bytes / 1024);
                    console.log(`  [r2]      PUT ${r.key} (${kb} KB)`);
                    uploaded++;
                } catch (err) {
                    console.error(`  [r2 err]  ${thumbAbs}: ${err.message}`);
                    errors++;
                }
            }
        }
        console.log('');
    }

    console.log('--- Summary ---');
    console.log(`Generated: ${generated}`);
    console.log(`Skipped (already exist): ${skipped}`);
    console.log(`Missing source (gitignored asset not pulled?): ${missing}`);
    console.log(`Errors: ${errors}`);
    if (UPLOAD) console.log(`Uploaded to R2: ${uploaded}`);

    if (missing > 0) {
        console.log('');
        console.log("Note: missing sources are normal if you haven't pulled R2 locally.");
        console.log('      Run `node scripts/r2/download_r2_to_local.js` first if you want full coverage.');
    }
    if (UPLOAD && uploaded > 0) {
        console.log('');
        console.log('Worker cache may serve stale resized variants of overwritten thumbs.');
        console.log('Purge with: node scripts/r2/purge-cache.mjs  (or wait for cache TTL).');
    }
}

main().catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
});
