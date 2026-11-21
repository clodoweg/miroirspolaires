/**
 * Tests du pont Markdown ⇄ Tiptap : aller-retour sur tous les articles réels du dépôt,
 * puis cas d'édition (légende, réordonnancement, insertion).
 */
import fs from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';
import { marked } from 'marked';
import { describe, expect, it } from 'vitest';
import type { JSONContent } from '@tiptap/core';
import { parseFrontmatter } from '@/lib/admin/shared';
import {
    createMarkdownBridge,
    parseMarkdownBody,
    parseMarkdownFragment,
    serializeMarkdownBody,
} from './markdown-bridge';
import { withInlineCaption, type ImageGroupItem } from './nodes';

const bridge = createMarkdownBridge();
const CONTENT_FILES = fg.sync('src/content/{blog,voyages}/**/*.md', { cwd: process.cwd() });

function readBody(file: string): string {
    return parseFrontmatter(fs.readFileSync(path.join(process.cwd(), file), 'utf8')).body;
}

/** Simule `editor.getJSON()` : le document passe par le schéma, qui ajoute les attributs par défaut. */
function throughSchema(doc: JSONContent): JSONContent {
    return bridge.schema.nodeFromJSON(doc).toJSON() as JSONContent;
}

function normalizeBody(body: string): string {
    const trimmed = body.replace(/\r\n/g, '\n').replace(/^\n+/, '').replace(/\s+$/, '');
    return trimmed ? `${trimmed}\n` : '';
}

function renderHtml(markdown: string): string {
    return (marked.parse(markdown, { gfm: true, async: false }) as string)
        .replace(/>\s+</g, '><')
        .replace(/\s+<\//g, '</')
        .replace(/\s+/g, ' ')
        .trim();
}

function countNodes(doc: JSONContent, type: string): number {
    return (doc.content ?? []).filter((n) => n.type === type).length;
}

describe('markdown-bridge : corpus réel', () => {
    it('trouve les articles du dépôt', () => {
        expect(CONTENT_FILES.length).toBeGreaterThan(20);
    });

    it.each(CONTENT_FILES)('%s : réécriture octet pour octet sans modification', (file) => {
        const body = readBody(file);
        const { doc, sources } = parseMarkdownBody(bridge, body);
        expect(serializeMarkdownBody(bridge, throughSchema(doc), sources)).toBe(normalizeBody(body));
    });

    it.each(CONTENT_FILES)('%s : rendu HTML identique même si tous les blocs sont régénérés', (file) => {
        const body = readBody(file);
        const { doc } = parseMarkdownBody(bridge, body);
        const regenerated = serializeMarkdownBody(bridge, throughSchema(doc));
        expect(renderHtml(regenerated)).toBe(renderHtml(body));
    });

    it('représente presque tout en blocs éditables (peu de Markdown brut)', () => {
        let raw = 0;
        let total = 0;
        for (const file of CONTENT_FILES) {
            const { doc } = parseMarkdownBody(bridge, readBody(file));
            raw += countNodes(doc, 'rawMarkdown');
            total += doc.content?.length ?? 0;
        }
        expect(raw / total).toBeLessThan(0.02);
    });

    it('reconnaît galeries, photosphères et blocs HTML', () => {
        const fjords = parseMarkdownBody(bridge, readBody('src/content/blog/2026/la-route-des-fjords.md')).doc;
        const groups = (fjords.content ?? []).filter((n) => n.type === 'imageGroup');
        const items = groups.flatMap((g) => g.attrs?.items as ImageGroupItem[]);
        expect(items.some((it) => it.alt.startsWith('360:'))).toBe(true);
        const sermilik = parseMarkdownBody(bridge, readBody('src/content/blog/2025/vol-au-dessus-du-sermilik.md')).doc;
        expect(countNodes(sermilik, 'rawHtml')).toBeGreaterThan(0);
    });
});

describe('markdown-bridge : édition', () => {
    const source =
        '## Titre\n\nUn paragraphe.\n\n![a](/assets/blog/2026/x/a.jpg)\n![b](/assets/blog/2026/x/b.jpg)\n\nFin.\n';

    it('ne régénère que le bloc modifié', () => {
        const { doc, sources } = parseMarkdownBody(bridge, source);
        const edited = throughSchema(doc);
        edited.content![1] = { type: 'paragraph', content: [{ type: 'text', text: 'Autre texte.' }] };
        expect(serializeMarkdownBody(bridge, edited, sources)).toBe(
            '## Titre\n\nAutre texte.\n\n![a](/assets/blog/2026/x/a.jpg)\n![b](/assets/blog/2026/x/b.jpg)\n\nFin.\n',
        );
    });

    it('ajoute une légende en ligne sous une image de galerie', () => {
        const { doc, sources } = parseMarkdownBody(bridge, source);
        const edited = throughSchema(doc);
        const items = edited.content![2].attrs!.items as ImageGroupItem[];
        edited.content![2].attrs!.items = [withInlineCaption(items[0], 'Une légende', false), items[1]];
        expect(serializeMarkdownBody(bridge, edited, sources)).toContain(
            '![a](/assets/blog/2026/x/a.jpg)\nUne légende\n![b](/assets/blog/2026/x/b.jpg)\n\nFin.',
        );
    });

    it('garde les images séparées après réordonnancement', () => {
        const { doc, sources } = parseMarkdownBody(bridge, source);
        const edited = throughSchema(doc);
        const items = edited.content![2].attrs!.items as ImageGroupItem[];
        edited.content![2].attrs!.items = [items[1], items[0]];
        expect(serializeMarkdownBody(bridge, edited, sources)).toContain(
            '![b](/assets/blog/2026/x/b.jpg)\n![a](/assets/blog/2026/x/a.jpg)\n\nFin.',
        );
    });

    it('sépare par une ligne vide un bloc déplacé', () => {
        const { doc, sources } = parseMarkdownBody(bridge, '## Titre\nTexte collé.\n');
        const edited = throughSchema(doc);
        edited.content!.reverse();
        expect(serializeMarkdownBody(bridge, edited, sources)).toBe('Texte collé.\n\n## Titre\n');
    });

    it('écrit une image réécrite avec chevrons si son URL contient un espace', () => {
        const nodes = parseMarkdownFragment(bridge, '![x](/a.jpg)\n');
        const items = nodes[0].attrs!.items as ImageGroupItem[];
        nodes[0].attrs!.items = [{ ...items[0], src: '/a b.jpg', alt: 'x [1]', raw: '' }];
        expect(serializeMarkdownBody(bridge, { type: 'doc', content: nodes })).toBe('![x \\[1\\]](</a b.jpg>)\n');
    });

    it('ignore les paragraphes vides ajoutés par l’éditeur', () => {
        const doc: JSONContent = {
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A' }] }, { type: 'paragraph' }],
        };
        expect(serializeMarkdownBody(bridge, doc)).toBe('A\n');
    });

    it('conserve les blocs HTML et la mise en forme en ligne régénérée', () => {
        const doc: JSONContent = {
            type: 'doc',
            content: [
                {
                    type: 'paragraph',
                    content: [
                        { type: 'text', text: 'gras', marks: [{ type: 'bold' }] },
                        { type: 'text', text: ' et ' },
                        { type: 'text', text: 'lien', marks: [{ type: 'link', attrs: { href: '/blog' } }] },
                    ],
                },
                { type: 'rawHtml', attrs: { html: '<div>x</div>' } },
            ],
        };
        expect(serializeMarkdownBody(bridge, doc)).toBe('**gras** et [lien](/blog)\n\n<div>x</div>\n');
    });
});
