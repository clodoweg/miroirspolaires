// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getR2Target } from './r2-sync';
import {
    analyzeR2Inventory,
    deleteR2Orphans,
    loadR2Inventory,
    loadR2References,
    R2OrphanRequestError,
    type R2References,
} from './r2-inventory';
import type { ContentReader } from './stores/content-reader';

vi.mock('./r2-sync', () => ({ getR2Target: vi.fn() }));

const NOW = new Date('2026-11-25T12:00:00Z');
const object = (key: string, size = 10, lastModified = NOW) => ({ key, size, lastModified });

const REFERENCES: R2References = {
    photoYears: new Map([
        ['123', '2024'],
        ['456', '2025'],
    ]),
    blogEntries: new Set(['2026/article']),
    voyageEntries: new Set(['2025/islande']),
};

function memoryReader(files: Record<string, string>): ContentReader {
    return {
        readText: async (relativePath) => files[relativePath] ?? null,
        async listDir(relativePath) {
            const prefix = `${relativePath}/`;
            const entries = new Map<string, 'file' | 'dir'>();
            for (const file of Object.keys(files)) {
                if (!file.startsWith(prefix)) continue;
                const [head, ...rest] = file.slice(prefix.length).split('/');
                entries.set(head, rest.length > 0 ? 'dir' : 'file');
            }
            return entries.size === 0 ? null : [...entries].map(([name, type]) => ({ name, type }));
        },
    };
}

const REPO = memoryReader({
    'data/astrobin_clodoweg_gallery_python.csv': 'ID,Title,Uploaded\n123,Orion,2024-01-05\n456,M31,2025-02-01\n',
    'src/content/blog/2026/article.md': '---\ntitle: A\n---\n',
    'src/content/voyages/2025/islande.md': '---\ntitle: I\n---\n',
});

afterEach(() => vi.clearAllMocks());

describe('analyzeR2Inventory', () => {
    it('repère chaque type d’orphelin, sans toucher aux fichiers référencés', () => {
        const objects = [
            object('astrophotographies/2024/123_raw.jpg', 100),
            object('astrophotographies/mini/2024/123_raw.jpg'),
            object('astrophotographies/2023/123_raw.jpg'),
            object('astrophotographies/annotations/2023/999_annotation.svg'),
            object('astrophotographies/divers/notes.txt'),
            object('blog/2026/article/a.jpg'),
            object('blog/2020/ancien/a.jpg'),
            object('voyages/2025/islande/cover.jpg'),
            object('voyages/2019/supprime/cover.jpg'),
            object('web/blog/2026/article/a-w400.jpg'),
            object('web/blog/2026/disparu/a-w800.jpg'),
            object('incoming/blog/2026/x/tmp.jpg', 5, new Date('2026-11-20T00:00:00Z')),
            object('incoming/blog/2026/x/recent.jpg', 5, NOW),
            object('index/hero.jpg'),
        ];
        const inventory = analyzeR2Inventory(objects, REFERENCES, NOW);
        expect(inventory.orphans).toEqual([
            {
                key: 'astrophotographies/2023/123_raw.jpg',
                size: 10,
                reason: 'Ancienne année : la photo est rangée sous 2024',
            },
            {
                key: 'astrophotographies/annotations/2023/999_annotation.svg',
                size: 10,
                reason: 'Photo absente du CSV AstroBin',
            },
            { key: 'blog/2020/ancien/a.jpg', size: 10, reason: 'Article supprimé' },
            { key: 'incoming/blog/2026/x/tmp.jpg', size: 5, reason: 'Envoi temporaire abandonné (plus d’un jour)' },
            { key: 'voyages/2019/supprime/cover.jpg', size: 10, reason: 'Voyage supprimé' },
            { key: 'web/blog/2026/disparu/a-w800.jpg', size: 10, reason: 'Version web sans image source' },
        ]);
        expect(inventory.totalCount).toBe(objects.length);
        expect(inventory.prefixes[0]).toEqual({ prefix: 'astrophotographies/', count: 5, sizeBytes: 140 });
    });
});

describe('loadR2References et loadR2Inventory', () => {
    it('lit le CSV et les contenus', async () => {
        const references = await loadR2References(REPO);
        expect(references.photoYears.get('456')).toBe('2025');
        expect(references.blogEntries.has('2026/article')).toBe(true);
        expect(references.voyageEntries.has('2025/islande')).toBe(true);
    });

    it('refuse d’analyser sans CSV', async () => {
        await expect(loadR2References(memoryReader({}))).rejects.toThrow('CSV AstroBin introuvable');
    });

    it('signale R2 non configuré', async () => {
        vi.mocked(getR2Target).mockReturnValue(null);
        await expect(loadR2Inventory(REPO)).rejects.toThrow('R2 n’est pas configuré');
    });
});

describe('deleteR2Orphans', () => {
    function mockBucket(keys: string[]) {
        const send = vi.fn(async (command: { constructor: { name: string } }) =>
            command.constructor.name === 'ListObjectsV2Command'
                ? { Contents: keys.map((Key) => ({ Key, Size: 1, LastModified: NOW })) }
                : {},
        );
        vi.mocked(getR2Target).mockReturnValue({ client: { send }, bucket: 'b' } as never);
        return send;
    }

    it('supprime les seuls orphelins demandés', async () => {
        const send = mockBucket(['blog/2020/ancien/a.jpg', 'blog/2026/article/a.jpg']);
        expect(await deleteR2Orphans(['blog/2020/ancien/a.jpg'], REPO)).toEqual(['blog/2020/ancien/a.jpg']);
        const deleteCall = send.mock.calls.find(([command]) => command.constructor.name === 'DeleteObjectsCommand');
        expect(deleteCall?.[0]).toMatchObject({
            input: { Bucket: 'b', Delete: { Objects: [{ Key: 'blog/2020/ancien/a.jpg' }] } },
        });
    });

    it.each([[[]], ['blog/2020/ancien/a.jpg'], [['blog/2026/article/a.jpg']], [[42]]])(
        'refuse la demande %j sans rien supprimer',
        async (keys) => {
            const send = mockBucket(['blog/2020/ancien/a.jpg', 'blog/2026/article/a.jpg']);
            await expect(deleteR2Orphans(keys, REPO)).rejects.toBeInstanceOf(R2OrphanRequestError);
            expect(send.mock.calls.some(([command]) => command.constructor.name === 'DeleteObjectsCommand')).toBe(
                false,
            );
        },
    );
});
