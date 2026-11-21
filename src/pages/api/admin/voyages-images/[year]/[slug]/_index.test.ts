// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const files = vi.hoisted(() => ({
    listImages: vi.fn(),
    saveImage: vi.fn(),
    relImagePath: vi.fn(
        (year: string, slug: string, name: string) => `../../../assets/voyages/${year}/${slug}/${name}`,
    ),
}));
const imageProcess = vi.hoisted(() => ({ compressImage: vi.fn() }));

vi.mock('@/lib/admin/voyages-files', () => files);
vi.mock('@/lib/admin/image-process', () => imageProcess);

import { GET, POST } from './index';

type Context = Parameters<typeof POST>[0];
const VALID = { year: '2025', slug: 'troms' };

function upload(form: FormData, params: Record<string, string> = VALID) {
    const request = new Request('http://localhost/api/admin/voyages-images/2025/troms', { method: 'POST', body: form });
    return POST({ params, request } as unknown as Context);
}

function image(name: string, type = 'image/jpeg') {
    return new File([new Uint8Array([1, 2, 3])], name, { type });
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('DEV', true);
    imageProcess.compressImage.mockResolvedValue({
        full: { filename: 'fjord.jpg', buffer: Buffer.from('c'), originalBytes: 3, compressedBytes: 1 },
        thumb: { filename: 'fjord-thumb.jpg' },
    });
    files.saveImage.mockResolvedValue('fjord.jpg');
});

afterEach(() => vi.unstubAllEnvs());

describe('GET /api/admin/voyages-images/[year]/[slug]', () => {
    it('renvoie la liste des images', async () => {
        files.listImages.mockResolvedValue([{ name: 'a.jpg', size: 1, rel: 'r' }]);
        const response = await GET({ params: VALID } as unknown as Context);
        expect(await response.json()).toEqual([{ name: 'a.jpg', size: 1, rel: 'r' }]);
        expect(files.listImages).toHaveBeenCalledWith('2025', 'troms');
    });

    it('renvoie 400 pour des paramètres invalides et 404 hors dev', async () => {
        expect((await GET({ params: { year: '2025', slug: 'A' } } as unknown as Context)).status).toBe(400);
        vi.stubEnv('DEV', false);
        expect((await GET({ params: VALID } as unknown as Context)).status).toBe(404);
        expect((await upload(new FormData())).status).toBe(404);
    });
});

describe('POST /api/admin/voyages-images/[year]/[slug]', () => {
    it('compresse et enregistre l’image sans miniature', async () => {
        const form = new FormData();
        form.append('files', image('Fjord.PNG', 'image/png'));

        const response = await upload(form);

        expect(await response.json()).toEqual({
            ok: true,
            saved: [
                {
                    name: 'fjord.jpg',
                    rel: '../../../assets/voyages/2025/troms/fjord.jpg',
                    originalBytes: 3,
                    compressedBytes: 1,
                },
            ],
        });
        expect(files.saveImage).toHaveBeenCalledWith('2025', 'troms', 'fjord.jpg', Buffer.from('c'), true);
    });

    it('refuse un type non image (415) et un fichier trop lourd (413)', async () => {
        const textForm = new FormData();
        textForm.append('files', image('notes.txt', 'text/plain'));
        const text = await upload(textForm);
        expect(text.status).toBe(415);
        expect(await text.json()).toEqual({ error: 'notes.txt: unsupported type text/plain' });

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
        expect((await upload(new FormData(), { year: '1', slug: 'troms' })).status).toBe(400);
    });
});
