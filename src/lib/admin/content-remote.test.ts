// @vitest-environment node
/**
 * blog-files.ts et voyages-files.ts sur l'admin distant : lecture et écriture passent par le
 * ContentReader et le ContentWriter, jamais par le disque.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({
    files: new Map<string, string>(),
    commits: [] as { changes: { path: string; content: string | null }[]; message: string }[],
}));

vi.mock('./auth/config', async (importOriginal) => ({
    ...(await importOriginal<typeof import('./auth/config')>()),
    getAdminAccessMode: () => 'remote',
}));
vi.mock('./stores/content-reader', async (importOriginal) => ({
    ...(await importOriginal<typeof import('./stores/content-reader')>()),
    getContentReader: () => ({
        readText: async (relativePath: string) => store.files.get(relativePath) ?? null,
        listDir: async () => null,
    }),
}));
vi.mock('./stores/content-writer', async (importOriginal) => ({
    ...(await importOriginal<typeof import('./stores/content-writer')>()),
    getContentWriter: () => ({
        commit: async (changes: { path: string; content: string | null }[], message: string) => {
            store.commits.push({ changes, message });
            return { commitSha: 'c1' };
        },
    }),
}));
vi.mock('./remote-images', () => ({
    imageManifestChangesForSave: async (section: string) => [
        { path: 'src/data/image-dimensions.json', content: `{"${section}":true}\n` },
    ],
}));
vi.mock('node:fs', () => ({ promises: {} }));

import { deletePost, writePost } from './blog-files';
import { deleteVoyage, writeVoyage } from './voyages-files';

const FM = { title: 'Aurores', date: '2026-02-01', categories: [], description: 'Nuit', image: '' };

beforeEach(() => {
    store.files.clear();
    store.commits.length = 0;
});

describe('admin distant : articles', () => {
    it('committe le markdown et blog.json ensemble', async () => {
        store.files.set('src/data/blog.json', '{"2025/a":{"id":"2025/a","readingTime":"1 min"}}');
        const result = await writePost('2026', 'aurores', FM, 'Corps', { isNew: true });
        expect(store.commits).toHaveLength(1);
        const [{ changes, message }] = store.commits;
        expect(message).toBe('chore: create blog post 2026/aurores from admin');
        expect(changes.map((change) => change.path)).toEqual([
            'src/content/blog/2026/aurores.md',
            'src/data/blog.json',
            'src/data/image-dimensions.json',
        ]);
        expect(JSON.parse(changes[1].content ?? '')).toHaveProperty('2026/aurores.readingTime');
        expect(JSON.parse(changes[1].content ?? '')).toHaveProperty('2025/a');
        expect(result.revision).toMatch(/^[0-9a-f]{40}$/);
    });

    it('reconstruit un blog.json illisible', async () => {
        store.files.set('src/data/blog.json', 'pas du json');
        await writePost('2026', 'aurores', FM, 'Corps');
        expect(JSON.parse(store.commits[0].changes[1].content ?? '')).toEqual({
            '2026/aurores': { id: '2026/aurores', readingTime: expect.any(String) },
        });
        expect(store.commits[0].message).toBe('chore: update blog post 2026/aurores from admin');
    });

    it('supprime par commit, et ne fait rien si l’article manque', async () => {
        await deletePost('2026', 'absent', true);
        expect(store.commits).toHaveLength(0);
        store.files.set('src/content/blog/2026/aurores.md', 'x');
        await deletePost('2026', 'aurores', true);
        expect(store.commits[0]).toEqual({
            changes: [{ path: 'src/content/blog/2026/aurores.md', content: null }],
            message: 'chore: delete blog post 2026/aurores from admin',
        });
    });
});

describe('admin distant : voyages', () => {
    it('committe le markdown, refuse une révision périmée', async () => {
        await writeVoyage('2025', 'troms', { title: 'Troms', image: '', gallery: [] }, 'Récit', { isNew: true });
        expect(store.commits[0].message).toBe('chore: create travel story 2025/troms from admin');
        expect(store.commits[0].changes.map((change) => change.path)).toEqual([
            'src/content/voyages/2025/troms.md',
            'src/data/image-dimensions.json',
        ]);
        store.files.set('src/content/voyages/2025/troms.md', 'ancien');
        await expect(
            writeVoyage('2025', 'troms', { title: 'Troms', image: '', gallery: [] }, 'x', {
                expectedRevision: 'f'.repeat(40),
            }),
        ).rejects.toThrow('modifié ailleurs');
    });

    it('supprime par commit, et ne fait rien si le voyage manque', async () => {
        await deleteVoyage('2025', 'absent', false);
        expect(store.commits).toHaveLength(0);
        store.files.set('src/content/voyages/2025/troms.md', 'x');
        await deleteVoyage('2025', 'troms', false);
        expect(store.commits[0].message).toBe('chore: delete travel story 2025/troms from admin');
    });
});
