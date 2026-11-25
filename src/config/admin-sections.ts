/**
 * Registre des pages de l'administration
 *
 * Responsabilité : source unique de la structure de `/admin`. Il alimente la barre latérale et le fil
 * d'Ariane d'`AdminLayout.astro`, le menu « Admin » de la barre de navigation (`navigation.ts`), la
 * disponibilité de chaque page selon le mode (local ou distant) et les redirections des anciennes URL
 * (`src/pages/admin/[...legacy].astro`).
 *
 * POURQUOI un registre : la liste des pages était recopiée dans quatre endroits (menu, titres, pages prêtes
 * à distance, tableau de bord distant), qui avaient fini par diverger.
 *
 * WARNING: ce fichier ne protège rien. Les pages restent gardées par `isAdminGranted()` et les routes API
 * par `requireAdmin()` et `remote-capabilities.ts`. `availability` ne sert qu'à l'affichage.
 */

/** Où une page fonctionne : partout, seulement en `npm run dev`, ou seulement sur l'admin distant. */
export type AdminPageAvailability = 'both' | 'local' | 'remote';

/** Mode d'affichage de l'admin (les modes `disabled` n'ont pas d'admin). */
export type AdminDisplayMode = 'local' | 'remote';

export interface AdminPage {
    /** Identifiant passé à `AdminLayout` (`active`). */
    id: AdminPageId;
    /** Libellé du menu et du fil d'Ariane. */
    label: string;
    /** Sous-groupe de la section (« Blog » dans « Contenu ») ; la barre latérale le montre en en-tête. */
    group?: string;
    /** URL de la page. */
    href: string;
    /** Une phrase : à quoi sert la page. */
    description: string;
    availability: AdminPageAvailability;
    /** Anciennes URL, redirigées vers `href`. */
    legacyHrefs?: string[];
    /** Présente dans le menu « Admin » de la barre de navigation du site. */
    inNavbar?: boolean;
}

export interface AdminSection {
    id: string;
    label: string;
    pages: AdminPage[];
}

export type AdminPageId =
    | 'dashboard'
    | 'astrophotos'
    | 'astro-import'
    | 'blog'
    | 'blog-images'
    | 'voyages'
    | 'voyages-images'
    | 'database'
    | 'upstream'
    | 'seo'
    | 'lighthouse'
    | 'r2'
    | 'cache'
    | 'scripts'
    | 'publication'
    | 'journal'
    | 'diagnostic';

/** Page d'accueil de l'admin, hors section. */
export const ADMIN_DASHBOARD: AdminPage = {
    id: 'dashboard',
    label: 'Tableau de bord',
    href: '/admin',
    description: "Vue d'ensemble et actions en attente.",
    availability: 'both',
    inNavbar: true,
};

