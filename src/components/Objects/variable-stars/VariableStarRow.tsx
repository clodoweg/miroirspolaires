/**
 * @file VariableStarRow.tsx
 * @description Ligne dépliable d'une étoile variable dans la grille de résultats.
 *
 * Responsabilité : afficher le résumé de la cible (rendu compact mobile et colonnes desktop),
 * basculer son dépliage et monter le panneau de détail quand elle est ouverte.
 */

import { Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { getConstellationName } from '@/lib/constellations';
import {
    formatVariableStarPeriod,
    getFeasibilityTooltip,
    getVariableTypeBadgeColor,
    getVariableTypeShortLabel,
    getVariableTypeTooltip,
    type AnalysedVariableStar,
    type VariableStarType,
} from '@/lib/objects/variable-stars';
import VariableStarDetail, { type VariableStarDetailContext } from './VariableStarDetail';

const SCORE_TOOLTIP =
    "Score (0-100) : Faisabilité instrumentale x (Visibilité nocturne + Amplitude de variabilité d'éclat + Magnitude maximale au pic).";

/** Badge coloré du type de variabilité, avec infobulle explicative. */
function TypeBadge({ type }: { type: VariableStarType }) {
    return (
        <span
            className={`cursor-help rounded-sm border px-1.5 py-0.5 font-sans text-[9px] font-medium tracking-wider uppercase select-none ${getVariableTypeBadgeColor(type)}`}
            title={getVariableTypeTooltip(type)}
        >
            {getVariableTypeShortLabel(type)}
        </span>
    );
}

/** Statut de visibilité nocturne suivi de la durée exploitable. */
function VisibilityStatusText({ star }: { star: AnalysedVariableStar }) {
    return (
        <>
            {star.statusLabel} {star.hoursVisible > 0 && `(${star.hoursVisible.toFixed(1)}h)`}
        </>
    );
}

interface VariableStarRowProps extends VariableStarDetailContext {
    star: AnalysedVariableStar;
    isExpanded: boolean;
    onToggle: () => void;
}

/**
 * Ligne de résultat d'une étoile variable.
 *
 * @param props - Étoile analysée, état de dépliage et contexte d'observation transmis au détail.
 * @returns La ligne (bouton de résumé + détail éventuel).
 */
export default function VariableStarRow({ star: s, isExpanded, onToggle, ...detailContext }: VariableStarRowProps) {
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
                                {s.name}
                            </h3>
                            <span className="shrink-0 font-sans text-xs text-mp-accent">
                                ({getConstellationName(s.constellation)})
                            </span>
                        </div>
                        <div className="shrink-0 text-mp-text-muted">
                            {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                        <TypeBadge type={s.type} />
                        <span className={`font-mono text-xs ${s.statusColor}`}>
                            <VisibilityStatusText star={s} />
                        </span>
                        <span
                            className={`inline-block cursor-help rounded-sm border px-2 py-0.5 text-[11px] ${s.feasibility.color}`}
                            title={getFeasibilityTooltip(s.feasibility.status)}
                        >
                            {s.feasibility.label}
                        </span>
                        <span
                            className="inline-flex cursor-help items-center justify-start gap-1 rounded-full border border-mp-accent/20 bg-mp-accent/10 px-2 py-0.5 font-mono text-xs font-bold text-mp-accent"
                            title={SCORE_TOOLTIP}
                        >
                            <Sparkles className="h-3 w-3 text-mp-accent" />
                            {s.score}
                        </span>
                    </div>
                </div>

                {/* Rendu desktop (>= md) */}
                <div className="space-y-1 hidden min-w-0 text-left md:block">
                    <h3 className="truncate font-serif text-base font-light text-mp-text-heading transition-colors group-hover:text-mp-accent">
                        {s.name}
                    </h3>
                    <div className="truncate text-xs text-mp-text-muted">
                        Constellation : {getConstellationName(s.constellation)}
                    </div>
                </div>

                <div className="hidden text-left whitespace-nowrap md:block">
                    <div className="mt-0.5">
                        <TypeBadge type={s.type} />
                    </div>
                </div>

                <div className="hidden text-right font-sans text-xs whitespace-nowrap text-mp-text-muted md:block">
                    {s.vMagMin.toFixed(1)} - {s.vMagMax.toFixed(1)}
                </div>

                <div className="hidden text-right font-sans text-xs whitespace-nowrap text-mp-text-muted md:block">
                    {formatVariableStarPeriod(s.period)}
                </div>

                <div className="hidden text-left whitespace-nowrap md:block">
                    <div className={`mt-0.5 font-mono text-xs ${s.statusColor}`}>
                        <VisibilityStatusText star={s} />
                    </div>
                </div>

                <div
                    className="hidden cursor-help text-left whitespace-nowrap md:block"
                    title={getFeasibilityTooltip(s.feasibility.status)}
                >
                    <span className={`inline-block rounded-sm border px-2 py-0.5 text-[11px] ${s.feasibility.color}`}>
                        {s.feasibility.label}
                    </span>
                </div>

                <div className="hidden text-right whitespace-nowrap md:block" title={SCORE_TOOLTIP}>
                    <span className="inline-flex cursor-help items-center justify-end gap-1 rounded-full border border-mp-accent/20 bg-mp-accent/10 px-2 py-0.5 font-mono text-xs font-bold text-mp-accent">
                        <Sparkles className="h-3 w-3 text-mp-accent" />
                        {s.score}
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

            {/* Contenu détaillé déroulant */}
            {isExpanded && <VariableStarDetail star={s} {...detailContext} />}
        </div>
    );
}
