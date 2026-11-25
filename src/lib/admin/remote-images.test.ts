// @vitest-environment node
/**
 * Tests de remote-images.ts sur un faux bucket R2 en mémoire ; sharp traite de vraies images générées.
 */
import {
    DeleteObjectsCommand,
    GetObjectCommand,
    HeadObjectCommand,
    ListObjectsV2Command,
    PutObjectCommand,
} from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContentReader } from './stores/content-reader';

interface StoredObject {
    body: Buffer;
    metadata?: Record<string, string>;
    lastModified: Date;
}

const bucket = vi.hoisted(() => ({
    objects: new Map<string, StoredObject>(),
    configured: true,
    pageSize: 1000,
    failList: false,
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
    getSignedUrl: vi.fn(
        async (_client: unknown, command: { input: { Key: string } }) => `https://r2.test/${command.input.Key}?sig=1`,
    ),
}));

const purge = vi.hoisted(() => ({
    purgeReplacedImages: vi.fn(async (keys: string[]) => ({ keys, failedCount: 0 })),
}));
vi.mock('./image-cache-purge', () => purge);

vi.mock('./r2-sync', () => ({
    getR2Target: () => {
        if (!bucket.configured) return null;
        const send = async (command: unknown) => {
            if (command instanceof ListObjectsV2Command) {
                if (bucket.failList) throw Object.assign(new Error('Access Denied secret'), { name: 'AccessDenied' });
                const keys = [...bucket.objects.keys()]
                    .filter((key) => key.startsWith(command.input.Prefix ?? ''))
                    .sort();
                const start = command.input.ContinuationToken ? Number(command.input.ContinuationToken) : 0;
                const page = keys.slice(start, start + bucket.pageSize);
                const next = start + bucket.pageSize;
                return {
                    Contents: page.map((Key) => ({
                        Key,
                        Size: bucket.objects.get(Key)?.body.length,
                        LastModified: bucket.objects.get(Key)?.lastModified,
                    })),
                    IsTruncated: next < keys.length,
                    NextContinuationToken: String(next),
                };
            }
            if (command instanceof PutObjectCommand) {
                bucket.objects.set(command.input.Key as string, {
                    body: Buffer.from(command.input.Body as Buffer),
                    metadata: command.input.Metadata,
                    lastModified: new Date(),
                });
                return {};
            }
            if (command instanceof GetObjectCommand) {
                const object = bucket.objects.get(command.input.Key as string);
                if (!object) throw new Error('NoSuchKey');
                return { Body: { transformToByteArray: async () => new Uint8Array(object.body) } };
            }
            if (command instanceof HeadObjectCommand) {
                const object = bucket.objects.get(command.input.Key as string);
                // POURQUOI : comme R2, un HEAD sur une clé absente échoue (NotFound).
                if (!object) throw Object.assign(new Error('NotFound'), { name: 'NotFound' });
                return { Metadata: object.metadata };
            }
            if (command instanceof DeleteObjectsCommand) {
                for (const { Key } of command.input.Delete?.Objects ?? []) bucket.objects.delete(Key as string);
                return {};
            }
            throw new Error('commande inattendue');
        };
        return { client: { send }, bucket: 'test-bucket' };
    },
}));

import {
    diagnoseR2Access,
    InvalidImageRequestError,
    R2NotConfiguredError,
    computeImageManifestChanges,
    createImageUpload,
    deleteRemoteImage,
    entryPrefix,
    finalizeImageUpload,
    imageManifestChangesForSave,
    listRemoteImages,
    parseImageSection,
    setRemoteCover,
    toImageErrorResponse,
} from './remote-images';

async function makeJpeg(width: number, height: number): Promise<Buffer> {
    return sharp({ create: { width, height, channels: 3, background: '#335577' } })
        .jpeg()
        .toBuffer();
}

function put(key: string, body: Buffer | string, metadata?: Record<string, string>, lastModified = new Date()) {
    bucket.objects.set(key, { body: Buffer.from(body), metadata, lastModified });
}

function reader(files: Record<string, string>): ContentReader {
    return { readText: async (relativePath) => files[relativePath] ?? null, listDir: async () => null };
}

