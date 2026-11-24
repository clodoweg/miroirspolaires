// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    astroStagingPrefix,
    deleteStagedFiles,
    getContentType,
    listFilesWithKeys,
    promoteStagedFiles,
    stageFiles,
} from './r2-staging.mjs';

let root;

function write(relativePath, content) {
    const filePath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
    return filePath;
}

/** Faux client S3 : un bucket en mémoire, qui reconnaît les commandes par leur nom. */
function createFakeS3(initialObjects = {}, { failPutFor = [], failCopyFor = [] } = {}) {
    const objects = new Map(Object.entries(initialObjects).map(([key, body]) => [key, Buffer.from(body)]));
    const calls = [];
    const notFound = () =>
        Object.assign(new Error('NotFound'), { name: 'NotFound', $metadata: { httpStatusCode: 404 } });
    return {
        objects,
        calls,
        async send(command) {
            const { input } = command;
            const name = command.constructor.name;
            calls.push({ name, input });
            if (name === 'HeadObjectCommand') {
                const body = objects.get(input.Key);
                if (!body) throw notFound();
                return { ContentLength: body.length, ETag: `"${createHash('md5').update(body).digest('hex')}"` };
            }
            if (name === 'PutObjectCommand') {
                if (failPutFor.includes(input.Key)) throw new Error('put refusé');
                objects.set(input.Key, Buffer.from(input.Body));
                return {};
            }
            if (name === 'CopyObjectCommand') {
                if (failCopyFor.includes(input.Key)) throw new Error('copie refusée');
                const sourceKey = decodeURIComponent(input.CopySource.slice(input.Bucket.length + 1));
                if (!objects.has(sourceKey)) throw notFound();
                objects.set(input.Key, objects.get(sourceKey));
                return {};
            }
            if (name === 'DeleteObjectsCommand') {
                input.Delete.Objects.forEach(({ Key }) => objects.delete(Key));
                return {};
            }
            throw new Error(`Commande inattendue : ${name}`);
        },
    };
}

beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'r2-staging-'));
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('astroStagingPrefix', () => {
    it('construit le préfixe et refuse un identifiant qui sortirait du préfixe', () => {
        expect(astroStagingPrefix('123-1')).toBe('incoming/astro/123-1/');
        expect(() => astroStagingPrefix('../prod')).toThrow();
        expect(() => astroStagingPrefix('a/b')).toThrow();
        expect(() => astroStagingPrefix('..')).toThrow();
        expect(() => astroStagingPrefix('')).toThrow();
    });
});

describe('listFilesWithKeys', () => {
    it('donne les clés relatives à la racine, sans fichiers cachés, triées', () => {
        write('astrophotographies/2026/2_raw.jpg', 'b');
        write('astrophotographies/2026/1_raw.jpg', 'a');
        write('astrophotographies/.DS_Store', 'x');
        write('autre/ignore.jpg', 'x');
        expect(listFilesWithKeys(root, 'astrophotographies').map(({ key }) => key)).toEqual([
            'astrophotographies/2026/1_raw.jpg',
            'astrophotographies/2026/2_raw.jpg',
        ]);
        expect(listFilesWithKeys(root, 'absent')).toEqual([]);
    });
});

describe('getContentType', () => {
    it('reconnaît les images et le SVG', () => {
        expect(getContentType('a/b.JPG')).toBe('image/jpeg');
        expect(getContentType('a/b.svg')).toBe('image/svg+xml');
        expect(getContentType('a/b.bin')).toBe('application/octet-stream');
    });
});

describe('stageFiles, promoteStagedFiles et deleteStagedFiles', () => {
    it("n'écrit les clés définitives qu'à la copie, saute les fichiers identiques et signale les remplacements", async () => {
        const s3 = createFakeS3({
            'astrophotographies/2026/same.jpg': 'same',
            'astrophotographies/2026/old.jpg': 'v1',
        });
        const files = [
            { key: 'astrophotographies/2026/same.jpg', path: write('same.jpg', 'same') },
            { key: 'astrophotographies/2026/old.jpg', path: write('old.jpg', 'v2') },
            { key: 'astrophotographies/2026/new.jpg', path: write('new.jpg', 'new') },
        ];
        const prefix = astroStagingPrefix('run');

        const staging = await stageFiles({ s3, bucket: 'b', files, prefix, log: () => {} });
        expect(staging.errors).toEqual([]);
        expect(staging.unchanged).toEqual(['astrophotographies/2026/same.jpg']);
        expect(staging.staged).toEqual([
            {
                key: 'astrophotographies/2026/old.jpg',
                stagingKey: `${prefix}astrophotographies/2026/old.jpg`,
                isReplacement: true,
            },
            {
                key: 'astrophotographies/2026/new.jpg',
                stagingKey: `${prefix}astrophotographies/2026/new.jpg`,
                isReplacement: false,
            },
        ]);
        // Rien n'a encore touché les clés définitives.
        expect(s3.objects.get('astrophotographies/2026/old.jpg').toString()).toBe('v1');
        expect(s3.objects.has('astrophotographies/2026/new.jpg')).toBe(false);
        expect(s3.calls.find(({ name }) => name === 'PutObjectCommand').input.ContentType).toBe('image/jpeg');

        const promotion = await promoteStagedFiles({ s3, bucket: 'b', staged: staging.staged });
        expect(promotion).toEqual({
            promoted: ['astrophotographies/2026/old.jpg', 'astrophotographies/2026/new.jpg'],
            errors: [],
        });
        expect(s3.objects.get('astrophotographies/2026/old.jpg').toString()).toBe('v2');
        expect(s3.objects.get('astrophotographies/2026/new.jpg').toString()).toBe('new');

        expect(await deleteStagedFiles({ s3, bucket: 'b', staged: staging.staged })).toEqual([]);
        expect([...s3.objects.keys()].some((key) => key.startsWith('incoming/'))).toBe(false);
    });

    it('relève les envois et les copies en échec', async () => {
        const prefix = astroStagingPrefix('run');
        const s3 = createFakeS3({}, { failPutFor: [`${prefix}a.jpg`], failCopyFor: ['b.jpg'] });
        const files = [
            { key: 'a.jpg', path: write('a.jpg', 'a') },
            { key: 'b.jpg', path: write('b.jpg', 'b') },
        ];
        const staging = await stageFiles({ s3, bucket: 'b', files, prefix, log: () => {} });
        expect(staging.errors).toEqual(['a.jpg : put refusé']);
        expect(staging.staged.map(({ key }) => key)).toEqual(['b.jpg']);

        const promotion = await promoteStagedFiles({ s3, bucket: 'b', staged: staging.staged });
        expect(promotion).toEqual({ promoted: [], errors: ['b.jpg : copie refusée'] });
    });

    it('encode la source de la copie, clé accentuée comprise', async () => {
        const s3 = createFakeS3();
        const files = [{ key: 'web/astrophotographies/mini/2026/nébuleuse-w400.jpg', path: write('n.jpg', 'n') }];
        const staging = await stageFiles({ s3, bucket: 'b', files, prefix: astroStagingPrefix('r'), log: () => {} });
        await promoteStagedFiles({ s3, bucket: 'b', staged: staging.staged });
        const copy = s3.calls.find(({ name }) => name === 'CopyObjectCommand').input;
        expect(copy.CopySource).toBe('b/incoming/astro/r/web/astrophotographies/mini/2026/n%C3%A9buleuse-w400.jpg');
        expect(copy.MetadataDirective).toBe('COPY');
        expect(s3.objects.get('web/astrophotographies/mini/2026/nébuleuse-w400.jpg').toString()).toBe('n');
    });
});
