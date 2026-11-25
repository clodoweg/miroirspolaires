// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { collectAdminTodos } from './admin-todo';
import type { ReleaseStatus } from './github/release';
import type { ContentReader } from './stores/content-reader';

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

const NOW = new Date('2026-11-25T12:00:00Z');

describe('collectAdminTodos', () => {
    it('rassemble les manques de chaque section, dans l’ordre des sections', async () => {
        const reader = memoryReader({
            'data/astrobin_clodoweg_gallery_python.csv': 'ID,Title,Uploaded\n1,Orion,2024-01-05\n2,M31,2024-02-01\n',
            'src/data/wikipedia.json': JSON.stringify({ '1': { description: 'Nébuleuse' } }),
            'src/data/seo.json': JSON.stringify({ 'astrophotographies/orion-1': 'Orion' }),
            'src/content/blog/2026/a.md': '---\ntitle: A\ndate: 2026-01-01\n---\n![](/assets/blog/2026/a/1.jpg)\n',
            'src/content/voyages/2025/islande.md': '---\ntitle: Islande\n---\n',
            'src/data/lighthouse-results.json': JSON.stringify({ timestamp: '2026-09-01T00:00:00Z' }),
        });
        const release = async () => ({ ahead: 3, contentBranch: 'dev', pullRequest: null }) as unknown as ReleaseStatus;
        const { todos, errors } = await collectAdminTodos(reader, { release, now: NOW });
        expect(errors).toEqual([]);
        const titles = todos.map((todo) => `${todo.section} | ${todo.title}`);
        expect(titles).toEqual(
            expect.arrayContaining([
                'Astrophotographies | 1 photo sans description SEO',
                'Astrophotographies | 2 photos sans alt',
                'Astrophotographies | 1 photo sans description Wikipedia',
                'Blog | 1 article sans description',
                'Blog | 1 image sans alt',
                'Voyages | 1 voyage sans description SEO',
                'Pages du site | 8 pages sans description SEO',
                'Qualité | Rapport Lighthouse de plus de 30 jours',
                'Publication | 3 commits sur dev pas encore en production',
            ]),
        );
        expect(titles.some((title) => title.startsWith('Données astronomiques | '))).toBe(true);
        const sections = todos.map((todo) => todo.section);
        expect(sections.indexOf('Publication')).toBe(sections.length - 1);
        expect(sections[0]).toBe('Astrophotographies');
    });

    it('signale une source illisible sans masquer les autres', async () => {
        const reader = memoryReader({
            'src/data/seo.json': '{ illisible',
            'src/data/lighthouse-results.json': JSON.stringify({ timestamp: '2026-11-20T00:00:00Z' }),
        });
        const failingRelease = async () => {
            throw new Error('GitHub injoignable');
        };
        const { todos, errors } = await collectAdminTodos(reader, { release: failingRelease, now: NOW });
        expect(errors).toEqual(
            expect.arrayContaining([expect.stringMatching(/^audit SEO :/), 'mise en production : GitHub injoignable']),
        );
        expect(todos.some((todo) => todo.section === 'Qualité')).toBe(false);
    });

    it('signale l’absence de rapport Lighthouse et ignore la publication en local', async () => {
        const { todos } = await collectAdminTodos(memoryReader({}), { now: NOW });
        expect(todos.find((todo) => todo.section === 'Qualité')?.title).toBe('Aucun rapport Lighthouse');
        expect(todos.some((todo) => todo.section === 'Publication')).toBe(false);
    });
});
