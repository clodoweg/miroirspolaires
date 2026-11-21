/**
 * Copie de texte dans le presse-papiers depuis l'admin
 *
 * Responsabilité : copier un texte et dire si cela a réussi.
 *
 * POURQUOI : `navigator.clipboard` est absent hors contexte sécurisé (admin ouverte par une adresse
 * réseau) et refuse d'écrire dans certains navigateurs intégrés. Le repli `execCommand`, bien que
 * déprécié, fonctionne dans ces deux cas.
 */

/**
 * Copie un texte par une zone de texte temporaire.
 *
 * @param text - Texte à copier.
 * @returns `true` si le navigateur a accepté la copie.
 */
function copyWithTextarea(text: string): boolean {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
        return document.execCommand('copy');
    } catch {
        return false;
    } finally {
        textarea.remove();
        previouslyFocused?.focus();
    }
}

/**
 * Copie un texte dans le presse-papiers.
 *
 * @param text - Texte à copier.
 * @returns `true` si la copie a réussi.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
    if (navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            // POURQUOI : écriture refusée par le navigateur : le repli peut encore réussir.
        }
    }
    return copyWithTextarea(text);
}
