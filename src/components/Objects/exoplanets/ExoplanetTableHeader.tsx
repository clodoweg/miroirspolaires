/**
 * En-tête triable de la liste des exoplanètes (desktop uniquement)
 *
 * Responsabilité : rendre les boutons de tri des colonnes dans la sous-grille de la liste.
 * Le cycle de tri est calculé par `nextExoplanetSort` dans le composant parent.
 */

import SortIcon from '@/components/UI/SortIcon';
import type { ExoplanetSort, ExoplanetSortColumn } from '@/lib/objects/exoplanets';

const HEADER_BUTTON_BASE =
    'flex cursor-pointer items-center gap-1 whitespace-nowrap border-0 bg-transparent p-0 font-semibold text-mp-text-muted transition-colors hover:text-mp-text-primary';

interface ColumnDefinition {
    key: ExoplanetSortColumn;
    label: string;
    align: 'start' | 'end';
    title?: string;
}

interface ExoplanetTableHeaderProps {
    sort: ExoplanetSort | null;
    onToggleSort: (key: ExoplanetSortColumn) => void;
    /** Libellé du fuseau de l'observatoire (ex. `UTC+2`). */
    tzLabel: string;
}

/**
 * En-tête de colonnes triables.
 *
 * @param props - Tri actif, callback de tri et libellé du fuseau.
 * @returns La ligne d'en-tête (masquée sous `md`).
 */
export default function ExoplanetTableHeader({ sort, onToggleSort, tzLabel }: ExoplanetTableHeaderProps) {
    const columns: ColumnDefinition[] = [
        {
            key: 'type',
            label: 'Type',
            align: 'start',
            title: "Statut de la découverte (Exoplanète dont l'existence est définitivement confirmée ou Candidate TESS TOI).",
        },
        { key: 'vMag', label: 'Mag (V)', align: 'end' },
        { key: 'depth', label: 'Profondeur', align: 'end' },
        { key: 'transit', label: `Transit (${tzLabel})`, align: 'start' },
        {
            key: 'difficulty',
            label: 'Faisabilité',
            align: 'start',
            title: 'Combinaison de la visibilité céleste ce soir et de la capacité de votre instrument (diamètre / capteur).',
        },
        {
            key: 'score',
            label: 'Score',
            align: 'end',
            title: 'Le score (0-100) dépend de la faisabilité matérielle/nocturne, du SNR photométrique, de la magnitude et du transit ce soir (score 0 si pas de transit ou inobservable).',
        },
    ];

    return (
        <div className="col-span-full hidden grid-cols-subgrid items-center gap-4 rounded-xl border border-mp-glass-border bg-mp-glass-solid/50 px-6 py-3 text-xs font-semibold tracking-wider text-mp-text-muted uppercase select-none md:grid">
            <button
                type="button"
                onClick={() => onToggleSort('name')}
                className="flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-left font-semibold transition-colors hover:text-mp-text-primary"
            >
                <span>Nom / Constellation</span>
                <SortIcon sortKey="name" activeSort={sort} />
            </button>

            {columns.map((column) => (
                <button
                    key={column.key}
                    type="button"
                    onClick={() => onToggleSort(column.key)}
                    title={column.title}
                    className={`${HEADER_BUTTON_BASE} ${column.align === 'end' ? 'justify-end text-right' : 'justify-start text-left'}`}
                >
                    <span>{column.label}</span>
                    <SortIcon sortKey={column.key} activeSort={sort} />
                </button>
            ))}

            <div className="text-left" />
        </div>
    );
}
