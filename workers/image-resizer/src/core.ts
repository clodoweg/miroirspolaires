/**
 * Logique pure du worker de redimensionnement (sans Photon ni API Cloudflare)
 *
 * Responsabilité : validation stricte de l'origine CORS, autorisation de la purge en temps
 * constant, lecture et bornage des options d'URL, et décisions de diffusion (servir l'original
 * ou redimensionner). Isolé de `index.ts` pour être testé par Vitest sans charger le WASM.
 */

/** Site par défaut renvoyé dans `Access-Control-Allow-Origin` quand l'origine n'est pas autorisée. */
export const DEFAULT_ALLOWED_ORIGIN = 'https://miroirspolaires.fr';

const ALLOWED_ORIGINS = new Set([
    'https://miroirspolaires.fr',
    'https://www.miroirspolaires.fr',
    'http://localhost:4321', // Local dev
    'https://psaltery.org',
    'https://www.psaltery.org',
]);

const MAX_DIMENSION = 4000;
const DEFAULT_QUALITY = 80;
const IMAGE_EXTENSION = /\.(jpg|jpeg|png|webp)$/i;

/** Taille au-delà de laquelle l'original est servi sans traitement (limite CPU du plan gratuit). */
export const MAX_RESIZE_BYTES = 500 * 1024;
/** Nombre de pixels au-delà duquel l'original est servi sans traitement. */
export const MAX_RESIZE_PIXELS = 1.8 * 1000 * 1000;

export interface ImageOptions {
    width: number;
    height: number;
    quality: number;
    format: 'jpeg' | 'png';
}

/**
 * Renvoie l'origine si elle figure exactement dans la liste autorisée.
 *
 * WARNING: comparaison exacte après normalisation par `new URL()`. Un `startsWith` laisserait
 * passer `https://miroirspolaires.fr.evil.com` ou `http://localhost:43210`.
 *
 * @param originHeader - En-tête `Origin` de la requête.
 * @returns L'origine normalisée si elle est autorisée, sinon `null`.
 */
export function resolveAllowedOrigin(originHeader: string | null): string | null {
    if (!originHeader) return null;
    try {
        const origin = new URL(originHeader).origin;
        return ALLOWED_ORIGINS.has(origin) ? origin : null;
    } catch {
        return null;
    }
}

/**
 * En-têtes CORS à ajouter à une réponse, selon l'origine de la requête.
 *
 * @param originHeader - En-tête `Origin` de la requête.
 * @returns `Access-Control-Allow-Origin` et `Vary: Origin`.
 */
export function corsHeaders(originHeader: string | null): Record<string, string> {
    return {
        'Access-Control-Allow-Origin': resolveAllowedOrigin(originHeader) ?? DEFAULT_ALLOWED_ORIGIN,
        Vary: 'Origin',
    };
}

async function sha256(value: string): Promise<Uint8Array> {
    return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

/**
 * Vérifie la clé de purge.
 *
 * WARNING: échoue fermé si `PURGE_KEY` n'est pas défini, et compare des empreintes SHA-256
 * de longueur fixe octet par octet sans sortie anticipée (temps constant).
 *
 * @param provided - Valeur de l'en-tête `x-purge-key`.
 * @param expected - Secret `PURGE_KEY` du worker.
 * @returns `true` seulement si les deux clés existent et sont identiques.
 */
export async function isPurgeAuthorized(provided: string | null, expected: string | undefined): Promise<boolean> {
    if (!expected || !provided) return false;
    const [providedDigest, expectedDigest] = await Promise.all([sha256(provided), sha256(expected)]);
    let difference = 0;
    for (let index = 0; index < expectedDigest.length; index++) {
        difference |= providedDigest[index] ^ expectedDigest[index];
    }
    return difference === 0;
}

function parseDimension(raw: string | null | undefined): number {
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) return 0;
    return Math.min(MAX_DIMENSION, Math.round(value));
}

function parseQuality(raw: string | null | undefined): number {
    const value = Number(raw);
    if (!Number.isFinite(value)) return DEFAULT_QUALITY;
    return Math.min(100, Math.max(1, Math.round(value)));
}

