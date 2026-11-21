/**
 * Aperçu réel d'un article (blog ou voyage) avant enregistrement, en dev uniquement.
 *
 * Responsabilités :
 * - valider et conserver en mémoire le brouillon envoyé par l'éditeur (`POST /api/admin/preview`) ;
 * - le rendre avec les mêmes plugins rehype que le site (`astro.config.mjs`), dans le même ordre ;
 * - faire pointer les images vers les routes admin qui lisent `src/assets`, pour que les photos
 *   pas encore synchronisées sur R2 s'affichent.
 *
 * POURQUOI un stockage en mémoire plutôt qu'un POST direct vers la page d'aperçu : la page
 * rend du HTML arbitraire (le Markdown autorise le HTML). Seule l'API, protégée contre les
 * requêtes inter-sites par `src/middleware.ts`, peut y écrire : une page tierce ne peut donc
 * pas faire exécuter du HTML sur l'origine du serveur de dev.
 */
import { randomUUID } from 'node:crypto';
import { createMarkdownProcessor } from '@astrojs/markdown-remark';
import type { Element, Root } from 'hast';
import { visit } from 'unist-util-visit';

type MarkdownProcessorOptions = NonNullable<Parameters<typeof createMarkdownProcessor>[0]>;
import { rehypeFigure } from '@/plugins/rehype-figure.mjs';
import { rehypeImageLoading } from '@/plugins/rehype-image-loading.mjs';
import { rehypeMasonry } from '@/plugins/rehype-masonry.mjs';
import { rehypeProbeDimensions } from '@/plugins/rehype-probe-dimensions.mjs';

export type PreviewSection = 'blog' | 'voyages';

export interface ArticlePreviewDraft {
    section: PreviewSection;
    year: string;
    slug: string;
    frontmatter: Record<string, unknown>;
    body: string;
}

/** Nombre de brouillons gardés en mémoire (les plus anciens sont oubliés). */
const MAX_STORED_PREVIEWS = 20;
/** Taille maximale d'un corps d'article accepté pour l'aperçu (caractères). */
const MAX_BODY_LENGTH = 2_000_000;

const ADMIN_IMAGE_ROUTES: Record<PreviewSection, string> = {
    blog: '/api/admin/images',
    voyages: '/api/admin/voyages-images',
};

// POURQUOI : `globalThis` plutôt qu'une variable de module, que Vite peut instancier
// séparément pour la route API et pour la page après un rechargement à chaud.
const STORE_KEY = Symbol.for('miroirspolaires.admin.articlePreviews');

function getStore(): Map<string, ArticlePreviewDraft> {
    const globalStore = globalThis as unknown as Record<symbol, Map<string, ArticlePreviewDraft> | undefined>;
    globalStore[STORE_KEY] ??= new Map();
    return globalStore[STORE_KEY];
}

/**
 * Vérifie la forme d'un brouillon reçu par l'API.
 * @param input Corps JSON de la requête.
 * @returns Le brouillon typé, ou un message d'erreur.
 */
export function parsePreviewDraft(input: unknown): ArticlePreviewDraft | string {
    if (!input || typeof input !== 'object') return 'Corps JSON attendu.';
    const draft = input as Record<string, unknown>;
    if (draft.section !== 'blog' && draft.section !== 'voyages') return 'Section inconnue.';
    if (typeof draft.year !== 'string' || !/^\d{4}$/.test(draft.year)) return 'Année invalide.';
    if (typeof draft.slug !== 'string' || !/^[a-z0-9-]{0,120}$/.test(draft.slug)) return 'Slug invalide.';
    if (typeof draft.body !== 'string' || draft.body.length > MAX_BODY_LENGTH) return 'Corps invalide.';
    if (!draft.frontmatter || typeof draft.frontmatter !== 'object' || Array.isArray(draft.frontmatter)) {
        return 'Frontmatter invalide.';
    }
    return {
        section: draft.section,
        year: draft.year,
        slug: draft.slug,
        frontmatter: draft.frontmatter as Record<string, unknown>,
        body: draft.body,
    };
}

/**
 * Conserve un brouillon et renvoie son identifiant (à passer à `/admin/apercu?id=…`).
 * @param draft Brouillon validé.
 * @returns Identifiant aléatoire du brouillon.
 */
export function savePreviewDraft(draft: ArticlePreviewDraft): string {
    const store = getStore();
    const id = randomUUID();
    store.set(id, draft);
    while (store.size > MAX_STORED_PREVIEWS) {
        const oldest = store.keys().next().value;
        if (oldest === undefined) break;
        store.delete(oldest);
    }
    return id;
}

