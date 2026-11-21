/**
 * Introduction d'un article Wikipedia
 *
 * Responsabilité : préparer l'introduction d'un article pour `src/data/wikipedia.json`, sans modèle de
 * langage. Utilisé par `scripts/seo/wiki-descriptions.js`.
 *
 * Ce module n'est pas une CLI et n'écrit rien sur le disque.
 */

const MIN_LENGTH = 100;
const MAX_LENGTH = 1000;

/**
 * Nettoie une introduction et la coupe à la fin d'une phrase.
 *
 * @param {string} extract - Introduction en texte brut.
 * @returns {string | null} Le texte d'au plus 1 000 caractères, ou `null` s'il est trop court pour servir.
 */
export function buildWikiIntro(extract) {
    const text = String(extract ?? '')
        .replace(/\s+/g, ' ')
        .trim();
    if (text.length < MIN_LENGTH) return null;
    if (text.length <= MAX_LENGTH) return text;

    const lastSentenceEnd = text.slice(0, MAX_LENGTH).lastIndexOf('. ');
    if (lastSentenceEnd >= MIN_LENGTH) return text.slice(0, lastSentenceEnd + 1);
    return `${text.slice(0, MAX_LENGTH).replace(/\s+\S*$/, '')}…`;
}
