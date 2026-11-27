// @vitest-environment node
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getR2Target } from './r2-sync';
import {
    buildAstroAssetIndex,
    listDiskAstroKeys,
    listR2AstroKeys,
    loadAstroAssetIndex,
    readDiskHead,
    readR2Head,
} from './astro-asset-index';

vi.mock('./r2-sync', () => ({ getR2Target: vi.fn() }));

afterEach(() => vi.clearAllMocks());

describe('buildAstroAssetIndex', () => {
    const index = buildAstroAssetIndex(
        [
            'astrophotographies/mini/2024/123_raw.jpg',
            'astrophotographies/2024/orion/123_raw.jpg',
            'astrophotographies/annotations/2024/123_annotation.svg',
            'astrophotographies/skyplots/2023/456_raw.jpg',
        ],
        'r2',
    );

    it('trouve le raw où qu’il soit rangé, mais jamais dans les dérivés', () => {
        expect(index.findRaw('123')).toBe('astrophotographies/2024/orion/123_raw.jpg');
        expect(index.findRaw('456')).toBeNull();
    });

    it('répond sur la présence d’une clé et la décrit selon la source', () => {
        expect(index.has('astrophotographies/annotations/2024/123_annotation.svg')).toBe(true);
        expect(index.has('astrophotographies/mini/2023/456_raw.jpg')).toBe(false);
        expect(index.describe('astrophotographies/2024/a.jpg')).toBe('R2 : astrophotographies/2024/a.jpg');
        expect(buildAstroAssetIndex([], 'disk').describe('astrophotographies/a.jpg')).toBe(
            path.join('src/assets', 'astrophotographies/a.jpg'),
        );
    });
});

describe('listDiskAstroKeys', () => {
    it('liste les fichiers en clés relatives à src/assets, sans les fichiers cachés', async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mp-astro-index-'));
        try {
            const write = async (relative: string) => {
                await fs.mkdir(path.dirname(path.join(root, relative)), { recursive: true });
                await fs.writeFile(path.join(root, relative), '');
            };
            await write('src/assets/astrophotographies/2024/123_raw.jpg');
            await write('src/assets/astrophotographies/mini/2024/123_raw.jpg');
            await write('src/assets/astrophotographies/.DS_Store');
            expect((await listDiskAstroKeys(root)).sort()).toEqual([
                'astrophotographies/2024/123_raw.jpg',
                'astrophotographies/mini/2024/123_raw.jpg',
            ]);
            expect(await listDiskAstroKeys(path.join(root, 'absent'))).toEqual([]);
        } finally {
            await fs.rm(root, { recursive: true, force: true });
        }
    });
});

describe('listR2AstroKeys', () => {
    it('renvoie null sans R2', async () => {
        vi.mocked(getR2Target).mockReturnValue(null);
        expect(await listR2AstroKeys()).toBeNull();
        expect((await loadAstroAssetIndex(true)).findRaw('1')).toBeNull();
    });

    it('parcourt toutes les pages du préfixe', async () => {
        const send = vi
            .fn()
            .mockResolvedValueOnce({
                Contents: [{ Key: 'astrophotographies/2024/1_raw.jpg' }, {}],
                IsTruncated: true,
                NextContinuationToken: 'suite',
            })
            .mockResolvedValueOnce({ Contents: [{ Key: 'astrophotographies/mini/2024/1_raw.jpg' }] });
        vi.mocked(getR2Target).mockReturnValue({ client: { send }, bucket: 'b' } as never);

        expect(await listR2AstroKeys()).toEqual([
            'astrophotographies/2024/1_raw.jpg',
            'astrophotographies/mini/2024/1_raw.jpg',
        ]);
        expect(send).toHaveBeenCalledTimes(2);
        expect(send.mock.calls[1][0].input).toMatchObject({
            Prefix: 'astrophotographies/',
            ContinuationToken: 'suite',
        });
    });
});

describe('dates et lecture du début des fichiers', () => {
    it('reprend les dates de la liste R2 et ne lit que les clés connues', async () => {
        const send = vi
            .fn()
            .mockResolvedValueOnce({
                Contents: [
                    {
                        Key: 'astrophotographies/annotations/2024/1_annotation.svg',
                        LastModified: new Date('2026-11-26T16:10:00Z'),
                    },
                ],
            })
            .mockResolvedValueOnce({
                Body: { transformToString: async () => '<svg data-generator="annotate_astro">' },
                LastModified: new Date('2026-11-26T16:10:00Z'),
            });
        vi.mocked(getR2Target).mockReturnValue({ client: { send }, bucket: 'b' } as never);

        const index = await loadAstroAssetIndex(true);
        const key = 'astrophotographies/annotations/2024/1_annotation.svg';
        expect(index.modifiedAt(key)).toBe('2026-11-26T16:10:00.000Z');
        expect(index.modifiedAt('astrophotographies/absent.svg')).toBeNull();
        expect(await index.readHead('astrophotographies/absent.svg', 10)).toBeNull();
        expect(await index.readHead(key, 2048)).toEqual({
            text: '<svg data-generator="annotate_astro">',
            modifiedAt: '2026-11-26T16:10:00.000Z',
        });
        expect(send.mock.calls[1][0].input).toMatchObject({ Bucket: 'b', Key: key, Range: 'bytes=0-2047' });
    });

    it('renvoie null quand R2 manque ou refuse la lecture', async () => {
        vi.mocked(getR2Target).mockReturnValue(null);
        expect(await readR2Head('astrophotographies/a.svg', 10)).toBeNull();
        vi.mocked(getR2Target).mockReturnValue({
            client: { send: vi.fn().mockRejectedValue(new Error('403')) },
            bucket: 'b',
        } as never);
        expect(await readR2Head('astrophotographies/a.svg', 10)).toBeNull();
    });

    it('lit le début d’un fichier du disque, ou null s’il manque', async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mp-astro-head-'));
        try {
            const file = path.join(root, 'src/assets/astrophotographies/annotations/2024/1_annotation.svg');
            await fs.mkdir(path.dirname(file), { recursive: true });
            await fs.writeFile(file, '<svg><title>PixInsight SVG Document</title></svg>');
            const head = await readDiskHead('astrophotographies/annotations/2024/1_annotation.svg', 12, root);
            expect(head?.text).toBe('<svg><title>');
            expect(head?.modifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
            expect(await readDiskHead('astrophotographies/absent.svg', 12, root)).toBeNull();
            expect(await buildAstroAssetIndex([], 'disk').readHead('astrophotographies/absent.svg', 4)).toBeNull();
        } finally {
            await fs.rm(root, { recursive: true, force: true });
        }
    });
});