beforeEach(() => {
    bucket.objects.clear();
    bucket.configured = true;
    bucket.pageSize = 1000;
    bucket.failList = false;
});

describe('entryPrefix et parseImageSection', () => {
    it('construit le préfixe et refuse une entrée invalide', () => {
        expect(entryPrefix('blog', '2026', 'aurores')).toBe('blog/2026/aurores/');
        expect(() => entryPrefix('blog', '26', 'aurores')).toThrow(InvalidImageRequestError);
        expect(() => entryPrefix('voyages', '2026', '../x')).toThrow(InvalidImageRequestError);
        expect(parseImageSection('voyages')).toBe('voyages');
        expect(parseImageSection('astro')).toBeNull();
    });
});

describe('listRemoteImages', () => {
    it('liste les images triées, sans miniatures, sous-dossiers ni fichiers cachés, sur plusieurs pages', async () => {
        bucket.pageSize = 2;
        put('blog/2026/aurores/b-360.jpg', 'x', undefined, new Date('2026-02-01T10:30:00Z'));
        put('blog/2026/aurores/a.jpg', 'xx', undefined, new Date('2026-01-01T08:15:00Z'));
        put('blog/2026/aurores/a-thumb.jpg', 'x');
        put('blog/2026/aurores/.360-manifest.json', 'x');
        put('blog/2026/aurores/sous/c.jpg', 'x');
        put('blog/2026/autre/d.jpg', 'x');

        expect(await listRemoteImages('blog', '2026', 'aurores')).toEqual([
            {
                name: 'a.jpg',
                size: 2,
                mtimeMs: Date.parse('2026-01-01T08:15:00Z'),
                capturedAt: '2026-01-01T08:15:00.000Z',
                dayKey: '2026-01-01',
                timeStr: '08:15',
                is360: false,
            },
            expect.objectContaining({ name: 'b-360.jpg', is360: true }),
        ]);
    });

    it('signale un R2 non configuré', async () => {
        bucket.configured = false;
        await expect(listRemoteImages('blog', '2026', 'aurores')).rejects.toBeInstanceOf(R2NotConfiguredError);
    });
});

describe('createImageUpload', () => {
    it('signe un envoi sous incoming/ avec une clé aléatoire', async () => {
        const { uploadUrl, uploadKey } = await createImageUpload('voyages', '2025', 'troms', {
            filename: 'Photo Été.JPG',
            contentType: 'image/jpeg',
            size: 1234,
        });
        expect(uploadKey).toMatch(/^incoming\/voyages\/2025\/troms\/[0-9a-f-]{36}\.jpg$/);
        expect(uploadUrl).toBe(`https://r2.test/${uploadKey}?sig=1`);
    });

    it.each([
        [{ filename: 'a.pdf', contentType: 'application/pdf', size: 10 }, 'Type non pris en charge'],
        [{ filename: 'logo.svg', contentType: 'image/svg+xml', size: 10 }, 'Type non pris en charge'],
        // POURQUOI : le type est déclaré par le navigateur ; l'extension est vérifiée à part.
        [{ filename: 'logo.svg', contentType: 'image/png', size: 10 }, 'Type non pris en charge'],
        [{ filename: 'a.jpg', contentType: 'image/jpeg', size: 0 }, 'Taille'],
        [{ filename: 'a.jpg', contentType: 'image/jpeg', size: 151 * 1024 * 1024 }, 'Taille'],
    ])('refuse %o', async (file, message) => {
        await expect(createImageUpload('blog', '2026', 'a', file)).rejects.toThrow(message);
    });
});

