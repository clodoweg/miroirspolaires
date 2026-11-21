// @vitest-environment node
/**
 * Tests de l'aperçu réel : validation, stockage en mémoire, réécriture des images et rendu
 * avec les plugins du site.
 */
import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

// POURQUOI : rehype-masonry sonde R2 pour les images sans dimensions connues ; aucun réseau en test.
vi.mock('probe-image-size', () => ({ default: vi.fn().mockRejectedValue(new Error('offline')) }));

import {
    getPreviewDraft,
    parsePreviewDraft,
    renderArticlePreview,
    savePreviewDraft,
    toLocalPreviewImageUrl,
    type ArticlePreviewDraft,
} from './article-preview';

const DRAFT: ArticlePreviewDraft = {
    section: 'blog',
    year: '2026',
    slug: 'test',
    frontmatter: { title: 'Test', date: '2026-01-01' },
    body: '## Jour 1\n\nTexte.\n\n![a](/assets/blog/2026/test/a.jpg)\n![b](/assets/blog/2026/test/b.jpg)\n\n![c](/assets/blog/2026/test/c.jpg)\nLégende de c\n',
};

describe('parsePreviewDraft', () => {
    it('accepte un brouillon valide', () => {
        expect(parsePreviewDraft(DRAFT)).toEqual(DRAFT);
    });

    it.each([
        [null, 'Corps JSON attendu.'],
        [{ ...DRAFT, section: 'astro' }, 'Section inconnue.'],
        [{ ...DRAFT, year: '26' }, 'Année invalide.'],
        [{ ...DRAFT, slug: '../etc' }, 'Slug invalide.'],
        [{ ...DRAFT, body: 3 }, 'Corps invalide.'],
        [{ ...DRAFT, frontmatter: [] }, 'Frontmatter invalide.'],
    ])('refuse %j', (input, message) => {
        expect(parsePreviewDraft(input)).toBe(message);
    });
});

describe('stockage des brouillons', () => {
    it('relit un brouillon et oublie les plus anciens au-delà de 20', () => {
        const first = savePreviewDraft(DRAFT);
        expect(getPreviewDraft(first)).toEqual(DRAFT);
        for (let i = 0; i < 20; i++) savePreviewDraft(DRAFT);
        expect(getPreviewDraft(first)).toBeUndefined();
        expect(getPreviewDraft('inconnu')).toBeUndefined();
    });
});

describe('toLocalPreviewImageUrl', () => {
    it.each([
        ['https://pub-r2.miroirspolaires.fr/blog/2026/fjords/a.jpg', '/api/admin/images/2026/fjords/a.jpg'],
        ['/assets/blog/2026/fjords/a.jpg', '/api/admin/images/2026/fjords/a.jpg'],
        ['../../../assets/voyages/2009/islande/img-1.jpg', '/api/admin/voyages-images/2009/islande/img-1.jpg'],
        ['https://images.miroirspolaires.fr/w_800,q_80,f_jpeg/blog/2026/x/p.jpg#360', '/api/admin/images/2026/x/p.jpg'],
        ['https://example.com/photo.jpg', null],
    ])('%s → %s', (input, expected) => {
        expect(toLocalPreviewImageUrl(input)).toBe(expected);
    });
});

describe('renderArticlePreview', () => {
    it('rend galerie, figure et légende en ligne comme le site, avec des images locales', async () => {
        const html = await renderArticlePreview(DRAFT);
        expect(html).toContain('<h2');
        expect(html).toContain('justified-gallery');
        expect(html).toMatch(/<figure[^>]*><picture><img src="\/api\/admin\/images\/2026\/test\/c\.jpg"/);
        expect(html).toContain('<figcaption');
        expect(html).toContain('Légende de c</figcaption>');
        expect(html).toContain('src="/api/admin/images/2026/test/a.jpg"');
        expect(html).not.toContain('<source');
        expect(html).not.toMatch(/srcset=/i);
    });

    it('utilise les plugins rehype dans le même ordre que astro.config.mjs', () => {
        const config = fs.readFileSync('astro.config.mjs', 'utf8');
        const block = config.slice(config.indexOf('rehypePlugins'));
        // POURQUOI : la virgule exclut les mentions des commentaires (« before rehypeMasonry: »).
        const order = ['rehypeProbeDimensions,', 'rehypeMasonry,', 'rehypeImageLoading,', 'rehypeFigure,'].map((name) =>
            block.indexOf(name),
        );
        expect(order.every((pos) => pos >= 0)).toBe(true);
        expect([...order].sort((a, b) => a - b)).toEqual(order);
        const source = fs.readFileSync('src/lib/admin/article-preview.ts', 'utf8');
        const preview = source.slice(source.indexOf('const rehypePlugins = ['));
        const previewOrder = ['rehypeProbeDimensions,', 'rehypeMasonry,', 'rehypeImageLoading,', 'rehypeFigure,'].map(
            (name) => preview.indexOf(name),
        );
        expect([...previewOrder].sort((a, b) => a - b)).toEqual(previewOrder);
    });
});
