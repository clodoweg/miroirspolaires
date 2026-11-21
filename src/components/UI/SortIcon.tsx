/**
 * Icône de tri des en-têtes de tableau (visualiseurs d'objets et listes de catalogues)
 *
 * Responsabilité : afficher la flèche neutre, montante ou descendante selon la colonne triée.
 * Défini au niveau module (et non dans le corps d'un composant) pour ne pas être recréé à chaque
 * rendu, ce qui démontait l'icône (règle react-hooks/static-components).
 */

import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

interface SortIconProps<SortKey extends string> {
    sortKey: SortKey;
    activeSort: { col: SortKey; dir: 'asc' | 'desc' } | null;
    /** `md` : 14 px (comètes, astéroïdes) ; `sm` : 12 px. */
    size?: 'sm' | 'md';
    /** Classe de couleur de la flèche neutre (colonne non triée). */
    inactiveClassName?: string;
}

/**
 * Flèche de tri d'une colonne.
 *
 * @param props - Colonne de l'en-tête, tri actif, taille et couleur au repos.
 * @returns L'icône lucide correspondant à l'état de tri.
 */
export default function SortIcon<SortKey extends string>({
    sortKey,
    activeSort,
    size = 'sm',
    inactiveClassName = 'text-mp-text-muted/40',
}: SortIconProps<SortKey>) {
    const sizeClassName = size === 'md' ? 'h-3.5 w-3.5' : 'h-3 w-3';
    if (!activeSort || activeSort.col !== sortKey) {
        return <ArrowUpDown className={`${sizeClassName} ${inactiveClassName}`.trim()} aria-hidden="true" />;
    }
    const Icon = activeSort.dir === 'asc' ? ArrowUp : ArrowDown;
    return <Icon className={`${sizeClassName} text-mp-accent`} aria-hidden="true" />;
}