describe('finalizeImageUpload', () => {
    it('purge le cache du worker seulement quand l’image en remplace une du même nom', async () => {
        put('incoming/blog/2026/aurores/a.jpg', await makeJpeg(800, 600));
        const first = await finalizeImageUpload('blog', '2026', 'aurores', {
            uploadKey: 'incoming/blog/2026/aurores/a.jpg',
            filename: 'ciel.jpg',
        });
        expect(first.replaced).toBe(false);
        expect(purge.purgeReplacedImages).not.toHaveBeenCalled();

        put('incoming/blog/2026/aurores/b.jpg', await makeJpeg(900, 600));
        const second = await finalizeImageUpload('blog', '2026', 'aurores', {
            uploadKey: 'incoming/blog/2026/aurores/b.jpg',
            filename: 'ciel.jpg',
        });
        expect(second).toMatchObject({ replaced: true, cachePurge: { failedCount: 0 } });
        expect(purge.purgeReplacedImages).toHaveBeenCalledWith([`blog/2026/aurores/${second.name}`]);
        purge.purgeReplacedImages.mockClear();
    });

    it('compresse, écrit l’image avec ses dimensions et ses versions web, puis supprime l’original', async () => {
        put('incoming/blog/2026/aurores/tmp.jpg', await makeJpeg(3000, 2000));
        const image = await finalizeImageUpload('blog', '2026', 'aurores', {
            uploadKey: 'incoming/blog/2026/aurores/tmp.jpg',
            filename: 'Nuit polaire.jpg',
        });

        expect(image).toMatchObject({ width: 2400, height: 1600, is360: false });
        const finalKey = `blog/2026/aurores/${image.name}`;
        expect(bucket.objects.get(finalKey)?.metadata).toEqual({ width: '2400', height: '1600' });
        const base = finalKey.replace(/\.jpg$/, '');
        for (const width of [400, 800, 1200]) expect(bucket.objects.has(`web/${base}-w${width}.jpg`)).toBe(true);
        expect(bucket.objects.has('incoming/blog/2026/aurores/tmp.jpg')).toBe(false);
    });

    it('garde une photo 360° en haute définition et la marque par son nom', async () => {
        put('incoming/blog/2026/aurores/tmp.jpg', await makeJpeg(5000, 2500));
        const image = await finalizeImageUpload('blog', '2026', 'aurores', {
            uploadKey: 'incoming/blog/2026/aurores/tmp.jpg',
            filename: 'sphere-lac.jpg',
            is360: true,
        });
        expect(image).toMatchObject({ name: 'sphere-lac.jpg', width: 5000, is360: true });

        put('incoming/blog/2026/aurores/tmp2.jpg', await makeJpeg(4000, 2000));
        const renamed = await finalizeImageUpload('blog', '2026', 'aurores', {
            uploadKey: 'incoming/blog/2026/aurores/tmp2.jpg',
            filename: 'panorama.jpg',
            is360: true,
        });
        expect(renamed.name).toBe('panorama-360.jpg');
    });

    it('refuse un SVG, même déposé sous un nom d’image, sans l’écrire', async () => {
        put('incoming/blog/2026/aurores/tmp.jpg', '<svg xmlns="http://www.w3.org/2000/svg"/>');
        await expect(
            finalizeImageUpload('blog', '2026', 'aurores', {
                uploadKey: 'incoming/blog/2026/aurores/tmp.jpg',
                filename: 'logo.svg',
            }),
        ).rejects.toThrow('Type non pris en charge');
        put('incoming/blog/2026/aurores/tmp.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>');
        await expect(
            finalizeImageUpload('blog', '2026', 'aurores', {
                uploadKey: 'incoming/blog/2026/aurores/tmp.svg',
                filename: 'logo.jpg',
            }),
        ).rejects.toThrow('Type non pris en charge');
        expect([...bucket.objects.keys()].filter((key) => key.startsWith('blog/'))).toEqual([]);
    });

    it.each(['incoming/blog/2026/autre/tmp.jpg', 'blog/2026/aurores/a.jpg', 'incoming/blog/2026/aurores/../x.jpg'])(
        'refuse la clé %s',
        async (uploadKey) => {
            await expect(
                finalizeImageUpload('blog', '2026', 'aurores', { uploadKey, filename: 'a.jpg' }),
            ).rejects.toThrow('Clé d’envoi invalide');
        },
    );
});

