/**
 * Ouvre l'aperçu réel d'un article non enregistré dans un onglet dédié (`/admin/apercu`).
 */

/** Nom de l'onglet d'aperçu : un nouvel aperçu remplace le précédent au lieu d'ouvrir un onglet de plus. */
const PREVIEW_WINDOW_NAME = 'mp-apercu';

export interface ArticlePreviewRequest {
    section: 'blog' | 'voyages';
    year: string;
    slug: string;
    frontmatter: object;
    body: string;
}

/**
 * Envoie le brouillon à `/api/admin/preview` puis affiche le résultat.
 *
 * POURQUOI l'onglet est ouvert avant la requête : un `window.open` lancé après un `await`
 * n'est plus rattaché au clic et serait bloqué comme pop-up.
 * @param draft Brouillon courant de l'éditeur.
 * @throws Error si l'API refuse le brouillon (message de l'API).
 */
export async function openArticlePreview(draft: ArticlePreviewRequest): Promise<void> {
    const previewWindow = window.open('', PREVIEW_WINDOW_NAME);
    try {
        const res = await fetch('/api/admin/preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(draft),
        });
        const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
        if (!res.ok || !data.url) throw new Error(data.error ?? `HTTP ${res.status}`);
        if (previewWindow) previewWindow.location.href = data.url;
        else window.open(data.url, PREVIEW_WINDOW_NAME);
    } catch (error) {
        previewWindow?.close();
        throw error;
    }
}
