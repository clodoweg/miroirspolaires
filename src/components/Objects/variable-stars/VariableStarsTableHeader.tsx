/**
 * @file VariableStarsTableHeader.tsx
 * @description En-têtes de colonnes triables de la liste des étoiles variables (desktop uniquement).
 *
 * Responsabilité : afficher les boutons de tri et leur icône, et signaler la colonne cliquée.
 */

import SortIcon from '@/components/UI/SortIcon';
import type { VariableStarSort, VariableStarSortColumn } from '@/lib/objects/variable-stars';

interface ColumnDefinition {
    key: VariableStarSortColumn;
    label: string;
    align: 'left' | 'right';
    title?: string;
}

const COLUMNS: ColumnDefinition[] = [
    {
        key: 'type',
        label: 'Type',
        align: 'left',
        title: 'Classification astrophysique du mécanisme de variabilité (Pulsation, Éclipses occultantes, Éruptions cataclysmiques).',
    },
    { key: 'vMag', label: 'Magnitude', align: 'right' },
    { key: 'period', label: 'Période', align: 'right' },
    { key: 'visibility', label: 'Visibilité', align: 'left' },
    {
        key: 'compatibility',
        label: 'Faisabilité',
        align: 'left',
        title: 'Combinaison de la visibilité céleste ce soir et de la capacité de votre instrument (diamètre / capteur).',
    },
    {
        key: 'score',
        label: 'Score',
        align: 'right',
        title: "Le score (0-100) dépend de la faisabilité instrumentale, la durée de visibilité nocturne, l'amplitude de variation d'éclat et la brillance maximale.",
    },
];

interface VariableStarsTableHeaderProps {
    sort: VariableStarSort;
    onSort: (key: VariableStarSortColumn) => void;
}

/**
 * Ligne d'en-têtes de la grille (masquée sous `md`).
 *
 * @param props - Tri actif et gestionnaire de clic.
 * @returns La ligne d'en-têtes.
 */
export default function VariableStarsTableHeader({ sort, onSort }: VariableStarsTableHeaderProps) {
    return (
        <div className="col-span-full hidden grid-cols-subgrid items-center gap-4 rounded-xl border border-mp-glass-border bg-mp-glass-solid/50 px-6 py-3 text-xs font-semibold tracking-wider text-mp-text-muted uppercase select-none md:grid">
            <button
                type="button"
                onClick={() => onSort('name')}
                className="flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-left font-semibold transition-colors hover:text-mp-text-primary"
            >
                <span>Nom / Constellation</span>
                <SortIcon sortKey="name" activeSort={sort} />
            </button>

            {COLUMNS.map((column) => (
                <button
                    key={column.key}
                    type="button"
                    onClick={() => onSort(column.key)}
                    title={column.title}
                    className={`flex cursor-pointer items-center ${
                        column.align === 'right' ? 'justify-end' : 'justify-start'
                    } gap-1 border-0 bg-transparent p-0 whitespace-nowrap ${
                        column.align === 'right' ? 'text-right' : 'text-left'
                    } font-semibold text-mp-text-muted transition-colors hover:text-mp-text-primary`}
                >
                    <span>{column.label}</span>
                    <SortIcon sortKey={column.key} activeSort={sort} />
                </button>
            ))}

            <div className="text-left" />
        </div>
    );
}
