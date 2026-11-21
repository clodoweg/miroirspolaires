/**
 * Navigation Configuration
 *
 * Defines the main site navigation items with labels, paths, and dropdowns.
 */

import type { AdminAccessMode } from '../lib/admin/auth/config';
import { isBoutiqueEnabled } from './shop';

export interface NavItem {
    label: string;
    href?: string;
    children?: { label: string; href: string }[];
}

/**
 * Liste de base de tous les éléments de navigation du site.
 */
const baseNavItems: NavItem[] = [
    {
        label: 'Portfolio',
        children: [
            { label: 'Astrophotographies', href: '/astrophotographies' },
            { label: 'Voyages', href: '/voyages' },
        ],
    },
    {
        label: 'Contenus',
        children: [
            { label: 'Blog', href: '/blog' },
            { label: 'Vidéos', href: '/videos' },
        ],
    },
    {
        label: 'Boutique',
        href: '/boutique',
    },
    {
        label: 'Outils',
        children: [
            { label: 'Carte du Ciel', href: '/carte-du-ciel' },
            { label: 'Objets du ciel', href: '/objets' },
            { label: 'Catalogues', href: '/catalogues' },
            { label: 'Recommandations', href: '/recommandations' },
            { label: 'Exoplanètes', href: '/outils/exoplanetes' },
            { label: 'Étoiles Variables', href: '/outils/etoiles-variables' },
            { label: 'Comètes', href: '/outils/cometes' },
            { label: 'Astéroïdes', href: '/outils/asteroides' },
        ],
    },
    {
        label: 'En savoir plus',
        children: [
            { label: 'À propos', href: '/a-propos' },
            { label: 'Observatoires', href: '/observatoires' },
            { label: 'Statistiques', href: '/statistiques' },
        ],
    },
];

/**
 * Retourne la liste des éléments de navigation principale, filtrée dynamiquement.
 *
 * POURQUOI :
 * L'entrée "Boutique" ne doit être visible dans les menus (Desktop, Mobile, Footer)
 * que si la variable d'environnement ENABLE_BOUTIQUE est explicitement à 'true'.
 *
 * OPTIONS ET EXEMPLES :
 * - `const items = getNavItems();`
 * - Si `ENABLE_BOUTIQUE=true` : inclut "Boutique".
 * - Si `ENABLE_BOUTIQUE` est absent ou false : "Boutique" est masqué.
 *
 * @returns Tableau d'éléments de navigation conformes à `NavItem[]`.
 */
export function getNavItems(): NavItem[] {
    const boutiqueActive = isBoutiqueEnabled();
    return baseNavItems.filter((item) => item.label !== 'Boutique' || boutiqueActive);
}

interface AdminNavEntry {
    label: string;
    href: string;
    /** Page qui fonctionne sur l'admin distant (voir `REMOTE_READY_PAGES` d'`AdminLayout.astro`). */
    remote: boolean;
    /** Page sans objet en local (mise en production, journal, diagnostic GitHub). */
    remoteOnly?: boolean;
}

const ADMIN_NAV_ENTRIES: AdminNavEntry[] = [
    { label: "Vue d'ensemble", href: '/admin', remote: true },
    { label: 'Blog', href: '/admin/blog', remote: true },
    { label: 'Voyages', href: '/admin/voyages', remote: true },
    { label: 'Astrophotographies', href: '/admin/astrophotos', remote: false },
    { label: 'Base de données', href: '/admin/database', remote: false },
    { label: 'Routes amont', href: '/admin/upstream', remote: true },
    { label: 'SEO', href: '/admin/seo', remote: false },
    { label: 'Lighthouse', href: '/admin/lighthouse', remote: true },
    { label: 'Scripts', href: '/admin/scripts', remote: true },
    { label: 'Cloudflare R2', href: '/admin/r2', remote: false },
    { label: 'Cache CDN', href: '/admin/cache', remote: true },
    { label: 'Mise en production', href: '/admin/publication', remote: true, remoteOnly: true },
    { label: 'Journal', href: '/admin/journal', remote: true, remoteOnly: true },
    { label: 'Diagnostic', href: '/admin/diagnostic', remote: true, remoteOnly: true },
];

/**
 * Menu déroulant « Admin » de la barre de navigation.
 *
 * WARNING: ne jamais lier `/admin` depuis le site public. Le menu n'existe qu'en `npm run dev` (mode
 * `local`) et dans le build de la Preview de la branche de contenu (mode `remote`) ; la production et
 * les autres Previews (`disabled`) n'en ont pas.
 *
 * @param mode - Mode d'accès à l'admin (`getAdminAccessMode()`), évalué au build pour les pages prérendues.
 * @returns L'entrée de menu, ou `null` quand l'admin n'existe pas dans cet environnement.
 */
export function getAdminNavItem(mode: AdminAccessMode): NavItem | null {
    if (mode === 'disabled') return null;
    const entries = ADMIN_NAV_ENTRIES.filter((entry) => (mode === 'remote' ? entry.remote : !entry.remoteOnly));
    return { label: 'Admin', children: entries.map(({ label, href }) => ({ label, href })) };
}
