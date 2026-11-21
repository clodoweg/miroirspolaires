// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const files = vi.hoisted(() => ({
    listImages: vi.fn(),
    saveImage: vi.fn(),
    mark360Image: vi.fn(),
}));
const imageProcess = vi.hoisted(() => ({ compressImage: vi.fn() }));

vi.mock('@/lib/admin/blog-files', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/admin/blog-files')>()),
    ...files,
}));
vi.mock('@/lib/admin/image-process', () => imageProcess);

import { GET, POST } from './index';

type Context = Parameters<typeof POST>[0];
const VALID = { year: '2026', slug: 'tromso' };

function upload(form: FormData, params: Record<string, string> = VALID) {
    const request = new Request('http://localhost/api/admin/images/2026/tromso', { method: 'POST', body: form });
    return POST({ params, request } as unknown as Context);
}

function image(name: string, type = 'image/jpeg') {
    return new File([new Uint8Array([1, 2, 3, 4])], name, { type });
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('DEV', true);
    imageProcess.compressImage.mockImplementation(async (_buffer: Buffer, name: string) => ({
        full: {
            filename: name.replace(/\.\w+$/, '.jpg'),
            buffer: Buffer.from('c'),
            originalBytes: 4,
            compressedBytes: 1,
        },
        thumb: null,
    }));
    files.saveImage.mockImplementation(async (_year: string, _slug: string, name: string) => name);
});

afterEach(() => vi.unstubAllEnvs());

describe('GET /api/admin/images/[year]/[slug]', () => {
    it('ajoute le chemin public à chaque image', async () => {
        files.listImages.mockResolvedValue([{ name: 'a.jpg', size: 1 }]);
        const response = await GET({ params: VALID } as unknown as Context);
        expect(await response.json()).toEqual([{ name: 'a.jpg', size: 1, path: '/assets/blog/2026/tromso/a.jpg' }]);
    });

    it('renvoie 400 pour des paramètres invalides et 404 hors dev', async () => {
        expect((await GET({ params: { year: 'x', slug: 'a' } } as unknown as Context)).status).toBe(400);
        vi.stubEnv('DEV', false);
        expect((await GET({ params: VALID } as unknown as Context)).status).toBe(404);
        expect((await upload(new FormData())).status).toBe(404);
        expect(files.listImages).not.toHaveBeenCalled();
    });
});

describe('POST /api/admin/images/[year]/[slug]', () => {
    it('compresse et enregistre chaque fichier en écrasant l’existant', async () => {
        const form = new FormData();
        form.append('files', image('a.png', 'image/png'));
        form.append('files', image('b.jpg'));
        form.append('files', 'pas un fichier');

        const response = await upload(form);

        expect(await response.json()).toEqual({
            ok: true,
            saved: [
                {
                    name: 'a.jpg',
                    path: '/assets/blog/2026/tromso/a.jpg',
                    originalBytes: 4,
                    compressedBytes: 1,
                    is360: false,
                },
                {
                    name: 'b.jpg',
                    path: '/assets/blog/2026/tromso/b.jpg',
                    originalBytes: 4,
                    compressedBytes: 1,
                    is360: false,
                },
            ],
        });
        expect(imageProcess.compressImage.mock.calls.map(([, name, options]) => [name, options])).toEqual([
            ['a.png', {}],
            ['b.jpg', {}],
        ]);
        expect(files.saveImage.mock.calls.map((call) => call[4])).toEqual([true, true]);
        expect(files.mark360Image).not.toHaveBeenCalled();
    });

    it.each(['true', '1'])('traite une photo 360 (is360=%s) en 6000 px q90 et la note au manifeste', async (flag) => {
        const form = new FormData();
        form.append('files', image('pano.jpg'));
        form.set('is360', flag);

        const response = await upload(form);

        expect((await response.json()).saved[0].is360).toBe(true);
        expect(imageProcess.compressImage.mock.calls[0][2]).toEqual({ maxSize: 6000, quality: 90 });
        expect(files.mark360Image).toHaveBeenCalledWith('2026', 'tromso', 'pano.jpg');
    });

    it('refuse un type non image (415) et un fichier trop lourd (413)', async () => {
        const textForm = new FormData();
        textForm.append('files', image('a.txt', 'text/plain'));
        const text = await upload(textForm);
        expect(text.status).toBe(415);
        expect(await text.json()).toEqual({ error: 'a.txt: unsupported type text/plain' });

        const big = image('big.jpg');
        Object.defineProperty(big, 'size', { value: 150 * 1024 * 1024 + 1 });
        const bigForm = new FormData();
        bigForm.append('files', big);
        const request = { formData: async () => bigForm } as unknown as Request;
        expect((await POST({ params: VALID, request } as unknown as Context)).status).toBe(413);
        expect(files.saveImage).not.toHaveBeenCalled();
    });

    it('renvoie 400 sans fichier, sans multipart ou avec des paramètres invalides', async () => {
        expect(await (await upload(new FormData())).json()).toEqual({ error: 'No files' });
        const request = new Request('http://localhost/x', { method: 'POST', body: 'brut' });
        expect(await (await POST({ params: VALID, request } as unknown as Context)).json()).toEqual({
            error: 'Expected multipart/form-data',
        });
        expect((await upload(new FormData(), { year: '2026', slug: '..' })).status).toBe(400);
    });
});