function isOptionsSegment(segment: string): boolean {
    return /^(?:[whqf]_[^,/]+)(?:,[whqf]_[^,/]+)*$/.test(segment);
}

/**
 * Lit la clé R2 et les options d'une URL du worker.
 *
 * Formats acceptés : `/w_800,q_80,f_jpeg/chemin/image.jpg`, ou `/chemin/image.jpg?w=800&q=80`.
 * Les valeurs non numériques reviennent aux défauts, les dimensions sont plafonnées à 4000 px
 * et la qualité ramenée dans [1, 100]. Tout format autre que `png` produit du JPEG
 * (Photon ne sait faire que du WebP sans perte, voir `index.ts`).
 *
 * @param url - URL de la requête.
 * @returns La clé R2 décodée (vide si absente) et les options normalisées.
 */
export function parseImageRequest(url: URL): { key: string; options: ImageOptions } {
    const segments = url.pathname.slice(1).split('/');
    const options: ImageOptions = { width: 0, height: 0, quality: DEFAULT_QUALITY, format: 'jpeg' };
    let keySegments = segments;

    if (segments[0] && isOptionsSegment(segments[0])) {
        for (const option of segments[0].split(',')) {
            const [name, value] = option.split('_');
            if (name === 'w') options.width = parseDimension(value);
            if (name === 'h') options.height = parseDimension(value);
            if (name === 'q') options.quality = parseQuality(value);
            if (name === 'f') options.format = value === 'png' ? 'png' : 'jpeg';
        }
        keySegments = segments.slice(1);
    } else {
        const queryWidth = url.searchParams.get('w');
        const queryQuality = url.searchParams.get('q');
        if (queryWidth) options.width = parseDimension(queryWidth);
        if (queryQuality) options.quality = parseQuality(queryQuality);
    }

    let key = keySegments.join('/');
    try {
        // POURQUOI : les clés R2 contiennent parfois des espaces ou des accents, encodés dans l'URL.
        key = decodeURIComponent(key);
    } catch {
        // Encodage invalide : on garde la clé brute, R2 répondra 404.
    }
    return { key, options };
}

export type PassthroughReason = 'not-image' | 'presized' | 'too-heavy';

/**
 * Indique si l'objet doit être servi tel quel, avant tout décodage.
 *
 * @param key - Clé R2.
 * @param byteSize - Taille de l'objet en octets.
 * @returns La raison de servir l'original, ou `null` s'il faut tenter le redimensionnement.
 */
export function getPassthroughReason(key: string, byteSize: number): PassthroughReason | null {
    if (!IMAGE_EXTENSION.test(key)) return 'not-image';
    // POURQUOI : les vignettes pré-générées (/mini/ ou -thumb.jpg) sont déjà optimisées ; les
    // retraiter via WASM dépasserait le quota CPU de 10 ms des Workers Free (erreurs 503).
    if (key.includes('/mini/') || key.endsWith('-thumb.jpg')) return 'presized';
    if (byteSize > MAX_RESIZE_BYTES) return 'too-heavy';
    return null;
}

/**
 * Calcule la taille de sortie sans agrandir l'image.
 *
 * @param original - Dimensions de la source.
 * @param requested - Largeur et hauteur demandées (0 = libre).
 * @returns Les dimensions cibles, ou `null` si aucun redimensionnement n'est nécessaire.
 */
export function computeTargetSize(
    original: { width: number; height: number },
    requested: { width: number; height: number },
): { width: number; height: number } | null {
    const width = Math.min(requested.width, original.width);
    const height = Math.min(requested.height, original.height);
    if (width > 0 && height > 0) {
        return width === original.width && height === original.height ? null : { width, height };
    }
    if (width > 0) {
        return width === original.width
            ? null
            : { width, height: Math.round(original.height * (width / original.width)) };
    }
    if (height > 0) {
        return height === original.height
            ? null
            : { width: Math.round(original.width * (height / original.height)), height };
    }
    return null;
}
