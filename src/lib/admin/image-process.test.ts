// @vitest-environment node
/**
 * Tests de compressImage() avec sharp mocké : on vérifie les options transmises au pipeline
 * (redimensionnement, qualité, métadonnées) et les noms de fichiers produits.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface PipelineCall {
    resize?: Record<string, unknown>;
    jpeg?: Record<string, unknown>;
    withMetadata: boolean;
}

const state = vi.hoisted(() => ({
    meta: { width: 4000, height: 3000 } as { width?: number; height?: number },
    calls: [] as PipelineCall[],
}));

vi.mock('sharp', () => ({
    default: vi.fn(() => {
        const call: PipelineCall = { withMetadata: false };
        state.calls.push(call);
        const pipeline = {
            rotate: () => pipeline,
            metadata: async () => state.meta,
            resize: (options: Record<string, unknown>) => {
                call.resize = options;
                return pipeline;
            },
            withMetadata: () => {
                call.withMetadata = true;
                return pipeline;
            },
            jpeg: (options: Record<string, unknown>) => {
                call.jpeg = options;
                return pipeline;
            },
            toBuffer: async () => ({
                data: Buffer.from(`q${String(call.jpeg?.quality)}`),
                info: { width: 111, height: 222 },
            }),
        };
        return pipeline;
    }),
}));

import sharp from 'sharp';
import { compressImage, THUMB_SUFFIX } from './image-process';

beforeEach(() => {
    state.calls.length = 0;
    state.meta = { width: 4000, height: 3000 };
    vi.mocked(sharp).mockClear();
});

describe('compressImage', () => {
    it('produit un full 2400 px q82 avec EXIF et une miniature 800 px q60 sans EXIF', async () => {
        const input = Buffer.from('source');
        const { full, thumb } = await compressImage(input, 'Photo.png');

        expect(state.calls).toEqual([
            {
                resize: { width: 2400, height: undefined, fit: 'inside', withoutEnlargement: true },
                jpeg: { quality: 82, mozjpeg: true, chromaSubsampling: '4:2:0' },
                withMetadata: true,
            },
            {
                resize: { width: 800, height: undefined, fit: 'inside', withoutEnlargement: true },
                jpeg: { quality: 60, mozjpeg: true, chromaSubsampling: '4:2:0' },
                withMetadata: false,
            },
        ]);
        expect(vi.mocked(sharp).mock.calls[0][1]).toEqual({ failOn: 'truncated', limitInputPixels: false });
        expect(full).toEqual({
            buffer: Buffer.from('q82'),
            filename: 'Photo.jpg',
            width: 111,
            height: 222,
            originalBytes: input.length,
            compressedBytes: 3,
        });
        expect(thumb?.filename).toBe(`Photo${THUMB_SUFFIX}.jpg`);
        expect(thumb?.buffer.toString()).toBe('q60');
    });

    it('redimensionne une image portrait sur la hauteur et respecte les options', async () => {
        state.meta = { width: 3000, height: 7000 };
        await compressImage(new Uint8Array([1, 2]), 'pano.jpg', { maxSize: 6000, quality: 90 });

        expect(state.calls[0].resize).toEqual({
            width: undefined,
            height: 6000,
            fit: 'inside',
            withoutEnlargement: true,
        });
        expect(state.calls[0].jpeg?.quality).toBe(90);
        expect(state.calls[1].resize).toMatchObject({ height: 800 });
    });

    it('ne redimensionne pas le full en mode noResize ni une petite image', async () => {
        await compressImage(Buffer.from('x'), 'sphere.jpg', { noResize: true });
        expect(state.calls[0].resize).toBeUndefined();
        expect(state.calls[1].resize).toMatchObject({ width: 800 });

        state.calls.length = 0;
        state.meta = { width: 600, height: 400 };
        await compressImage(Buffer.from('x'), 'petite.jpg');
        expect(state.calls.map((call) => call.resize)).toEqual([undefined, undefined]);
    });

    it('tolère des métadonnées sans dimensions', async () => {
        state.meta = {};
        const { full } = await compressImage(Buffer.from('x'), 'inconnue.webp');
        expect(state.calls[0].resize).toBeUndefined();
        expect(full.filename).toBe('inconnue.jpg');
    });

    it('ne double pas une extension en majuscules (IMG_1234.JPG)', async () => {
        state.meta = {};
        const { full, thumb } = await compressImage(Buffer.from('x'), 'IMG_1234.JPG');
        expect(full.filename).toBe('IMG_1234.jpg');
        expect(thumb?.filename).toBe(`IMG_1234${THUMB_SUFFIX}.jpg`);
    });

    it.each(['logo.svg', 'anim.GIF'])('laisse %s intact et sans miniature', async (name) => {
        const input = new Uint8Array([4, 5, 6]);
        const { full, thumb } = await compressImage(input, name);

        expect(sharp).not.toHaveBeenCalled();
        expect(thumb).toBeNull();
        expect(full).toEqual({
            buffer: Buffer.from([4, 5, 6]),
            filename: name,
            width: 0,
            height: 0,
            originalBytes: 3,
            compressedBytes: 3,
        });
    });
});
