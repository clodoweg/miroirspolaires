/**
 * Textes manquants du blog ou des voyages, lus par un `ContentReader`.
 *
 * Responsabilité : lire les Markdown et `src/data/alt.json`, `src/data/seo.json` par la source de l'admin (disque en
 * local, branche dev par l'API GitHub à distance), puis déléguer le calcul à `computeContentGaps`
 * (`content-gaps.mjs`), partagé avec le script `update-content.mjs`.
 */
import { computeContentGaps } from './content-gaps.mjs';
import { listMarkdownSources } from './content-files';
import type { ContentReader } from './stores/content-reader';

export type ContentGapsScope = 'blog' | 'voyages';

export interface ContentGaps {
    missingAltCount: number;
    missingAltsByEntry: Record<string, number>;
    missingSeo: string[];
}

async function readJsonOrEmpty(reader: ContentReader, relativePath: string): Promise<Record<string, unknown>> {
    const raw = await reader.readText(relativePath);
    if (raw === null) return {};
    try {
        return JSON.parse(raw) as Record<string, unknown>;
    } catch {
        // POURQUOI : un manifeste illisible ne doit pas empêcher d'afficher la page ; tout apparaît alors manquant.
        return {};
    }
}

/**
 * Calcule les textes manquants d'un domaine.
 *
 * @param reader - Source des fichiers, enracinée au dépôt.
 * @param scope - Domaine analysé.
 * @returns Le nombre d'images sans alt, leur détail par contenu, et les voyages sans description SEO.
 */
export async function getContentGapsWith(reader: ContentReader, scope: ContentGapsScope): Promise<ContentGaps> {
    const [sources, altData, seoData] = await Promise.all([
        listMarkdownSources(reader, `src/content/${scope}`),
        readJsonOrEmpty(reader, 'src/data/alt.json'),
        readJsonOrEmpty(reader, 'src/data/seo.json'),
    ]);
    return computeContentGaps(
        scope,
        sources.map(({ year, slug, markdown }) => ({ entry: `${year}/${slug}`, markdown })),
        altData,
        seoData,
    );
}
