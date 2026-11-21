/**
 * Versions web pré-générées des images, servies directement depuis R2
 *
 * Responsabilité : traduire une clé d'image (relative à `src/assets/`) en URL de ses versions
 * 400/800/1200 px, d'après le manifeste `src/data/web-images.json` (clé source → largeurs
 * présentes sur R2). Le manifeste est écrit par `scripts/build/generate-web-images.mjs --upload`.
 *
 * POURQUOI : le worker renvoie l'original sans le redimensionner au-delà de 500 Ko ou 1,8 MP
 * (limite CPU du plan gratuit), et sert les `mini/` tels quels. Les pages blog et voyage
 * téléchargeaient donc des originaux de plusieurs Mo, et les grilles d'astrophotos des `mini/`
 * de 1 600 px pour des cartes de 400 px. Les versions web sont des fichiers statiques : aucun
 * calcul côté worker, donc ni 503 en rafale ni latence de premier encodage.
 *
 * Une clé absente du manifeste garde le comportement d'avant (worker ou fichier direct).
 *
 * Module sans dépendance ni accès disque : chaque appelant charge le manifeste lui-même
 * (import JSON côté Vite, `createRequire` dans les plugins rehype).
 */

/** Préfixe R2 des versions web : `web/<clé sans extension>-w<largeur>.jpg`. */
export const WEB_IMAGES_PREFIX = 'web/';

/** Largeurs générées, alignées sur `IMAGE_CONFIG.WIDTHS`. */
export const WEB_IMAGE_WIDTHS = [400, 800, 1200];

/**
 * Ramène un chemin d'image à sa clé R2 (`blog/2026/slug/photo.jpg`).
 *
 * POURQUOI : décodage `%20` et forme NFC, pour qu'un nom accentué ou avec espaces écrit dans le
 * markdown retrouve la clé écrite par le script (qui normalise aussi en NFC).
 *
 * @param {string} path - Chemin relatif markdown, `/assets/…`, `src/assets/…` ou clé.
 * @returns {string} La clé, sans paramètre de requête ni ancre.
 */
export function normalizeAssetKey(path) {
    let key = String(path || '')
        .split('?')[0]
        .split('#')[0]
        .replace(/^(\.\.?\/)+/, '')
        .replace(/^\/+/, '')
        .replace(/^src\/assets\//, '')
        .replace(/^assets\//, '');
    try {
        key = decodeURIComponent(key);
    } catch {
        // POURQUOI : un `%` isolé n'est pas un encodage ; on garde la clé telle quelle.
    }
    return key.normalize('NFC');
}

/**
 * Clé R2 d'une version web.
 *
 * @param {string} sourceKey - Clé de l'image source.
 * @param {number} width - Largeur de la version.
 * @returns {string} La clé, ex. `web/blog/2026/slug/photo-w800.jpg`.
 */
export function webImageKey(sourceKey, width) {
    return `${WEB_IMAGES_PREFIX}${sourceKey.replace(/\.[^./]+$/, '')}-w${width}.jpg`;
}

/**
 * Largeurs à générer pour une source : celles de `WEB_IMAGE_WIDTHS` plus petites que la source,
 * plus la largeur de la source si elle est sous la plus grande (pour ne pas perdre de définition).
 *
 * @param {number} sourceWidth - Largeur de l'image source en pixels.
 * @returns {number[]} Les largeurs, croissantes ; vide si la source est plus étroite que 400 px.
 */
export function planWebImageWidths(sourceWidth) {
    if (sourceWidth >= WEB_IMAGE_WIDTHS[WEB_IMAGE_WIDTHS.length - 1]) return [...WEB_IMAGE_WIDTHS];
    const widths = WEB_IMAGE_WIDTHS.filter((width) => width < sourceWidth);
    return widths.length > 0 ? [...widths, sourceWidth] : [];
}

/**
 * Largeurs disponibles sur R2 pour une image.
 *
 * @param {Record<string, number[]>} manifest - Contenu de `src/data/web-images.json`.
 * @param {string} path - Chemin ou clé de l'image.
 * @returns {number[] | null} Les largeurs, ou `null` si l'image n'a pas de version web.
 */
export function getWebImageWidths(manifest, path) {
    const widths = manifest[normalizeAssetKey(path)];
    return Array.isArray(widths) && widths.length > 0 ? widths : null;
}

/**
 * URL publique d'une version web.
 *
 * POURQUOI : `encodeURI`, car une clé peut contenir des espaces, qui couperaient un `srcset`.
 *
 * @param {string} r2BaseUrl - URL publique du bucket R2.
 * @param {string} sourceKey - Clé de l'image source.
 * @param {number} width - Largeur voulue.
 * @returns {string} L'URL.
 */
export function webImageUrl(r2BaseUrl, sourceKey, width) {
    return `${r2BaseUrl.replace(/\/$/, '')}/${encodeURI(webImageKey(sourceKey, width))}`;
}

/**
 * `srcset` des versions web d'une image.
 *
 * @param {string} r2BaseUrl - URL publique du bucket R2.
 * @param {string} sourceKey - Clé de l'image source.
 * @param {number[]} widths - Largeurs disponibles.
 * @returns {string} Le `srcset` (`url 400w, url 800w, …`).
 */
export function buildWebImageSrcset(r2BaseUrl, sourceKey, widths) {
    return widths.map((width) => `${webImageUrl(r2BaseUrl, sourceKey, width)} ${width}w`).join(', ');
}

/**
 * Choisit la plus petite version au moins aussi large que la cible, sinon la plus large.
 *
 * @param {number[]} widths - Largeurs disponibles, croissantes.
 * @param {number} targetWidth - Largeur d'affichage visée.
 * @returns {number} La largeur retenue.
 */
export function pickWebImageWidth(widths, targetWidth) {
    return widths.find((width) => width >= targetWidth) ?? widths[widths.length - 1];
}
