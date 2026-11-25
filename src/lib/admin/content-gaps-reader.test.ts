// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { getContentGapsWith } from './content-gaps-reader';
import type { ContentReader } from './stores/content-reader';

/** Lecteur en mémoire : `files` associe un chemin relatif à son contenu. */
function memoryReader(files: Record<string, string>): ContentReader {
    return {
        async readText(relativePath) {
            return files[relativePath] ?? null;
        },
        async listDir(relativePath) {
            const prefix = relativePath ? `${relativePath}/` : '';
            const names = new Map<string, 'file' | 'dir'>();
            for (const file of Object.keys(files)) {
                if (!file.startsWith(prefix)) continue;
                const [head, ...rest] = file.slice(prefix.length).split('/');
                names.set(head, rest.length > 0 ? 'dir' : 'file');
            }
            return names.size === 0 ? null : [...names].map(([name, type]) => ({ name, type }));
        },
    };
}

describe('getContentGapsWith', () => {
    it('compte les images de blog sans alt, article par article', async () => {
        const reader = memoryReader({
            'src/content/blog/2026/a.md':
                '---\ntitle: A\n---\n![](/assets/blog/2026/a/1.jpg)\n![Vue](/assets/blog/2026/a/2.jpg)',
            'src/content/blog/2025/b.md': '---\ntitle: B\n---\n![Ok](/assets/blog/2025/b/1.jpg)',
        });
        expect(await getContentGapsWith(reader, 'blog')).toEqual({
            missingAltCount: 1,
            missingAltsByEntry: { '2026/a': 1 },
            missingSeo: [],
        });
    });

    it('signale les voyages sans description SEO, avec un manifeste absent ou illisible', async () => {
        const reader = memoryReader({
            'src/content/voyages/2024/x.md': '---\ntitle: X\n---\n',
            'src/content/voyages/2025/y.md': '---\ntitle: Y\n---\n',
            'src/data/seo.json': JSON.stringify({ 'voyages/2025/y': 'Description' }),
            'src/data/alt.json': '{ illisible',
        });
        const gaps = await getContentGapsWith(reader, 'voyages');
        expect(gaps.missingSeo).toEqual(['2024/x']);
    });

    it('renvoie un résultat vide sans contenu', async () => {
        expect(await getContentGapsWith(memoryReader({}), 'blog')).toEqual({
            missingAltCount: 0,
            missingAltsByEntry: {},
            missingSeo: [],
        });
    });
});
