import { describe, it, expect } from 'vitest';
import { rewritePreviewSrc, slugifyTitle } from './preview';

const BLOG = { assetPattern: /\/assets\/blog\/(\d{4})\/([a-z0-9-]+)\//g, apiBase: '/api/admin/images' };
const VOYAGES = {
    assetPattern: /\.\.\/\.\.\/\.\.\/assets\/voyages\/(\d{4})\/([a-z0-9-]+)\//g,
    apiBase: '/api/admin/voyages-images',
};

describe('slugifyTitle', () => {
    it('produit un slug ASCII tronqué à 120 caractères', () => {
        expect(slugifyTitle('Aurores à Tromsø !')).toMatch(/^aurores-a-troms/);
        expect(slugifyTitle('a'.repeat(200))).toHaveLength(120);
    });
});

describe('rewritePreviewSrc', () => {
    it('réécrit les chemins du blog vers la route admin', () => {
        const html = '<img src="/assets/blog/2026/tromso/a.jpg"><img src="/assets/blog/2025/x/b.jpg">';
        expect(rewritePreviewSrc(html, BLOG)).toBe(
            '<img src="/api/admin/images/2026/tromso/a.jpg"><img src="/api/admin/images/2025/x/b.jpg">',
        );
    });

    it('impose l’année et le slug de téléversement quand ils sont fournis', () => {
        const html = '<img src="/assets/blog/2025/ancien/a.jpg">';
        expect(rewritePreviewSrc(html, BLOG, { year: '2026', slug: 'brouillon' })).toBe(
            '<img src="/api/admin/images/2026/brouillon/a.jpg">',
        );
        expect(rewritePreviewSrc(html, BLOG, { year: '2026', slug: null })).toBe(
            '<img src="/api/admin/images/2025/ancien/a.jpg">',
        );
    });

    it('réécrit les chemins relatifs des voyages', () => {
        expect(rewritePreviewSrc('<img src="../../../assets/voyages/2022/spitzberg/a.jpg">', VOYAGES)).toBe(
            '<img src="/api/admin/voyages-images/2022/spitzberg/a.jpg">',
        );
    });
});