describe('setRemoteCover', () => {
    it('blog : crée la miniature de l’image et supprime les autres', async () => {
        put('blog/2026/aurores/a.jpg', await makeJpeg(1600, 1000));
        put('blog/2026/aurores/ancienne-thumb.jpg', 'x');
        expect(await setRemoteCover('blog', '2026', 'aurores', 'a.jpg')).toEqual({
            cover: 'a.jpg',
            thumb: 'a-thumb.jpg',
        });
        expect(bucket.objects.has('blog/2026/aurores/a-thumb.jpg')).toBe(true);
        expect(bucket.objects.has('blog/2026/aurores/ancienne-thumb.jpg')).toBe(false);
    });

    it('voyages : copie en cover.jpg avec dimensions, versions web et miniature', async () => {
        put('voyages/2025/troms/a.jpg', await makeJpeg(1600, 1000));
        expect(await setRemoteCover('voyages', '2025', 'troms', 'a.jpg')).toEqual({
            cover: 'cover.jpg',
            thumb: 'cover-thumb.jpg',
        });
        expect(bucket.objects.get('voyages/2025/troms/cover.jpg')?.metadata).toEqual({ width: '1600', height: '1000' });
        expect(bucket.objects.has('web/voyages/2025/troms/cover-w1200.jpg')).toBe(true);
        expect(bucket.objects.has('voyages/2025/troms/cover-thumb.jpg')).toBe(true);
    });

    it('refuse une miniature pour un SVG', async () => {
        put('blog/2026/aurores/logo.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>');
        await expect(setRemoteCover('blog', '2026', 'aurores', 'logo.svg')).rejects.toThrow('Miniature impossible');
    });
});

describe('deleteRemoteImage', () => {
    it('supprime l’image, sa miniature et ses versions web, rien d’autre', async () => {
        for (const key of [
            'blog/2026/aurores/a.jpg',
            'blog/2026/aurores/a-thumb.jpg',
            'blog/2026/aurores/ab.jpg',
            'web/blog/2026/aurores/a-w400.jpg',
            'web/blog/2026/aurores/a-w800.jpg',
            'web/blog/2026/aurores/ab-w400.jpg',
        ]) {
            put(key, 'x');
        }
        await deleteRemoteImage('blog', '2026', 'aurores', 'a.jpg');
        expect([...bucket.objects.keys()].sort()).toEqual([
            'blog/2026/aurores/ab.jpg',
            'web/blog/2026/aurores/ab-w400.jpg',
        ]);
    });

    it('refuse un nom de fichier invalide', async () => {
        await expect(deleteRemoteImage('blog', '2026', 'aurores', '../a.jpg')).rejects.toThrow(
            'Nom de fichier invalide',
        );
    });
});

