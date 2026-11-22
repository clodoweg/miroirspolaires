/**
 * Pont sans perte entre le Markdown des articles (blog, voyages) et le document Tiptap.
 *
 * Principe :
 * 1. Le Markdown est découpé en blocs de premier niveau par le lexer de marked
 *    (le même moteur que `@tiptap/markdown`).
 * 2. Chaque bloc devient un nœud : paragraphe d'images → `imageGroup`, HTML → `rawHtml`,
 *    bloc standard → nœuds Tiptap. Un bloc standard que Tiptap ne saurait pas réécrire à
 *    l'identique (image en ligne, HTML en ligne…) devient `rawMarkdown`, éditable en source.
 * 3. Le texte source de chaque bloc est mémorisé, indexé par le JSON normalisé du nœud.
 *    À l'enregistrement, un bloc inchangé est réécrit avec son texte d'origine, octet pour octet :
 *    seuls les blocs réellement modifiés sont régénérés.
 *
 * POURQUOI : les plugins rehype (`rehype-masonry`, `rehype-figure`) dépendent de la forme exacte
 * du Markdown (images consécutives, légende sur la ligne suivante, alt `360:`). On ne doit
 * jamais réécrire un article existant juste parce qu'il a été ouvert dans l'éditeur.
 */
import { getSchema, type JSONContent } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
import type { Schema } from '@tiptap/pm/model';
import { marked, type Token, type Tokens } from 'marked';
import { getContentExtensions } from './extensions';
import type { ImageGroupItem } from './nodes';

/** Texte source d'un bloc et séparateur qui le suivait dans le fichier d'origine. */
export interface BlockSource {
    /** Source du bloc, sans les blancs de fin. */
    raw: string;
    /** Blancs (sauts de ligne, lignes vides) qui suivaient le bloc. */
    separator: string;
    /** Clé du bloc qui le suivait, pour savoir si le séparateur d'origine reste valable. */
    nextKey: string | null;
}

/** Texte source des blocs, indexé par le JSON normalisé du nœud. */
export type BlockSources = Map<string, BlockSource>;

export interface ParsedMarkdownBody {
    doc: JSONContent;
    sources: BlockSources;
}

/** Contexte de conversion réutilisable (schéma + gestionnaire Markdown de Tiptap). */
export interface MarkdownBridge {
    schema: Schema;
    manager: MarkdownManager;
}

/**
 * Crée le contexte de conversion à partir des extensions de contenu.
 * @returns Le schéma ProseMirror et le gestionnaire Markdown associés.
 */
export function createMarkdownBridge(): MarkdownBridge {
    const extensions = getContentExtensions();
    return {
        schema: getSchema(extensions),
        manager: new MarkdownManager({ extensions, markedOptions: { gfm: true } }),
    };
}

/**
 * Clé de correspondance d'un nœud : son JSON après passage dans le schéma,
 * pour que les attributs par défaut soient présents comme dans `editor.getJSON()`.
 */
function nodeKey(bridge: MarkdownBridge, node: JSONContent): string | null {
    try {
        return JSON.stringify(bridge.schema.nodeFromJSON(node).toJSON());
    } catch {
        return null;
    }
}

