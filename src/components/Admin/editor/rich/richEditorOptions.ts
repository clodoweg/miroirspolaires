/**
 * Options transmises par l'éditeur parent (blog ou voyages) aux vues des blocs d'images.
 */

/** Image enregistrée par l'API d'upload de l'admin. */
export interface UploadedImage {
    name: string;
    /** Chemin tel qu'il doit être écrit dans le Markdown (`/assets/blog/…` ou `../../../assets/voyages/…`). */
    path: string;
}

export interface RichEditorImageOptions {
    /** Convertit un chemin du Markdown en URL affichable par le serveur de dev. */
    resolveImageSrc?: (src: string) => string;
    /** Téléverse des fichiers dans le dossier de l'article et renvoie leurs chemins Markdown. */
    uploadImages?: (files: File[]) => Promise<UploadedImage[]>;
    /** Définit une image (chemin Markdown) comme couverture de l'article. */
    onSetCover?: (src: string) => void;
}