/** Sections de la barre latérale, dans l'ordre des workflows. */
export const ADMIN_SECTIONS: AdminSection[] = [
    {
        id: 'contenu',
        label: 'Contenu',
        pages: [
            {
                id: 'astrophotos',
                label: "Vue d'ensemble",
                group: 'Astrophotographies',
                href: '/admin/astrophotos',
                description: 'Catalogue des astrophotos, complétude et fiches.',
                availability: 'both',
                inNavbar: true,
            },
            {
                id: 'astro-import',
                label: 'Importer',
                group: 'Astrophotographies',
                href: '/admin/astrophotos/importer',
                description: 'Mise à jour depuis AstroBin : scrape, traitement, envoi sur R2.',
                availability: 'both',
            },
            {
                id: 'blog',
                label: "Vue d'ensemble",
                group: 'Blog',
                href: '/admin/blog',
                description: 'Articles : liste, édition et images.',
                availability: 'both',
                inNavbar: true,
            },
            {
                id: 'blog-images',
                label: 'Images & textes',
                group: 'Blog',
                href: '/admin/blog/images',
                description: 'Images sur R2, dimensions, versions web, alts et SEO manquants.',
                availability: 'both',
            },
            {
                id: 'voyages',
                label: "Vue d'ensemble",
                group: 'Voyages',
                href: '/admin/voyages',
                description: 'Récits de voyage : liste, édition et galeries.',
                availability: 'both',
                inNavbar: true,
            },
            {
                id: 'voyages-images',
                label: 'Images & textes',
                group: 'Voyages',
                href: '/admin/voyages/images',
                description: 'Images sur R2, dimensions, versions web, alts et SEO manquants.',
                availability: 'both',
            },
        ],
    },
    {
        id: 'donnees',
        label: 'Données astronomiques',
        pages: [
            {
                id: 'database',
                label: 'Base de données',
                href: '/admin/donnees',
                description: 'Tables Turso (exoplanètes, étoiles variables, comètes, astéroïdes) et catalogues.',
                availability: 'local',
                legacyHrefs: ['/admin/database'],
            },
            {
                id: 'upstream',
                label: 'Routes CDS',
                href: '/admin/donnees/routes-cds',
                description: 'Ordre de priorité des miroirs SIMBAD, VizieR et Sesame.',
                availability: 'both',
                legacyHrefs: ['/admin/upstream'],
            },
        ],
    },
    {
        id: 'qualite',
        label: 'Qualité',
        pages: [
            {
                id: 'seo',
                label: 'Audit SEO',
                href: '/admin/qualite/seo',
                description: 'Couverture des descriptions, des alts et des données structurées.',
                availability: 'local',
                legacyHrefs: ['/admin/seo'],
            },
            {
                id: 'lighthouse',
                label: 'Performance',
                href: '/admin/qualite/performance',
                description: 'Dernier rapport Lighthouse et Core Web Vitals.',
                availability: 'both',
                legacyHrefs: ['/admin/lighthouse'],
            },
        ],
    },
    {
        id: 'infra',
        label: 'Infrastructure',
        pages: [
            {
                id: 'r2',
                label: 'Stockage R2',
                href: '/admin/infra/r2',
                description: 'Contenu du bucket Cloudflare R2.',
                availability: 'local',
                legacyHrefs: ['/admin/r2'],
            },
            {
                id: 'cache',
                label: 'Cache CDN & Worker',
                href: '/admin/infra/cache',
                description: "État du worker d'images, préchauffage et purge du cache.",
                availability: 'both',
                legacyHrefs: ['/admin/cache'],
            },
            {
                id: 'scripts',
                label: 'Scripts (expert)',
                href: '/admin/infra/scripts',
                description: 'Tous les scripts, avec leurs options.',
                availability: 'both',
                legacyHrefs: ['/admin/scripts'],
            },
        ],
    },
    {
        id: 'publication',
        label: 'Publication',
        pages: [
            {
                id: 'publication',
                label: 'Mise en production',
                href: '/admin/publication',
                description: 'Publier sur le site public les modifications validées sur dev.',
                availability: 'remote',
                inNavbar: true,
            },
            {
                id: 'journal',
                label: 'Journal',
                href: '/admin/publication/journal',
                description: 'Qui a modifié quoi, et quand.',
                availability: 'remote',
                legacyHrefs: ['/admin/journal'],
            },
            {
                id: 'diagnostic',
                label: 'Diagnostic GitHub',
                href: '/admin/publication/diagnostic',
                description: "Accès de l'admin distant au dépôt et à R2.",
                availability: 'remote',
                legacyHrefs: ['/admin/diagnostic'],
            },
        ],
    },
];

/** Toutes les pages, tableau de bord compris. */
export const ADMIN_PAGES: AdminPage[] = [ADMIN_DASHBOARD, ...ADMIN_SECTIONS.flatMap((section) => section.pages)];

/**
 * Nom complet d'une page, groupe compris (« Blog › Images & textes »).
 *
 * @param page - Page du registre.
 * @returns Le libellé, préfixé du groupe s'il y en a un.
 */
export function getAdminPageTitle(page: AdminPage): string {
    return page.group ? `${page.group} › ${page.label}` : page.label;
}

/**
 * Retrouve une page du registre.
 *
 * @param id - Identifiant de la page.
 * @returns La page.
 * @throws Error si l'identifiant est inconnu (erreur de programmation).
 */
export function getAdminPage(id: AdminPageId): AdminPage {
    const page = ADMIN_PAGES.find((candidate) => candidate.id === id);
    if (!page) throw new Error(`Page d'admin inconnue : ${id}`);
    return page;
}

/**
 * Retrouve la section d'une page.
 *
 * @param id - Identifiant de la page.
 * @returns La section, ou `undefined` pour le tableau de bord.
 */
export function getAdminSectionOf(id: AdminPageId): AdminSection | undefined {
    return ADMIN_SECTIONS.find((section) => section.pages.some((page) => page.id === id));
}

/**
 * Indique si une page fonctionne dans un mode donné.
 *
 * @param page - Page du registre.
 * @param mode - Mode de l'admin.
 * @returns `true` si la page est utilisable dans ce mode.
 */
export function isAdminPageAvailable(page: AdminPage, mode: AdminDisplayMode): boolean {
    return page.availability === 'both' || page.availability === mode;
}

/**
 * Nouvelle URL d'une ancienne URL de l'admin.
 *
 * @param pathname - Chemin demandé, sans query (`/admin/seo`, avec ou sans `/` final).
 * @returns L'URL actuelle de la page, ou `null` si le chemin n'est pas une ancienne URL connue.
 */
export function resolveLegacyAdminHref(pathname: string): string | null {
    const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
    const page = ADMIN_PAGES.find((candidate) => candidate.legacyHrefs?.includes(normalized));
    return page ? page.href : null;
}
