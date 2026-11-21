/**
 * Ligne de la liste des exoplanètes
 *
 * Responsabilité : rendre le bouton de ligne (vue mobile empilée, vue desktop en sous-grille) qui
 * déplie ou replie la fiche, puis le panneau de détail quand la ligne est dépliée.
 */

import { memo } from 'react';
import { ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { getConstellationName } from '@/lib/constellations';
import { formatTimeInLocation, type ObsLocation } from '@/lib/objects/observation';
import { nextTransitLabel, type AnalysedExoplanet } from '@/lib/objects/exoplanets';
import { DiscoveryStatusBadge, FeasibilityBadge } from './ExoplanetBadges';
import ExoplanetDetailPanel from './ExoplanetDetailPanel';

interface ExoplanetRowProps {
    planet: AnalysedExoplanet;
    isExpanded: boolean;
    onToggle: (planetId: string) => void;
    aperture: number;
    location: ObsLocation;
    date: Date;
    tzLabel: string;
    formattedDate: string;
}

/**
 * Chevron d'état déplié / replié.
 *
 * @param props - État et classes de l'icône.
 * @returns L'icône correspondante.
 */
function ExpandChevron({ isExpanded, className }: { isExpanded: boolean; className: string }) {
    return isExpanded ? <ChevronUp className={className} /> : <ChevronDown className={className} />;
}

/**
 * Ligne d'une exoplanète, avec sa fiche dépliable.
 *
 * @param props - Exoplanète analysée, état de dépliage, callback et contexte d'observation.
 * @returns La ligne de la sous-grille.
 */
function ExoplanetRow({
    planet: p,
    isExpanded,
    onToggle,
    aperture,
    location,
    date,
    tzLabel,
    formattedDate,
}: ExoplanetRowProps) {
    const nextDateLabel = nextTransitLabel(p.nextTransit);

    return (
        <div className="row-container col-span-full grid grid-cols-1 overflow-hidden rounded-xl border border-mp-glass-border bg-mp-glass-bg transition-all duration-slow md:grid-cols-subgrid">
            {/* Ligne principale cliquable */}
            <button
                type="button"
                onClick={() => onToggle(p.id)}
                className="col-span-full grid w-full grid-cols-1 items-center gap-4 border-0 bg-transparent px-4 py-3.5 text-left transition-colors hover:bg-mp-glass-solid/40 md:grid-cols-subgrid md:px-6 md:py-4"
            >
                {/* Rendu mobile (< md) : Ligne 1 (Nom + Chevron), Ligne 2 (Type + Visibilité + Score) */}
                <div className="flex w-full flex-col gap-1.5 text-left md:hidden">
                    <div className="flex w-full items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                            <h3 className="truncate font-serif text-base font-light text-mp-text-heading transition-colors group-hover:text-mp-accent">
                                {p.name}
                            </h3>
                            <span className="shrink-0 font-sans text-xs text-mp-text-muted">
                                ({getConstellationName(p.constellation)})
                            </span>
                        </div>
                        <div className="shrink-0 text-mp-text-muted">
                            <ExpandChevron isExpanded={isExpanded} className="h-5 w-5" />
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                        <DiscoveryStatusBadge isCandidate={p.isCandidate} />
                        <FeasibilityBadge feasibility={p.feasibility} />
                        <span
                            className="inline-flex cursor-help items-center justify-start gap-1 rounded-full border border-mp-accent/20 bg-mp-accent/10 px-2 py-0.5 font-mono text-xs font-bold text-mp-accent"
                            title="Score (0-100) : Faisabilité instrumentale/nocturne x (SNR photométrique + Magnitude stellaire + Qualité de la fenêtre de transit)."
                        >
                            <Sparkles className="h-3 w-3 text-mp-accent" />
                            {p.score}
                        </span>
                    </div>
                </div>

                {/* Rendu desktop (>= md) */}
                <div className="space-y-1 hidden min-w-0 text-left md:block">
                    <h3 className="truncate font-serif text-base font-light text-mp-text-heading transition-colors group-hover:text-mp-accent">
                        {p.name}
                    </h3>
                    <div className="truncate text-xs text-mp-text-muted">
                        Constellation : {getConstellationName(p.constellation)} · Étoile : {p.starName}
                    </div>
                </div>

                <div className="hidden text-left whitespace-nowrap md:block">
                    <div className="mt-0.5">
                        <DiscoveryStatusBadge isCandidate={p.isCandidate} />
                    </div>
                </div>

                <div className="hidden text-right font-sans text-xs whitespace-nowrap text-mp-text-muted md:block">
                    {p.vMag.toFixed(2)}
                </div>

                <div className="hidden text-right font-sans text-xs whitespace-nowrap text-mp-text-muted md:block">
                    {p.depth.toFixed(2)} %
                </div>

                <div className="hidden text-left whitespace-nowrap md:block">
                    {p.transit ? (
                        <div className="space-y-0.5 text-left">
                            <div className="font-mono text-xs font-medium text-mp-accent">
                                {formatTimeInLocation(p.transit.start, location)} –{' '}
                                {formatTimeInLocation(p.transit.end, location)}
                            </div>
                            <div className="text-[10px] text-mp-text-muted">{nextDateLabel}</div>
                        </div>
                    ) : (
                        <span className="text-xs text-mp-text-muted">{nextDateLabel}</span>
                    )}
                </div>

                <div className="hidden text-left whitespace-nowrap md:block">
                    <FeasibilityBadge feasibility={p.feasibility} />
                </div>

                <div
                    className="hidden text-right whitespace-nowrap md:block"
                    title="Score (0-100) : Faisabilité instrumentale/nocturne x (SNR photométrique + Magnitude stellaire + Qualité de la fenêtre de transit). Score 0 si pas de transit."
                >
                    <span className="inline-flex cursor-help items-center justify-end gap-1 rounded-full border border-mp-accent/20 bg-mp-accent/10 px-2 py-0.5 font-mono text-xs font-bold text-mp-accent">
                        <Sparkles className="h-3 w-3 text-mp-accent" />
                        {p.score}
                    </span>
                </div>

                <div className="hidden items-center justify-end text-right md:flex">
                    <ExpandChevron isExpanded={isExpanded} className="h-5 w-5 text-mp-text-muted" />
                </div>
            </button>

            {/* Section détaillée expansée */}
            {isExpanded && (
                <ExoplanetDetailPanel
                    planet={p}
                    aperture={aperture}
                    location={location}
                    date={date}
                    tzLabel={tzLabel}
                    formattedDate={formattedDate}
                />
            )}
        </div>
    );
}

export default memo(ExoplanetRow);
