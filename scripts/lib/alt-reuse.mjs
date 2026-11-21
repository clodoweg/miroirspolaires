/**
 * Réutilisation des textes alternatifs existants
 *
 * Responsabilité : retrouver dans `src/data/alt.json` un alt déjà écrit pour la même image sous une
 * autre clé, pour ne jamais remplacer un texte relu. Utilisé par `scripts/lib/alt-coverage.mjs`.
 *
 * Ce module n'est pas une CLI et n'écrit rien sur le disque.
 */

const ASTRO_RAW_KEY = /^\/assets\/astrophotographies\/\d{4}\/(\d+_raw\.jpg)$/;
const THUMB_SUFFIX = /-thumb(\.[^.]+)$/;

/**
 * Indique si une valeur de `alt.json` est un alt exploitable.
 *
 * @param {unknown} altText - Valeur lue dans `alt.json`.
 * @returns {boolean} `false` si elle est vide ou corrompue (`<think>`, retour à la ligne).
 */
export function isValidAlt(altText) {
    return typeof altText === 'string' && altText.length > 0 && !altText.includes('<think>') && !altText.includes('\n');
}

/**
 * Cherche un alt existant pour la même image sous une autre clé.
 *
 * POURQUOI : la clé d'une astrophoto contient l'année, qui peut changer dans le CSV. Seuls les raws
 * sont comparés par nom de fichier, car leur nom contient l'ID : ailleurs, deux articles peuvent
 * avoir chacun une image `_dsc1234.jpg` sans rapport entre elles.
 *
 * @param {string} key - Clé sans alt (`/assets/…`).
 * @param {Record<string, unknown>} altData - Contenu de `alt.json`.
 * @returns {string | null} L'alt à réutiliser, ou `null` s'il faut le générer.
 */
export function findReusableAlt(key, altData) {
    if (THUMB_SUFFIX.test(key)) {
        const fullImageAlt = altData[key.replace(THUMB_SUFFIX, '$1')];
        if (isValidAlt(fullImageAlt)) return fullImageAlt;
    }

    const rawFileName = key.match(ASTRO_RAW_KEY)?.[1];
    if (!rawFileName) return null;
    for (const [otherKey, altText] of Object.entries(altData)) {
        if (otherKey !== key && otherKey.match(ASTRO_RAW_KEY)?.[1] === rawFileName && isValidAlt(altText)) {
            return altText;
        }
    }
    return null;
}
