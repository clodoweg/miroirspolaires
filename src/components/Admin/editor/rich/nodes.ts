/**
 * Nœuds Tiptap propres aux articles de Miroirs Polaires (schéma seul, sans vue React).
 *
 * - `imageGroup` : un paragraphe Markdown fait uniquement d'images (+ légendes en fin de ligne).
 *   Une image = figure, plusieurs = galerie justifiée, alt `360:` = photosphère (rehype-masonry/figure).
 * - `rawHtml` : un bloc HTML brut (vidéo YouTube, div de mise en page), conservé tel quel.
 * - `rawMarkdown` : tout bloc Markdown que l'éditeur ne sait pas représenter fidèlement.
 *
 * POURQUOI : séparer le schéma des NodeViews permet au pont Markdown (`markdown-bridge.ts`)
 * et à ses tests de tourner sans React ni DOM d'édition.
 */
import { Node } from '@tiptap/core';

/** Une image d'un groupe, telle qu'écrite dans le Markdown. */
export interface ImageGroupItem {
    src: string;
    alt: string;
    title?: string | null;
    /**
     * Texte Markdown exact de l'image (`![alt](src)`). Vide quand l'image a été modifiée
     * dans l'éditeur : elle est alors réécrite à partir de `alt`, `src` et `title`.
     */
    raw: string;
    /**
     * Texte qui suit l'image jusqu'à l'image suivante (ou la fin du paragraphe) : saut de ligne
     * et éventuelle légende Markdown en ligne. Conservé octet pour octet.
     */
    trailing: string;
}

/** Préfixe d'alt qui transforme une image en photosphère interactive sur le site public. */
export const PHOTO_SPHERE_ALT_PREFIX = '360:';

/**
 * Indique si une image est une photo 360°, selon les mêmes règles que `rehype-masonry.mjs`.
 * @param item Image du groupe.
 * @returns `true` si l'image sera rendue par Pannellum.
 */
export function isPhotoSphere(item: Pick<ImageGroupItem, 'alt' | 'src'>): boolean {
    return item.alt.startsWith(PHOTO_SPHERE_ALT_PREFIX) || item.src.includes('#360');
}

/**
 * Légende en ligne d'une image (texte Markdown qui suit l'image dans le même paragraphe).
 * @param item Image du groupe.
 * @returns La légende sans espaces de bord, ou une chaîne vide.
 */
export function getInlineCaption(item: Pick<ImageGroupItem, 'trailing'>): string {
    return item.trailing.trim();
}

/**
 * Remplace la légende en ligne d'une image en conservant un saut de ligne avant l'image suivante.
 * @param item Image du groupe.
 * @param caption Nouvelle légende Markdown (vide pour la retirer).
 * @param isLast L'image est-elle la dernière du groupe ?
 * @returns Une copie de l'image avec le nouveau `trailing`.
 */
export function withInlineCaption(item: ImageGroupItem, caption: string, isLast: boolean): ImageGroupItem {
    const clean = caption.trim();
    if (clean === getInlineCaption(item)) return item;
    const trailing = clean ? `\n${clean}${isLast ? '' : '\n'}` : isLast ? '' : '\n';
    return { ...item, trailing };
}

export const ImageGroupNode = Node.create({
    name: 'imageGroup',
    group: 'block',
    atom: true,
    draggable: true,
    selectable: true,

    addAttributes() {
        return {
            items: {
                default: [] as ImageGroupItem[],
                // POURQUOI : les attributs vivent dans le JSON ProseMirror ; le HTML ne sert qu'au copier-coller interne.
                parseHTML: (element: HTMLElement) => {
                    try {
                        return JSON.parse(element.getAttribute('data-items') ?? '[]') as ImageGroupItem[];
                    } catch {
                        return [];
                    }
                },
                renderHTML: (attributes: { items: ImageGroupItem[] }) => ({
                    'data-items': JSON.stringify(attributes.items),
                }),
            },
        };
    },

    parseHTML() {
        return [{ tag: 'div[data-image-group]' }];
    },

    renderHTML({ HTMLAttributes }) {
        return ['div', { ...HTMLAttributes, 'data-image-group': '' }];
    },
});

export const RawHtmlNode = Node.create({
    name: 'rawHtml',
    group: 'block',
    atom: true,
    draggable: true,
    selectable: true,

    addAttributes() {
        return {
            html: {
                default: '',
                parseHTML: (element: HTMLElement) => element.getAttribute('data-html') ?? '',
                renderHTML: (attributes: { html: string }) => ({ 'data-html': attributes.html }),
            },
        };
    },

    parseHTML() {
        return [{ tag: 'div[data-raw-html]' }];
    },

    renderHTML({ HTMLAttributes }) {
        return ['div', { ...HTMLAttributes, 'data-raw-html': '' }];
    },
});

export const RawMarkdownNode = Node.create({
    name: 'rawMarkdown',
    group: 'block',
    atom: true,
    draggable: true,
    selectable: true,

    addAttributes() {
        return {
            markdown: {
                default: '',
                parseHTML: (element: HTMLElement) => element.getAttribute('data-markdown') ?? '',
                renderHTML: (attributes: { markdown: string }) => ({ 'data-markdown': attributes.markdown }),
            },
        };
    },

    parseHTML() {
        return [{ tag: 'div[data-raw-markdown]' }];
    },

    renderHTML({ HTMLAttributes }) {
        return ['div', { ...HTMLAttributes, 'data-raw-markdown': '' }];
    },
});
