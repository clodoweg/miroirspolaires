/**
 * Fonctions pures partagées par les éditeurs de contenu (blog, voyages) : slug des titres et
 * réécriture des chemins d'images vers la route admin qui lit `src/assets`.
 */
import { slugify } from '@/utils/normalize';

/** Longueur maximale d'un slug, alignée sur `validateSlug` (`src/lib/admin/shared.ts`). */
const MAX_SLUG_LENGTH = 120;

/**
 * Convertit un titre en slug d'article ou de voyage.
 *
 * @param input - Titre ou saisie libre.
 * @returns Le slug, tronqué à 120 caractères.
 */
export function slugifyTitle(input: string): string {
    return slugify(input).slice(0, MAX_SLUG_LENGTH);
}

export interface PreviewSrcRewrite {
    /** Motif global des chemins d'assets ; groupes 1 et 2 = année et slug. */
    assetPattern: RegExp;
    /** Route admin qui sert les images depuis `src/assets` (sans `/` final). */
    apiBase: string;
}

/**
 * Réécrit les chemins d'images du HTML de l'aperçu vers la route admin qui lit `src/assets`.
 *
 * @param html - HTML généré par `marked`.
 * @param rewrite - Motif des chemins d'assets et route admin cible.
 * @param override - Année et slug à imposer (images téléversées avant la première sauvegarde).
 * @returns Le HTML réécrit.
 *
 * @example
 * rewritePreviewSrc(html, { assetPattern: /\/assets\/blog\/(\d{4})\/([a-z0-9-]+)\//g, apiBase: '/api/admin/images' })
 */
export function rewritePreviewSrc(
    html: string,
    rewrite: PreviewSrcRewrite,
    override?: { year?: string | null; slug?: string | null },
): string {
    if (override?.year && override.slug) {
        return html.replace(rewrite.assetPattern, `${rewrite.apiBase}/${override.year}/${override.slug}/`);
    }
    return html.replace(rewrite.assetPattern, `${rewrite.apiBase}/$1/$2/`);
}