function normalizeHtml(html: string): string {
    return html
        .replace(/>\s+</g, '><')
        .replace(/\s+<\//g, '</')
        .replace(/\s+/g, ' ')
        .trim();
}

function renderHtml(markdown: string): string {
    return normalizeHtml(marked.parse(markdown, { gfm: true, async: false }));
}

/**
 * Découpe un paragraphe composé uniquement d'images (chacune suivie d'une éventuelle légende
 * en ligne) en éléments d'`imageGroup`.
 * @returns Les images, ou `null` si le paragraphe contient autre chose.
 */
function parseImageParagraph(token: Tokens.Paragraph): ImageGroupItem[] | null {
    const inline = token.tokens ?? [];
    if (inline.length === 0 || inline[0].type !== 'image') return null;
    const text = token.raw.replace(/\n+$/, '');
    if (inline.map((t) => t.raw).join('') !== text) return null;

    const items: ImageGroupItem[] = [];
    for (const child of inline) {
        if (child.type === 'image') {
            const image = child as Tokens.Image;
            items.push({ src: image.href, alt: image.text, title: image.title ?? null, raw: image.raw, trailing: '' });
        } else {
            // POURQUOI : la légende Markdown d'une image ne doit pas elle-même contenir d'image.
            if (child.type === 'link' && /!\[/.test(child.raw)) return null;
            items[items.length - 1].trailing += child.raw;
        }
    }
    return items;
}

function rawMarkdownNode(markdown: string): JSONContent {
    return { type: 'rawMarkdown', attrs: { markdown } };
}

/**
 * Convertit un bloc standard via Tiptap, en vérifiant que sa réécriture produit le même HTML.
 * Sinon le bloc reste en Markdown brut pour ne rien perdre.
 */
function parseStandardBlock(bridge: MarkdownBridge, raw: string): JSONContent {
    const source = raw.replace(/\n+$/, '');
    try {
        const parsed = bridge.manager.parse(source);
        const nodes = parsed.content ?? [];
        if (nodes.length !== 1) return rawMarkdownNode(source);
        const rewritten = bridge.manager.serialize({ type: 'doc', content: nodes });
        if (renderHtml(rewritten) !== renderHtml(source)) return rawMarkdownNode(source);
        return nodes[0];
    } catch {
        return rawMarkdownNode(source);
    }
}

function tokenToNode(bridge: MarkdownBridge, token: Token): JSONContent {
    const source = token.raw.replace(/\n+$/, '');
    if (token.type === 'html') return { type: 'rawHtml', attrs: { html: source } };
    if (token.type === 'paragraph') {
        const items = parseImageParagraph(token as Tokens.Paragraph);
        if (items) return { type: 'imageGroup', attrs: { items } };
    }
    if (['paragraph', 'heading', 'list', 'blockquote', 'hr', 'code'].includes(token.type)) {
        return parseStandardBlock(bridge, token.raw);
    }
    return rawMarkdownNode(source);
}

/**
 * Convertit le corps Markdown d'un article en document Tiptap.
 * @param bridge Contexte créé par `createMarkdownBridge()`.
 * @param markdown Corps de l'article, sans frontmatter.
 * @returns Le document et le texte source de chaque bloc (pour une réécriture sans perte).
 */
export function parseMarkdownBody(bridge: MarkdownBridge, markdown: string): ParsedMarkdownBody {
    const sources: BlockSources = new Map();
    const content: JSONContent[] = [];
    const blocks: { key: string | null; raw: string; separator: string }[] = [];

    for (const token of marked.lexer(markdown, { gfm: true })) {
        if (token.type === 'space') {
            // POURQUOI : les lignes vides appartiennent au séparateur du bloc précédent.
            if (blocks.length > 0) blocks[blocks.length - 1].separator += token.raw;
            continue;
        }
        const node = tokenToNode(bridge, token);
        content.push(node);
        const raw = token.raw.replace(/\s+$/, '');
        blocks.push({ key: nodeKey(bridge, node), raw, separator: token.raw.slice(raw.length) });
    }

    const seen = new Set<string>();
    blocks.forEach((block, index) => {
        if (!block.key) return;
        // POURQUOI : deux blocs identiques partageraient la même clé ; on ne garde que le premier
        // pour éviter qu'un séparateur atypique soit appliqué au mauvais endroit.
        if (seen.has(block.key)) {
            sources.delete(block.key);
            return;
        }
        seen.add(block.key);
        sources.set(block.key, {
            raw: block.raw,
            separator: block.separator,
            nextKey: blocks[index + 1]?.key ?? null,
        });
    });

    if (content.length === 0) content.push({ type: 'paragraph' });
    return { doc: { type: 'doc', content }, sources };
}

/**
 * Parse un fragment Markdown à insérer dans l'éditeur (image, bloc collé…).
 * @param bridge Contexte de conversion.
 * @param markdown Fragment Markdown.
 * @returns Les nœuds de premier niveau du fragment.
 */
export function parseMarkdownFragment(bridge: MarkdownBridge, markdown: string): JSONContent[] {
    return (parseMarkdownBody(bridge, markdown).doc.content ?? []).filter((n) => !isEmptyParagraph(n));
}

function escapeAlt(alt: string): string {
    return alt.replace(/([[\]\\])/g, '\\$1');
}

// POURQUOI : la barre oblique inverse doit être échappée avec le guillemet, sinon un titre qui finit par `\`
// fermerait mal la chaîne (`"titre\"`) et casserait l'image (alerte CodeQL « Incomplete string escaping »).
function escapeTitle(title: string): string {
    return title.replace(/(["\\])/g, '\\$1');
}

/**
 * Écrit une image Markdown à partir de ses attributs.
 * @param item Image (src, alt, title).
 * @returns `![alt](src "title")`, avec chevrons si l'URL contient des espaces ou parenthèses.
 */
export function buildImageMarkdown(item: Pick<ImageGroupItem, 'src' | 'alt' | 'title'>): string {
    const src = /[\s()]/.test(item.src) ? `<${item.src}>` : item.src;
    const title = item.title ? ` "${escapeTitle(item.title)}"` : '';
    return `![${escapeAlt(item.alt)}](${src}${title})`;
}

function serializeImageGroup(items: ImageGroupItem[]): string {
    return items
        .map((item, index) => {
            const isLast = index === items.length - 1;
            const image = item.raw || buildImageMarkdown(item);
            let trailing = item.trailing;
            if (isLast) trailing = trailing.replace(/\s+$/, '');
            // POURQUOI : sans saut de ligne final, la légende se collerait à l'image suivante.
            else if (!/\n\s*$/.test(trailing)) trailing = `${trailing.replace(/\s+$/, '')}\n`;
            return image + trailing;
        })
        .join('');
}

function isEmptyParagraph(node: JSONContent): boolean {
    return node.type === 'paragraph' && (!node.content || node.content.length === 0);
}

function serializeNode(bridge: MarkdownBridge, node: JSONContent): string {
    switch (node.type) {
        case 'imageGroup':
            return serializeImageGroup((node.attrs?.items as ImageGroupItem[]) ?? []);
        case 'rawHtml':
            return String(node.attrs?.html ?? '').replace(/\s+$/, '');
        case 'rawMarkdown':
            return String(node.attrs?.markdown ?? '').replace(/\s+$/, '');
        default:
            return bridge.manager.serialize({ type: 'doc', content: [node] }).replace(/\s+$/, '');
    }
}

/**
 * Réécrit le document Tiptap en Markdown, en réutilisant le texte source des blocs inchangés.
 * @param bridge Contexte de conversion.
 * @param doc Document Tiptap (`editor.getJSON()`).
 * @param sources Texte source mémorisé par `parseMarkdownBody()` (optionnel).
 * @returns Le corps Markdown, terminé par un saut de ligne (chaîne vide si le document est vide).
 */
export function serializeMarkdownBody(
    bridge: MarkdownBridge,
    doc: JSONContent,
    sources: BlockSources = new Map(),
): string {
    const nodes = (doc.content ?? []).filter((node) => !isEmptyParagraph(node));
    const keys = nodes.map((node) => nodeKey(bridge, node));
    let output = '';
    nodes.forEach((node, index) => {
        const source = keys[index] ? sources.get(keys[index]) : undefined;
        const block = source ? source.raw : serializeNode(bridge, node);
        if (!block.trim()) return;
        // POURQUOI : le séparateur d'origine n'est sûr que si le voisin est le même ; sinon une ligne
        // vide est imposée pour que deux paragraphes (ou une légende et une image) ne fusionnent pas.
        const keepsSeparator =
            source && (source.nextKey === (keys[index + 1] ?? null) || /\n[ \t]*\n/.test(source.separator));
        output += block + (keepsSeparator ? source.separator : '\n\n');
    });
    output = output.replace(/\s+$/, '');
    return output ? `${output}\n` : '';
}
