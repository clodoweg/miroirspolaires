/**
 * Liste des extensions Tiptap partagées par l'éditeur WYSIWYG et le pont Markdown.
 *
 * POURQUOI : le schéma doit être strictement identique côté éditeur (avec vues React)
 * et côté conversion Markdown, sinon les clés de correspondance du source brut divergent.
 */
import type { AnyExtension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { ImageGroupNode, RawHtmlNode, RawMarkdownNode } from './nodes';

/**
 * Construit les extensions de base (sans vues React ni extensions d'interface).
 * @returns Extensions Tiptap du contenu des articles.
 */
export function getContentExtensions(): AnyExtension[] {
    return [
        StarterKit.configure({
            // POURQUOI : le Markdown n'a pas de souligné ; le proposer ferait perdre la mise en forme à l'enregistrement.
            underline: false,
            heading: { levels: [2, 3, 4] },
            link: { openOnClick: false, autolink: true, HTMLAttributes: { target: null, rel: null } },
        }),
        ImageGroupNode,
        RawHtmlNode,
        RawMarkdownNode,
    ];
}
