/**
 * Navigation Configuration
 *
 * Defines the main site navigation items with labels, paths, and dropdowns.
 */

import type { AdminAccessMode } from '../lib/admin/auth/config';
import { isBoutiqueEnabled } from './shop';
import { ADMIN_PAGES, isAdminPageAvailable } from './admin-sections';

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
    // POURQUOI : quelques raccourcis seulement ; la navigation complète est la barre latérale de l'admin.
    const entries = ADMIN_PAGES.filter((page) => page.inNavbar && isAdminPageAvailable(page, mode));
    return { label: 'Admin', children: entries.map((page) => ({ label: page.group ?? page.label, href: page.href })) };
}
