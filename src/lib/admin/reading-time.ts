/**
 * Temps de lecture d'un article de blog
 *
 * Responsabilité : estimer le temps de lecture depuis le corps Markdown, sans appel externe. Partagé par
 * l'éditeur de blog (`blog-files.ts`) et par `scripts/seo/blog-metadata.js`.
 */

const WORDS_PER_MINUTE = 200;

/**
 * Calcule le temps de lecture d'un corps Markdown.
 *
 * POURQUOI : les images sont retirées du décompte, car leur alt et leur chemin ne se lisent pas dans
 * l'article.
 *
 * @param markdown - Corps de l'article.
 * @returns Le temps de lecture (ex. : "8 min"), au minimum "1 min".
 */
export function computeReadingTime(markdown: string): string {
    const text = markdown.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').trim();
    const wordCount = text ? text.split(/\s+/).length : 0;
    return `${Math.max(1, Math.round(wordCount / WORDS_PER_MINUTE))} min`;
}