describe('computeImageManifestChanges', () => {
    const dimensionsBefore = `${JSON.stringify(
        {
            'blog/2026/aurores/supprimee.jpg': { width: 1, height: 1 },
            'blog/2026/aurores/b.jpg': { width: 10, height: 20 },
            'voyages/2025/troms/x.jpg': { width: 3, height: 3 },
        },
        null,
        2,
    )}\n`;
    const webBefore = `${JSON.stringify({ 'blog/2026/aurores/supprimee.jpg': [400] }, null, 2)}\n`;

    it('ajoute les nouvelles images, garde les connues, retire les absentes', async () => {
        put('blog/2026/aurores/a.jpg', 'x', { width: '2400', height: '1600' });
        put('blog/2026/aurores/b.jpg', 'x');
        put('blog/2026/aurores/sans-meta.png', 'x');
        put('blog/2026/aurores/a-thumb.jpg', 'x');
        put('blog/2026/aurores/notes.txt', 'x');
        put('web/blog/2026/aurores/a-w800.jpg', 'x');
        put('web/blog/2026/aurores/a-w400.jpg', 'x');
        put('web/blog/2026/aurores/a-w1200.jpg', 'x');
        put('web/blog/2026/aurores/bizarre.txt', 'x');

        const changes = await computeImageManifestChanges(
            'blog',
            '2026',
            'aurores',
            reader({ 'src/data/image-dimensions.json': dimensionsBefore, 'src/data/web-images.json': webBefore }),
        );

        const dimensions = JSON.parse(changes.find((c) => c.path === 'src/data/image-dimensions.json')?.content ?? '');
        expect(dimensions).toEqual({
            'blog/2026/aurores/a.jpg': { width: 2400, height: 1600 },
            'blog/2026/aurores/b.jpg': { width: 10, height: 20 },
            'voyages/2025/troms/x.jpg': { width: 3, height: 3 },
        });
        const web = JSON.parse(changes.find((c) => c.path === 'src/data/web-images.json')?.content ?? '');
        expect(web).toEqual({ 'blog/2026/aurores/a.jpg': [400, 800, 1200] });
    });

    it('ne renvoie rien quand les manifestes sont à jour', async () => {
        put('blog/2026/aurores/b.jpg', 'x');
        const current = `${JSON.stringify({ 'blog/2026/aurores/b.jpg': { width: 10, height: 20 } }, null, 2)}\n`;
        expect(
            await computeImageManifestChanges(
                'blog',
                '2026',
                'aurores',
                reader({ 'src/data/image-dimensions.json': current, 'src/data/web-images.json': '{}\n' }),
            ),
        ).toEqual([]);
    });

    it('repart de manifestes vides ou illisibles', async () => {
        put('blog/2026/aurores/a.jpg', 'x', { width: '5', height: '6' });
        const changes = await computeImageManifestChanges(
            'blog',
            '2026',
            'aurores',
            reader({ 'src/data/image-dimensions.json': 'pas du json', 'src/data/web-images.json': '[]' }),
        );
        expect(changes.map((change) => change.path)).toEqual([
            'src/data/image-dimensions.json',
            'src/data/web-images.json',
        ]);
    });

    it('imageManifestChangesForSave ignore un R2 non configuré, relance le reste', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        bucket.configured = false;
        expect(await imageManifestChangesForSave('blog', '2026', 'aurores', reader({}))).toEqual([]);
        bucket.configured = true;
        await expect(imageManifestChangesForSave('blog', '26', 'aurores', reader({}))).rejects.toThrow(
            InvalidImageRequestError,
        );
        vi.restoreAllMocks();
    });
});

describe('toImageErrorResponse', () => {
    it('traduit les erreurs connues et relance les autres', () => {
        expect(toImageErrorResponse(new InvalidImageRequestError('x')).status).toBe(400);
        expect(toImageErrorResponse(new R2NotConfiguredError()).status).toBe(503);
        expect(() => toImageErrorResponse(new Error('autre'))).toThrow('autre');
    });
});

describe('diagnoseR2Access', () => {
    it('signale des variables absentes', async () => {
        bucket.configured = false;
        vi.stubEnv('R2_ACCOUNT_ID', 'compte');
        vi.stubEnv('R2_ACCESS_KEY_ID', '');
        vi.stubEnv('R2_SECRET_ACCESS_KEY', '');
        vi.stubEnv('R2_BUCKET_NAME', 'bucket');
        const result = await diagnoseR2Access();
        expect(result).toMatchObject({ configured: false, ok: false });
        expect(result.hint).toContain('R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.');
        expect(result.hint).not.toContain('compte');
        vi.stubEnv('R2_ACCESS_KEY_ID', 'a');
        vi.stubEnv('R2_SECRET_ACCESS_KEY', 'b');
        expect((await diagnoseR2Access()).hint).toContain('aucune (redéployer)');
        vi.unstubAllEnvs();
    });

    it('valide un bucket qui contient des images d’articles, signale un bucket vide', async () => {
        expect(await diagnoseR2Access()).toMatchObject({ configured: true, ok: false, bucket: 'test-bucket' });
        put('blog/2026/a/a.jpg', 'x');
        expect(await diagnoseR2Access()).toEqual(expect.objectContaining({ ok: true, bucket: 'test-bucket' }));
    });

    it('signale un accès refusé sans détail secret', async () => {
        bucket.failList = true;
        const result = await diagnoseR2Access();
        expect(result).toMatchObject({ configured: true, ok: false });
        expect(result.hint).toContain('AccessDenied');
        expect(result.hint).not.toContain('secret');
    });
});
