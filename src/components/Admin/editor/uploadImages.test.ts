import { describe, expect, it, vi } from 'vitest';
import { uploadAdminImages } from './uploadImages';

function file(name: string) {
    return new File(['x'], name, { type: 'image/jpeg' });
}

describe('uploadAdminImages', () => {
    it('envoie en multipart vers la route locale', async () => {
        const fetchImpl = vi.fn(async () => Response.json({ saved: [{ name: 'a.jpg' }] }));
        const result = await uploadAdminImages({
            section: 'voyages',
            year: '2025',
            slug: 'troms',
            files: [file('a.jpg')],
            is360: true,
            remote: false,
            fetchImpl: fetchImpl as unknown as typeof fetch,
        });
        expect(result).toEqual({ ok: true, saved: [{ name: 'a.jpg' }] });
        const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe('/api/admin/voyages-images/2025/troms');
        expect((init.body as FormData).get('is360')).toBe('true');
    });

    it('signale l’erreur de la route locale', async () => {
        const fetchImpl = vi.fn(async () => Response.json({ error: 'trop gros' }, { status: 413 }));
        expect(
            await uploadAdminImages({
                section: 'blog',
                year: '2026',
                slug: 'a',
                files: [file('a.jpg')],
                remote: false,
                fetchImpl: fetchImpl as unknown as typeof fetch,
            }),
        ).toEqual({ ok: false, error: 'trop gros' });
    });

    it('à distance : présigne, dépose sur R2 puis finalise chaque fichier', async () => {
        const fetchImpl = vi.fn(async (url: string) => {
            if (url === '/api/admin/uploads') return Response.json({ uploadUrl: 'https://r2/put', uploadKey: 'k' });
            if (url === 'https://r2/put') return new Response(null, { status: 200 });
            return Response.json({ saved: [{ name: 'final.jpg', path: '/assets/blog/2026/a/final.jpg' }] });
        });
        const result = await uploadAdminImages({
            section: 'blog',
            year: '2026',
            slug: 'a',
            files: [file('a.jpg'), file('b.jpg')],
            remote: true,
            fetchImpl: fetchImpl as unknown as typeof fetch,
        });
        expect(result).toEqual({
            ok: true,
            saved: [
                { name: 'final.jpg', path: '/assets/blog/2026/a/final.jpg' },
                { name: 'final.jpg', path: '/assets/blog/2026/a/final.jpg' },
            ],
        });
        expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
            '/api/admin/uploads',
            'https://r2/put',
            '/api/admin/uploads/finalize',
            '/api/admin/uploads',
            'https://r2/put',
            '/api/admin/uploads/finalize',
        ]);
        const finalizeBody = JSON.parse(String((fetchImpl.mock.calls[2] as unknown as [string, RequestInit])[1].body));
        expect(finalizeBody).toEqual({
            section: 'blog',
            year: '2026',
            slug: 'a',
            uploadKey: 'k',
            filename: 'a.jpg',
            is360: false,
        });
    });

    it.each([
        ['présignature', 0, 'a.jpg : refus'],
        ['dépôt R2', 1, 'a.jpg : envoi vers R2 refusé (HTTP 403)'],
        ['finalisation', 2, 'a.jpg : refus'],
    ])('à distance : s’arrête sur un échec de %s', async (_label, failingCall, error) => {
        let call = 0;
        const fetchImpl = vi.fn(async () => {
            const current = call++;
            if (current === failingCall) return Response.json({ error: 'refus' }, { status: 403 });
            if (current === 0) return Response.json({ uploadUrl: 'https://r2/put', uploadKey: 'k' });
            return Response.json({ saved: [] });
        });
        expect(
            await uploadAdminImages({
                section: 'blog',
                year: '2026',
                slug: 'a',
                files: [file('a.jpg')],
                remote: true,
                fetchImpl: fetchImpl as unknown as typeof fetch,
            }),
        ).toEqual({ ok: false, error });
    });
});