/**
 * Relit un brouillon conservé.
 * @param id Identifiant renvoyé par `savePreviewDraft()`.
 * @returns Le brouillon, ou `undefined` s'il est inconnu ou expiré.
 */
export function getPreviewDraft(id: string): ArticlePreviewDraft | undefined {
    return getStore().get(id);
}

/**
 * Convertit une URL d'image du site (R2, worker, version web, chemin Markdown) en URL de la
 * route admin qui lit `src/assets`.
 * @param url URL ou chemin d'image.
 * @returns L'URL locale, ou `null` si l'image n'appartient pas à un article.
 * @example
 * toLocalPreviewImageUrl('https://pub-r2.miroirspolaires.fr/blog/2026/fjords/a.jpg')
 * // => '/api/admin/images/2026/fjords/a.jpg'
 */
export function toLocalPreviewImageUrl(url: string): string | null {
    const clean = url.trim().split(/\s/)[0].replace(/#360$/, '');
    const match = /(?:^|\/)(?:assets\/)?(blog|voyages)\/(\d{4})\/([a-z0-9-]+)\/([^/?#]+)$/.exec(clean);
    if (!match) return null;
    const [, section, year, slug, file] = match;
    return `${ADMIN_IMAGE_ROUTES[section as PreviewSection]}/${year}/${slug}/${file}`;
}

/** Nom hast d'un attribut : `data-full-src` → `dataFullSrc`, `srcset` → `srcSet`. */
function hastName(attribute: string): string {
    if (attribute === 'srcset') return 'srcSet';
    if (attribute === 'onerror') return 'onError';
    if (attribute === 'onload') return 'onLoad';
    return attribute.replace(/-([a-z0-9])/g, (_, letter: string) => letter.toUpperCase());
}

// POURQUOI : les plugins du site écrivent tantôt `'data-full-src'`, tantôt le nom hast `dataFullSrc`.
function readProperty(properties: Element['properties'], attribute: string): unknown {
    return properties[attribute] ?? properties[hastName(attribute)];
}

function deleteProperty(properties: Element['properties'], attribute: string): void {
    delete properties[attribute];
    delete properties[hastName(attribute)];
}

/**
 * Plugin rehype de l'aperçu : remplace les sources d'images de production par les routes admin.
 *
 * POURQUOI : une image tout juste téléversée n'existe encore ni sur R2 ni dans les versions
 * web. On garde la structure produite par `rehype-masonry` (picture, galerie, légendes) mais
 * on sert le fichier original local, sans `srcset`.
 * @returns Transformateur rehype.
 */
export function rehypeLocalPreviewImages() {
    return (tree: Root) => {
        visit(tree, 'element', (node: Element, index, parent) => {
            if (node.tagName === 'source' && parent && typeof index === 'number') {
                parent.children.splice(index, 1);
                return index;
            }
            if (node.tagName !== 'img') return;
            const properties = (node.properties ??= {});
            const local = ['data-fallback-src', 'data-full-src', 'src']
                .map((name) => readProperty(properties, name))
                .filter((value): value is string => typeof value === 'string')
                .map(toLocalPreviewImageUrl)
                .find((value) => value !== null);
            if (!local) return;
            // POURQUOI : le lecteur 360° résout lui-même l'URL via /api/r2-image, qui lit le disque en dev.
            if (readProperty(properties, 'data-is-360') !== 'true') properties.src = local;
            for (const name of ['data-fallback-src', 'data-full-src']) {
                deleteProperty(properties, name);
                properties[name] = local;
            }
            for (const name of ['srcset', 'sizes', 'onerror', 'onload']) deleteProperty(properties, name);
        });
    };
}

/**
 * Rend le corps Markdown d'un brouillon avec le pipeline du site.
 * @param draft Brouillon à rendre.
 * @returns Le HTML du corps de l'article.
 */
export async function renderArticlePreview(draft: ArticlePreviewDraft): Promise<string> {
    // WARNING: même ordre que `markdown.rehypePlugins` dans astro.config.mjs (vérifié par un test) :
    // probe doit précéder masonry, qui recopie les dimensions dans le <picture> qu'il génère.
    // POURQUOI : les plugins .mjs sont typés en JSDoc par `Function`, plus large que `RehypePlugin`.
    const rehypePlugins = [
        rehypeProbeDimensions,
        rehypeMasonry,
        rehypeImageLoading,
        rehypeFigure,
        rehypeLocalPreviewImages,
    ] as unknown as MarkdownProcessorOptions['rehypePlugins'];
    const processor = await createMarkdownProcessor({ rehypePlugins });
    const result = await processor.render(draft.body, { frontmatter: draft.frontmatter });
    return result.code;
}
