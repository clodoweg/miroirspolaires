/**
 * Liste « À faire » du tableau de bord de l'admin.
 *
 * Responsabilité : rassembler ce qui manque dans chaque section, avec la page qui permet de le corriger :
 * descriptions SEO et alts (audit SEO, textes manquants du blog et des voyages), descriptions Wikipedia des
 * astrophotos, instantanés de catalogues absents, rapport Lighthouse ancien, commits en attente de mise en
 * production (admin distant). Chaque source est lue à part : l'échec de l'une est signalé sans masquer les autres.
 */
import Papa from 'papaparse';
import { getContentGapsWith } from './content-gaps-reader';
import { readCatalogueSnapshotStatus } from './catalogue-snapshots';
import type { ReleaseStatus } from './github/release';
import { runSeoAudit } from './seo-audit';
import { createUniqueHeaderTransform } from './shared';
import type { ContentReader } from './stores/content-reader';

export interface AdminTodo {
    /** Section de l'admin concernée (libellé du registre). */
    section: string;
    title: string;
    detail: string;
    /** Page qui permet de corriger. */
    href: string;
}

export interface AdminTodoReport {
    todos: AdminTodo[];
    /** Sources illisibles, à signaler sans bloquer le reste. */
    errors: string[];
}

/** Âge au-delà duquel le rapport Lighthouse est signalé. */
export const LIGHTHOUSE_MAX_AGE_DAYS = 30;

const plural = (count: number, singular: string, pluralForm = `${singular}s`) =>
    `${count} ${count > 1 ? pluralForm : singular}`;

async function seoTodos(reader: ContentReader): Promise<AdminTodo[]> {
    const audit = await runSeoAudit(reader);
    const missing = (type: string) => audit.items.filter((item) => item.type === type && !item.hasDescription).length;
    const todos: AdminTodo[] = [];
    const astroDescriptions = missing('astrophoto');
    if (astroDescriptions > 0) {
        todos.push({
            section: 'Astrophotographies',
            title: `${plural(astroDescriptions, 'photo')} sans description SEO`,
            detail: 'À écrire dans Claude Code : /generate-seo astro.',
            href: '/admin/astrophotos/textes',
        });
    }
    const astroAlts = audit.items.filter((item) => item.type === 'astrophoto' && !item.hasAltText).length;
    if (astroAlts > 0) {
        todos.push({
            section: 'Astrophotographies',
            title: `${plural(astroAlts, 'photo')} sans alt`,
            detail: 'Les alts se construisent depuis le CSV au prochain import.',
            href: '/admin/astrophotos/textes',
        });
    }
    const blogDescriptions = missing('blog');
    if (blogDescriptions > 0) {
        todos.push({
            section: 'Blog',
            title: `${plural(blogDescriptions, 'article')} sans description`,
            detail: 'Champ « description » du frontmatter, dans l’éditeur.',
            href: '/admin/blog',
        });
    }
    const pageDescriptions = missing('page');
    if (pageDescriptions > 0) {
        todos.push({
            section: 'Pages du site',
            title: `${plural(pageDescriptions, 'page')} sans description SEO`,
            detail: 'À rédiger dans src/data/seo.json.',
            href: '/admin/pages',
        });
    }
    return todos;
}

async function contentGapTodos(reader: ContentReader): Promise<AdminTodo[]> {
    const todos: AdminTodo[] = [];
    for (const [scope, section] of [
        ['blog', 'Blog'],
        ['voyages', 'Voyages'],
    ] as const) {
        const gaps = await getContentGapsWith(reader, scope);
        if (gaps.missingAltCount > 0) {
            todos.push({
                section,
                title: `${plural(gaps.missingAltCount, 'image')} sans alt`,
                detail: `À écrire dans Claude Code : /generate-alts ${scope}.`,
                href: `/admin/${scope}/images`,
            });
        }
        if (gaps.missingSeo.length > 0) {
            todos.push({
                section,
                title: `${plural(gaps.missingSeo.length, 'voyage')} sans description SEO`,
                detail: `À écrire dans Claude Code : /generate-seo ${scope}.`,
                href: `/admin/${scope}/images`,
            });
        }
    }
    return todos;
}

