/**
 * Catalogue des blocs insérables depuis le menu « / », le bouton « + » et la barre d'outils.
 */
import type { Editor } from '@tiptap/core';

export type InsertCommandId =
    | 'paragraph'
    | 'heading2'
    | 'heading3'
    | 'heading4'
    | 'bulletList'
    | 'orderedList'
    | 'blockquote'
    | 'horizontalRule'
    | 'images'
    | 'photoSphere'
    | 'youtube'
    | 'html';

export interface InsertCommand {
    id: InsertCommandId;
    label: string;
    hint: string;
    /** Mots-clés de recherche (sans accents) pour le filtre du menu « / ». */
    keywords: string;
}

export const INSERT_COMMANDS: InsertCommand[] = [
    { id: 'paragraph', label: 'Texte', hint: 'Paragraphe simple', keywords: 'texte paragraphe text' },
    {
        id: 'heading2',
        label: 'Titre de section',
        hint: '## — ex. une journée du récit',
        keywords: 'titre h2 section jour',
    },
    { id: 'heading3', label: 'Sous-titre', hint: '###', keywords: 'sous titre h3' },
    { id: 'heading4', label: 'Petit titre', hint: '####', keywords: 'petit titre h4' },
    { id: 'bulletList', label: 'Liste à puces', hint: '- élément', keywords: 'liste puces ul' },
    { id: 'orderedList', label: 'Liste numérotée', hint: '1. élément', keywords: 'liste numerotee ol' },
    { id: 'blockquote', label: 'Citation', hint: '> texte', keywords: 'citation quote' },
    { id: 'horizontalRule', label: 'Séparateur', hint: '---', keywords: 'separateur ligne hr' },
    {
        id: 'images',
        label: 'Image ou galerie',
        hint: 'Téléverser une ou plusieurs photos',
        keywords: 'image photo galerie upload',
    },
    {
        id: 'photoSphere',
        label: 'Photo 360°',
        hint: 'Panorama interactif, pleine résolution',
        keywords: '360 panorama sphere',
    },
    { id: 'youtube', label: 'Vidéo YouTube', hint: 'Intégrer une vidéo', keywords: 'video youtube embed' },
    { id: 'html', label: 'Bloc HTML', hint: 'Code HTML libre', keywords: 'html code embed' },
];

/**
 * Filtre les commandes selon la saisie qui suit « / ».
 * @param query Texte saisi après la barre oblique.
 * @returns Les commandes correspondantes, dans l'ordre du catalogue.
 */
export function filterInsertCommands(query: string): InsertCommand[] {
    const normalized = query.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    if (!normalized) return INSERT_COMMANDS;
    return INSERT_COMMANDS.filter((c) =>
        `${c.label} ${c.keywords}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(normalized),
    );
}

/**
 * Extrait l'identifiant d'une vidéo YouTube depuis une URL (watch, youtu.be, embed, shorts) ou un identifiant nu.
 * @param input URL ou identifiant saisi par l'auteur.
 * @returns L'identifiant, ou `null` si la saisie n'est pas reconnue.
 */
export function parseYoutubeId(input: string): string | null {
    const value = input.trim();
    if (/^[\w-]{11}$/.test(value)) return value;
    const match = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/.exec(value);
    return match?.[1] ?? null;
}

/**
 * HTML d'intégration YouTube, identique à celui déjà utilisé dans les articles (`vol-au-dessus-du-sermilik.md`).
 * @param videoId Identifiant YouTube.
 * @param title Titre accessible de l'iframe.
 * @returns Bloc HTML responsive 16/9.
 */
export function buildYoutubeEmbed(videoId: string, title: string): string {
    const safeTitle = title.replace(/"/g, '&quot;');
    return `<div style="padding:56.25% 0 0 0;position:relative;"><iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen style="position:absolute;top:0;left:0;width:100%;height:100%;" title="${safeTitle}"></iframe></div>`;
}

/**
 * Applique une commande de mise en forme de bloc (les commandes d'images sont gérées par l'éditeur).
 * @param editor Instance Tiptap.
 * @param id Commande à exécuter.
 * @returns `true` si la commande a été traitée ici.
 */
export function runBlockCommand(editor: Editor, id: InsertCommandId): boolean {
    const chain = editor.chain().focus();
    switch (id) {
        case 'paragraph':
            chain.setParagraph().run();
            return true;
        case 'heading2':
            chain.setHeading({ level: 2 }).run();
            return true;
        case 'heading3':
            chain.setHeading({ level: 3 }).run();
            return true;
        case 'heading4':
            chain.setHeading({ level: 4 }).run();
            return true;
        case 'bulletList':
            chain.toggleBulletList().run();
            return true;
        case 'orderedList':
            chain.toggleOrderedList().run();
            return true;
        case 'blockquote':
            chain.toggleBlockquote().run();
            return true;
        case 'horizontalRule':
            chain.setHorizontalRule().run();
            return true;
        case 'html':
            chain.insertContent({ type: 'rawHtml', attrs: { html: '' } }).run();
            return true;
        default:
            return false;
    }
}
