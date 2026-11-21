/**
 * Tableau des petits corps (comètes, astéroïdes) : grille, en-tête triable et lignes dépliables
 *
 * Responsabilité : structure commune aux deux visualiseurs. Une ligne affiche une version
 * mobile empilée (< md) et une version desktop en sous-grille alignée sur l'en-tête ; les
 * cellules propres à chaque type d'objet (badge de type, sous-titre, mesures) sont fournies
 * par le visualiseur.
 */

import type { ReactNode } from 'react';
import { ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import SortIcon from '@/components/UI/SortIcon';
import { feasibilityTitle, type FeasibilityEvaluation, type SortState } from '@/lib/objects/small-bodies';

/** Grille du tableau : nom extensible puis huit colonnes ajustées au contenu. */
export const SMALL_BODY_TABLE_CLASS =
    'grid grid-cols-1 gap-y-3 md:grid-cols-[minmax(0,1fr)_max-content_max-content_max-content_max-content_max-content_max-content_max-content_max-content]';

/** Bouton d'en-tête aligné à gauche. */
export const SORT_BUTTON_LEFT_CLASS =
    'flex cursor-pointer items-center justify-start gap-1 whitespace-nowrap border-0 bg-transparent p-0 text-left font-semibold text-mp-text-muted transition-colors hover:text-mp-text-primary';

/** Bouton d'en-tête aligné à droite (colonnes numériques). */
export const SORT_BUTTON_RIGHT_CLASS =
    'flex cursor-pointer items-center justify-end gap-1 whitespace-nowrap border-0 bg-transparent p-0 text-right font-semibold text-mp-text-muted transition-colors hover:text-mp-text-primary';

/** Colonne triable de l'en-tête. */
export interface SortColumn<Column extends string> {
    key: Column;
    label: string;
    className: string;
    title?: string;
}

interface SmallBodyTableHeaderProps<Column extends string> {
    columns: readonly SortColumn<Column>[];
    sort: SortState<Column> | null;
    onSort: (col: Column) => void;
}

/**
 * En-tête desktop du tableau, une colonne triable par descripteur puis la colonne du chevron.
 *
 * @param props - Colonnes, tri actif et callback de tri.
 * @returns La ligne d'en-tête (masquée sous md).
 */
export function SmallBodyTableHeader<Column extends string>({
    columns,
    sort,
    onSort,
}: SmallBodyTableHeaderProps<Column>) {
    return (
        <div className="col-span-full hidden grid-cols-subgrid items-center gap-4 rounded-xl border border-mp-glass-border bg-mp-glass-solid/50 px-6 py-3 text-xs font-semibold tracking-wider text-mp-text-muted uppercase select-none md:grid">
            {columns.map((column) => (
                <button
                    key={column.key}
                    type="button"
                    onClick={() => onSort(column.key)}
                    title={column.title}
                    className={column.className}
                >
                    <span>{column.label}</span>
                    <SortIcon
                        sortKey={column.key}
                        activeSort={sort}
                        size="md"
                        inactiveClassName="text-mp-text-muted/30"
                    />
                </button>
            ))}

            <div className="text-left" />
        </div>
    );
}

/** Champs d'un petit corps affichés dans une ligne. */
export interface SmallBodyRowData {
    name: string;
    id: string;
    statusLabel: string;
    statusColor: string;
    hoursVisible: number;
    feasibility: FeasibilityEvaluation;
    score: number;
}

interface SmallBodyRowProps {
    body: SmallBodyRowData;
    isExpanded: boolean;
    onToggle: () => void;
    /** Badge de type (comète périodique, PHA…), affiché en mobile et en desktop. */
    typeBadge: ReactNode;
    /** Classes de la désignation en desktop. */
    desktopIdClassName: string;
    /** Ligne secondaire sous le nom en desktop. */
    desktopSubtitle: ReactNode;
    /** Trois mesures alignées à droite (desktop). */
    metrics: readonly [string, string, string];
    /** Infobulle du score. */
    scoreTitle: string;
    /** Panneau de détail, rendu seulement quand la ligne est dépliée. */
    renderDetails: () => ReactNode;
}

/**
 * Ligne dépliable du tableau des petits corps.
 *
 * @param props - Données du corps, état de dépliage, cellules spécifiques et panneau de détail.
 * @returns La ligne et, si elle est dépliée, son panneau de détail.
 */
export function SmallBodyRow({
    body,
    isExpanded,
    onToggle,
    typeBadge,
    desktopIdClassName,
    desktopSubtitle,
    metrics,
    scoreTitle,
    renderDetails,
}: SmallBodyRowProps) {
    const visibilityText = (
        <>
            {body.statusLabel} {body.hoursVisible > 0 && `(${body.hoursVisible.toFixed(1)}h)`}
        </>
    );

    return (
        <div className="row-container col-span-full grid grid-cols-1 overflow-hidden rounded-xl border border-mp-glass-border bg-mp-glass-bg transition-all duration-slow md:grid-cols-subgrid">
            <button
                type="button"
                onClick={onToggle}
                className="col-span-full grid w-full grid-cols-1 items-center gap-4 border-0 bg-transparent px-4 py-3.5 text-left transition-colors hover:bg-mp-glass-solid/40 md:grid-cols-subgrid md:px-6 md:py-4"
            >
                {/* Rendu mobile (< md) : Ligne 1 (Nom + Chevron), Ligne 2 (Type + Visibilité + Faisabilité + Score) */}
                <div className="flex w-full flex-col gap-1.5 text-left md:hidden">
                    <div className="flex w-full items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                            <h3 className="truncate font-serif text-base font-light text-mp-text-heading transition-colors group-hover:text-mp-accent">
                                {body.name}
                            </h3>
                            <span className="shrink-0 font-sans text-xs text-mp-accent">({body.id})</span>
                        </div>
                        <div className="shrink-0 text-mp-text-muted">
                            {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                        {typeBadge}
                        <span className={`font-mono text-xs ${body.statusColor}`}>{visibilityText}</span>
                        <span
                            className={`inline-block cursor-help rounded-sm border px-2 py-0.5 text-[11px] ${body.feasibility.color}`}
                            title={feasibilityTitle(body.feasibility.status)}
                        >
                            {body.feasibility.label}
                        </span>
                        <span
                            className="inline-flex cursor-help items-center justify-start gap-1 rounded-full border border-mp-accent/20 bg-mp-accent/10 px-2 py-0.5 font-mono text-xs font-bold text-mp-accent"
                            title={scoreTitle}
                        >
                            <Sparkles className="h-3 w-3 text-mp-accent" />
                            {body.score}
                        </span>
                    </div>
                </div>

                {/* Rendu desktop (>= md) */}
                <div className="space-y-1 hidden min-w-0 text-left md:block">
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-serif text-base font-light text-mp-text-heading transition-colors group-hover:text-mp-accent">
                            {body.name}
                        </h3>
                        <span className={desktopIdClassName}>({body.id})</span>
                    </div>
                    <div className="text-xs text-mp-text-muted">{desktopSubtitle}</div>
                </div>

                <div className="hidden text-left whitespace-nowrap md:block">
                    <div className="mt-0.5">{typeBadge}</div>
                </div>

                {metrics.map((metric, index) => (
                    // POURQUOI : trois cellules fixes et ordonnées, l'index est une clé stable.
                    <div
                        key={index}
                        className="hidden text-right font-sans text-xs whitespace-nowrap text-mp-text-muted md:block"
                    >
                        {metric}
                    </div>
                ))}

                <div className="hidden text-left whitespace-nowrap md:block">
                    <div className={`mt-0.5 font-mono text-xs ${body.statusColor}`}>{visibilityText}</div>
                </div>

                <div
                    className="hidden cursor-help text-left whitespace-nowrap md:block"
                    title={feasibilityTitle(body.feasibility.status)}
                >
                    <span
                        className={`inline-block rounded-sm border px-2 py-0.5 text-[11px] ${body.feasibility.color}`}
                    >
                        {body.feasibility.label}
                    </span>
                </div>

                <div className="hidden text-right whitespace-nowrap md:block" title={scoreTitle}>
                    <span className="inline-flex cursor-help items-center justify-end gap-1 rounded-full border border-mp-accent/20 bg-mp-accent/10 px-2 py-0.5 font-mono text-xs font-bold text-mp-accent">
                        <Sparkles className="h-3 w-3 text-mp-accent" />
                        {body.score}
                    </span>
                </div>

                <div className="hidden items-center justify-end text-right md:flex">
                    {isExpanded ? (
                        <ChevronUp className="h-5 w-5 text-mp-text-muted" />
                    ) : (
                        <ChevronDown className="h-5 w-5 text-mp-text-muted" />
                    )}
                </div>
            </button>

            {isExpanded && renderDetails()}
        </div>
    );
}