async function wikipediaTodos(reader: ContentReader): Promise<AdminTodo[]> {
    const [csv, wikiRaw] = await Promise.all([
        reader.readText('data/astrobin_clodoweg_gallery_python.csv'),
        reader.readText('src/data/wikipedia.json'),
    ]);
    if (csv === null) return [];
    const wiki = wikiRaw ? (JSON.parse(wikiRaw) as Record<string, { description?: string }>) : {};
    const parsed = Papa.parse<Record<string, string>>(csv, {
        header: true,
        skipEmptyLines: true,
        transformHeader: createUniqueHeaderTransform(),
    });
    const missing = (parsed.data ?? []).filter((row) => {
        const id = String(row.ID ?? '').trim();
        return id && !wiki[id]?.description;
    }).length;
    if (missing === 0) return [];
    return [
        {
            section: 'Astrophotographies',
            title: `${plural(missing, 'photo')} sans description Wikipedia`,
            detail: 'Aucun article trouvé à l’import : à compléter dans la fiche de la photo.',
            href: '/admin/astrophotos?filtre=missing-wiki',
        },
    ];
}

async function catalogueTodos(reader: ContentReader): Promise<AdminTodo[]> {
    const status = await readCatalogueSnapshotStatus(reader);
    if (status.missing.length === 0) return [];
    return [
        {
            section: 'Données astronomiques',
            title: `${plural(status.missing.length, 'catalogue')} sans instantané`,
            detail: `Servis en direct par le CDS : ${status.missing.map((catalogue) => catalogue.shortName).join(', ')}.`,
            href: '/admin/donnees/catalogues',
        },
    ];
}

async function lighthouseTodos(reader: ContentReader, now: Date): Promise<AdminTodo[]> {
    const raw = await reader.readText('src/data/lighthouse-results.json');
    const timestamp = raw ? (JSON.parse(raw) as { timestamp?: string }).timestamp : undefined;
    const ageDays = timestamp ? (now.getTime() - new Date(timestamp).getTime()) / 86_400_000 : Infinity;
    if (ageDays <= LIGHTHOUSE_MAX_AGE_DAYS) return [];
    return [
        {
            section: 'Qualité',
            title: timestamp
                ? `Rapport Lighthouse de plus de ${LIGHTHOUSE_MAX_AGE_DAYS} jours`
                : 'Aucun rapport Lighthouse',
            detail: timestamp ? `Dernier audit : ${timestamp.slice(0, 10)}.` : 'Lancer un audit de performance.',
            href: '/admin/qualite/performance',
        },
    ];
}

function releaseTodos(release: ReleaseStatus | null): AdminTodo[] {
    if (!release || release.ahead === 0) return [];
    return [
        {
            section: 'Publication',
            title: `${plural(release.ahead, 'commit')} sur ${release.contentBranch} pas encore en production`,
            detail: release.pullRequest
                ? 'Une demande de mise en production est ouverte.'
                : 'Rien n’est encore proposé.',
            href: '/admin/publication',
        },
    ];
}

/**
 * Rassemble la liste « À faire ».
 *
 * @param reader - Source des fichiers (disque en local, branche dev à distance).
 * @param options.release - Lecture de l'état de mise en production (admin distant seulement).
 * @param options.now - Date courante (tests).
 * @returns Les actions à faire, dans l'ordre des sections, et les sources illisibles.
 */
export async function collectAdminTodos(
    reader: ContentReader,
    options: { release?: () => Promise<ReleaseStatus | null>; now?: Date } = {},
): Promise<AdminTodoReport> {
    const now = options.now ?? new Date();
    const sources: [string, () => Promise<AdminTodo[]>][] = [
        ['audit SEO', () => seoTodos(reader)],
        ['wikipedia.json', () => wikipediaTodos(reader)],
        ['textes du blog et des voyages', () => contentGapTodos(reader)],
        ['instantanés de catalogues', () => catalogueTodos(reader)],
        ['rapport Lighthouse', () => lighthouseTodos(reader, now)],
        ['mise en production', async () => releaseTodos(options.release ? await options.release() : null)],
    ];
    const results = await Promise.allSettled(sources.map(([, load]) => load()));
    const todos: AdminTodo[] = [];
    const errors: string[] = [];
    results.forEach((result, index) => {
        if (result.status === 'fulfilled') todos.push(...result.value);
        else errors.push(`${sources[index][0]} : ${(result.reason as Error)?.message ?? String(result.reason)}`);
    });
    const sectionOrder = [
        'Astrophotographies',
        'Blog',
        'Voyages',
        'Pages du site',
        'Données astronomiques',
        'Qualité',
        'Publication',
    ];
    todos.sort((left, right) => sectionOrder.indexOf(left.section) - sectionOrder.indexOf(right.section));
    return { todos, errors };
}
