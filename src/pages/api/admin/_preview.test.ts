// @vitest-environment node
/**
 * Tests de la route POST /api/admin/preview.
 */
import { describe, expect, it } from 'vitest';
import { getPreviewDraft } from '@/lib/admin/article-preview';
import { POST } from './preview';

function call(body: string) {
    const request = new Request('http://localhost/api/admin/preview', { method: 'POST', body });
    return POST({ request } as Parameters<typeof POST>[0]);
}

describe('POST /api/admin/preview', () => {
    it('conserve le brouillon et renvoie l’URL de l’aperçu', async () => {
        const draft = {
            section: 'voyages',
            year: '2024',
            slug: 'groenland',
            frontmatter: { title: 'G' },
            body: 'Texte',
        };
        const res = await call(JSON.stringify(draft));
        expect(res.status).toBe(200);
        const data = (await res.json()) as { id: string; url: string };
        expect(data.url).toBe(`/admin/apercu?id=${data.id}`);
        expect(getPreviewDraft(data.id)).toEqual(draft);
    });

    it('refuse un JSON invalide ou un brouillon mal formé', async () => {
        expect((await call('{')).status).toBe(400);
        const res = await call(JSON.stringify({ section: 'blog' }));
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: 'Année invalide.' });
    });
});
