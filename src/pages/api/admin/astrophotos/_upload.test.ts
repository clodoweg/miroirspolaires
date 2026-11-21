// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const astro = vi.hoisted(() => ({ uploadRaw: vi.fn() }));
vi.mock('@/lib/admin/astrophotos', () => astro);

import { POST } from './upload';

type Fields = { id?: string; year?: string; file?: File | string };

function upload(fields: Fields) {
    const form = new FormData();
    if (fields.id !== undefined) form.set('id', fields.id);
    if (fields.year !== undefined) form.set('year', fields.year);
    if (fields.file !== undefined) form.set('file', fields.file);
    const request = new Request('http://localhost/api/admin/astrophotos/upload', { method: 'POST', body: form });
    return POST({ request } as unknown as Parameters<typeof POST>[0]);
}

const IMAGE = new File([new Uint8Array([1, 2, 3])], 'raw.jpg', { type: 'image/jpeg' });

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('DEV', true);
    astro.uploadRaw.mockResolvedValue({ path: 'src/assets/astrophotographies/2024/123_raw.jpg' });
});

afterEach(() => vi.unstubAllEnvs());

describe('POST /api/admin/astrophotos/upload', () => {
    it('enregistre le fichier brut', async () => {
        const response = await upload({ id: ' 123 ', year: '2024', file: IMAGE });
        expect(await response.json()).toEqual({ ok: true, path: 'src/assets/astrophotographies/2024/123_raw.jpg' });
        const [id, year, data] = astro.uploadRaw.mock.calls[0];
        expect([id, year, [...data]]).toEqual(['123', '2024', [1, 2, 3]]);
    });

    it('renvoie 400 sans multipart', async () => {
        const request = new Request('http://localhost/x', { method: 'POST', body: '{}' });
        const response = await POST({ request } as unknown as Parameters<typeof POST>[0]);
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: 'Expected multipart/form-data' });
    });

    it.each([
        ['fichier absent', { id: '1', year: '2024' }, 400, 'Missing file'],
        ['fichier texte', { id: '1', year: '2024', file: 'texte' }, 400, 'Missing file'],
        ['id invalide', { id: 'x', year: '2024', file: IMAGE }, 400, 'Invalid id'],
        ['année invalide', { id: '1', file: IMAGE }, 400, 'Invalid year'],
        [
            'type non image',
            { id: '1', year: '2024', file: new File(['a'], 'a.txt', { type: 'text/plain' }) },
            415,
            'Unsupported type text/plain',
        ],
    ])('refuse : %s', async (_label, fields, status, error) => {
        const response = await upload(fields as Fields);
        expect(response.status).toBe(status);
        expect(await response.json()).toEqual({ error });
        expect(astro.uploadRaw).not.toHaveBeenCalled();
    });

    it('renvoie 413 au-delà de 100 Mo', async () => {
        const big = new File([new Uint8Array(1)], 'big.jpg', { type: 'image/jpeg' });
        Object.defineProperty(big, 'size', { value: 100 * 1024 * 1024 + 1 });
        const form = new FormData();
        form.set('id', '1');
        form.set('year', '2024');
        form.set('file', big);
        const request = { formData: async () => form } as unknown as Request;
        const response = await POST({ request } as unknown as Parameters<typeof POST>[0]);
        expect(response.status).toBe(413);
        expect(astro.uploadRaw).not.toHaveBeenCalled();
    });

    it('renvoie 404 hors dev', async () => {
        vi.stubEnv('DEV', false);
        expect((await upload({ id: '1', year: '2024', file: IMAGE })).status).toBe(404);
    });
});
