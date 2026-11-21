// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const images = vi.hoisted(() => ({ createImageUpload: vi.fn(), finalizeImageUpload: vi.fn() }));
vi.mock('@/lib/admin/remote-images', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/admin/remote-images')>()),
    ...images,
}));

import { InvalidImageRequestError } from '@/lib/admin/remote-images';
import { POST as finalize } from './finalize';
import { POST as presign } from './index';

type Context = Parameters<typeof presign>[0];

function call(handler: typeof presign, body: unknown) {
    const request = new Request('http://localhost/api/admin/uploads', {
        method: 'POST',
        body: typeof body === 'string' ? body : JSON.stringify(body),
    });
    return handler({ request, locals: {} } as unknown as Context);
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('DEV', true);
});
afterEach(() => vi.unstubAllEnvs());

describe('POST /api/admin/uploads', () => {
    it('renvoie l’URL présignée', async () => {
        images.createImageUpload.mockResolvedValue({ uploadUrl: 'https://r2/x', uploadKey: 'incoming/x' });
        const body = {
            section: 'blog',
            year: '2026',
            slug: 'a',
            filename: 'a.jpg',
            contentType: 'image/jpeg',
            size: 10,
        };
        const response = await call(presign, body);
        expect(await response.json()).toEqual({ uploadUrl: 'https://r2/x', uploadKey: 'incoming/x' });
        expect(images.createImageUpload).toHaveBeenCalledWith('blog', '2026', 'a', {
            filename: 'a.jpg',
            contentType: 'image/jpeg',
            size: 10,
        });
    });

    it('refuse une requête incomplète ou invalide', async () => {
        expect((await call(presign, '{')).status).toBe(400);
        expect((await call(presign, { section: 'astro', filename: 'a', contentType: 'image/jpeg' })).status).toBe(400);
        images.createImageUpload.mockRejectedValue(new InvalidImageRequestError('Type non pris en charge'));
        const response = await call(presign, { section: 'blog', filename: 'a.pdf', contentType: 'application/pdf' });
        expect(response.status).toBe(400);
    });

    it('répond 404 hors dev sans accès accordé', async () => {
        vi.stubEnv('DEV', false);
        expect((await call(presign, {})).status).toBe(404);
        expect((await call(finalize, {})).status).toBe(404);
    });
});

describe('POST /api/admin/uploads/finalize', () => {
    const image = { name: 'a.jpg', width: 10, height: 10, originalBytes: 100, compressedBytes: 50, is360: false };

    it('renvoie l’image au format de la section', async () => {
        images.finalizeImageUpload.mockResolvedValue(image);
        const blog = await call(finalize, {
            section: 'blog',
            year: '2026',
            slug: 'a',
            uploadKey: 'incoming/blog/2026/a/x.jpg',
            filename: 'a.jpg',
            is360: true,
        });
        expect((await blog.json()).saved).toEqual([
            { name: 'a.jpg', path: '/assets/blog/2026/a/a.jpg', originalBytes: 100, compressedBytes: 50, is360: false },
        ]);
        expect(images.finalizeImageUpload).toHaveBeenCalledWith('blog', '2026', 'a', {
            uploadKey: 'incoming/blog/2026/a/x.jpg',
            filename: 'a.jpg',
            is360: true,
        });
        const voyage = await call(finalize, {
            section: 'voyages',
            year: '2025',
            slug: 'troms',
            uploadKey: 'k',
            filename: 'a.jpg',
        });
        expect((await voyage.json()).saved[0].rel).toBe('../../../assets/voyages/2025/troms/a.jpg');
    });

    it('refuse une requête incomplète et traduit les erreurs', async () => {
        expect((await call(finalize, { section: 'blog' })).status).toBe(400);
        images.finalizeImageUpload.mockRejectedValue(new InvalidImageRequestError('Clé d’envoi invalide'));
        const response = await call(finalize, { section: 'blog', uploadKey: 'x', filename: 'a.jpg' });
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: 'Clé d’envoi invalide' });
    });
});
