import sharp from 'sharp';
import path from 'node:path';

export interface CompressOptions {
    /** Max longest side in pixels (no upscale). Ignoré si noResize est true. */
    maxSize?: number;
    /** JPEG quality (1-100). */
    quality?: number;
    /** Conserve la résolution intégrale sans réduction de taille (pour les images 360° explicites). */
    noResize?: boolean;
}

export interface CompressResult {
    buffer: Buffer;
    filename: string;
    width: number;
    height: number;
    originalBytes: number;
    compressedBytes: number;
}

export interface CompressedPair {
    /** Full-resolution output: max 2400px, q82 mozjpeg (existing behavior). */
    full: CompressResult;
    /** Listing thumbnail: max 600px, q60 mozjpeg. null for SVG/GIF (no resize).
     *  Sits below the worker's 500 KB passthrough threshold so the image
     *  pipeline can actually resize/recompress it (cf. docs/audits/2026-05-performance-audit.md §17). */
    thumb: CompressResult | null;
}

const FULL_DEFAULTS: Required<Omit<CompressOptions, 'noResize'>> & { noResize: boolean } = {
    maxSize: 2400,
    quality: 82,
    noResize: false,
};
const THUMB_OPTS: Required<Omit<CompressOptions, 'noResize'>> & { noResize: boolean } = {
    maxSize: 800,
    quality: 60,
    noResize: false,
};

/** Suffix appended to the base filename for the thumbnail variant. */
export const THUMB_SUFFIX = '-thumb';

/**
 * Re-encode a photographic image into two outputs: a full-resolution variant
 * (default 2400px / q82, used for body / detail pages) and a small thumbnail
 * variant (600px / q60, used for listing cards). SVG/GIF skip thumb generation.
 *
 * Output filenames always end in `.jpg` (codec is JPEG). Thumb filename is
 * `{base}-thumb.jpg`.
 */
export async function compressImage(
    inputBuffer: Uint8Array | Buffer,
    originalFilename: string,
    opts: CompressOptions = {},
): Promise<CompressedPair> {
    const buf = Buffer.isBuffer(inputBuffer) ? inputBuffer : Buffer.from(inputBuffer);
    const ext = path.extname(originalFilename).toLowerCase();

    // SVG / GIF: leave untouched to preserve animation/vector semantics.
    if (ext === '.svg' || ext === '.gif') {
        return {
            full: {
                buffer: buf,
                filename: originalFilename,
                width: 0,
                height: 0,
                originalBytes: buf.length,
                compressedBytes: buf.length,
            },
            thumb: null,
        };
    }

    // POURQUOI : Lorsqu'une image 360 est uploadée manuellement (opts.noResize === true),
    // nous désactivons tout redimensionnement afin de préserver 100% des pixels et de la netteté en vue sphérique.
    const fullOpts = { ...FULL_DEFAULTS, ...opts };

    const full = await encodeVariant(buf, originalFilename, fullOpts);
    const thumb = await encodeVariant(buf, originalFilename, THUMB_OPTS, THUMB_SUFFIX);
    return { full, thumb };
}

/** Encode a single Sharp variant. Optionally appends a suffix to the base name. */
async function encodeVariant(
    sourceBuf: Buffer,
    originalFilename: string,
    { maxSize, quality, noResize }: Required<CompressOptions>,
    suffix: string = '',
): Promise<CompressResult> {
    // POURQUOI: limitInputPixels: false permet d'accepter les grandes mosaïques astrophotographiques sans erreur.
    const pipeline = sharp(sourceBuf, { failOn: 'truncated', limitInputPixels: false }).rotate(); // apply EXIF orientation
    const meta = await pipeline.metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    const longest = Math.max(w, h);

    if (!noResize && longest > maxSize) {
        pipeline.resize({
            width: w >= h ? maxSize : undefined,
            height: h > w ? maxSize : undefined,
            fit: 'inside',
            withoutEnlargement: true,
        });
    }

    // POURQUOI : Pour les images pleine résolution, nous conservons les métadonnées EXIF
    // (date de prise de vue DateTimeOriginal, appareil, etc.) utiles pour le tri chronologique et l'affichage.
    // Les miniatures thumb n'en ont pas besoin afin d'économiser un maximum d'octets.
    if (!suffix) {
        pipeline.withMetadata();
    }

    const output = await pipeline
        .jpeg({ quality, mozjpeg: true, chromaSubsampling: '4:2:0' })
        .toBuffer({ resolveWithObject: true });

    // POURQUOI : basename() n'ôte l'extension que si sa casse correspond (« IMG_1234.JPG »).
    const base = path.basename(originalFilename, path.extname(originalFilename));
    const filename = `${base}${suffix}.jpg`;
    return {
        buffer: output.data,
        filename,
        width: output.info.width,
        height: output.info.height,
        originalBytes: sourceBuf.length,
        compressedBytes: output.data.length,
    };
}
