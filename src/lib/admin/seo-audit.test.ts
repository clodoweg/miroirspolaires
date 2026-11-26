// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { runSeoAudit } from './seo-audit';
import type { ContentReader } from './stores/content-reader';

/** Lecteur en mémoire, comme la lecture de la branche dev sur l'admin distant. */
function memoryReader(files: Record<string, string>): ContentReader {
    return {
        async readText(relativePath) {
            return files[relativePath] ?? null;
        },
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

describe('runSeoAudit', () => {
    it('audite les contenus lus par le lecteur, sans sitemap généré à distance', async () => {
        const report = await runSeoAudit(
            memoryReader({
                'src/data/seo.json': JSON.stringify({ 'voyages/2024/islande': 'Récit' }),
                'src/content/voyages/2024/islande.md': '---\ntitle: Islande\n---\n',
                'src/content/blog/2025/a.md': '---\ntitle: A\ndate: 2025-01-01\ndescription: Résumé\n---\n',
                'src/layouts/BaseLayout.astro': '<script type="application/ld+json">',
            }),
        );
        const paths = report.items.map((item) => item.path);
        expect(paths).toContain('/voyages/2024/islande');
        expect(paths).toContain('/blog/2025/a');
        expect(report.summary.technicalStatus).toMatchObject({ sitemapGenerated: false, structuredDataFilesCount: 1 });
    });

    it('échoue si seo.json est illisible', async () => {
        await expect(runSeoAudit(memoryReader({ 'src/data/seo.json': '{' }))).rejects.toThrow();
    });
});
