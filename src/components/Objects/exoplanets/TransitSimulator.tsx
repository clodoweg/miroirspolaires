/**
 * Simulateur interactif d'un transit d'exoplanète
 *
 * Responsabilité : animer en SVG le passage de la planète devant son étoile, tracer la courbe de
 * lumière trapézoïdale et afficher l'instant simulé selon la position du curseur de phase.
 * Les calculs (flux, abscisses, instant simulé, libellé de phase) sont dans
 * `src/lib/objects/exoplanets.ts`.
 */

import { useId, useMemo, useState } from 'react';
import { formatDateInLocation, formatTimeInLocation, type ObsLocation } from '@/lib/objects/observation';
import {
    lightCurvePoints,
    lightCurveY,
    planetStarRadiusRatio,
    simulatedTimeAtProgress,
    simulatorX,
    transitFluxPercent,
    transitPhaseLabel,
    type Exoplanet,
    type NextTransit,
    type TransitOccurrence,
} from '@/lib/objects/exoplanets';

/** Rayon SVG du disque stellaire (px du repère). */
const STAR_SVG_RADIUS = 45;

interface TransitSimulatorProps {
    planet: Exoplanet;
    transit: TransitOccurrence | NextTransit;
    location: ObsLocation;
}

/**
 * Simulation animée en SVG et tracé de la courbe de lumière.
 *
 * @param props - Planète, transit simulé (de la nuit ou prochain) et site de l'observateur.
 * @returns Le bloc simulateur.
 */
export default function TransitSimulator({ planet, transit, location }: TransitSimulatorProps) {
    const [progress, setProgress] = useState(50); // 0 à 100
    const phaseInputId = useId();

    const timeAtProgress = useMemo(
        () => simulatedTimeAtProgress(transit.start, transit.end, progress),
        [progress, transit],
    );

    const ratio = planetStarRadiusRatio(planet.radius, planet.starRadius);
    // POURQUOI : on borne le rayon de la planète pour qu'il reste visible (entre 2 et 20 px).
    const planetSvgRadius = Math.max(2, Math.min(20, STAR_SVG_RADIUS * ratio));

    const currentFlux = useMemo(() => transitFluxPercent(progress, planet.depth), [progress, planet.depth]);
    const planetX = simulatorX(progress);
    const curvePoints = useMemo(() => lightCurvePoints(planet.depth), [planet.depth]);

    return (
        <div className="space-y-4 rounded-lg border border-mp-glass-border bg-mp-ui-black/40 p-4">
            {/* Animation Visuelle du Transit */}
            <div className="relative flex h-28 items-center justify-center overflow-hidden rounded-lg border border-mp-glass-border bg-mp-bg-secondary">
                <span className="absolute top-2 left-2 font-sans text-[10px] font-medium tracking-wide text-mp-text-muted uppercase">
                    Rapport de taille ≈ {(ratio * 100).toFixed(1)}%
                </span>

                <svg className="h-full w-full" viewBox="0 0 280 110">
                    <defs>
                        {/* Dégradé pour le disque stellaire */}
                        <radialGradient id="starGradient" cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stopColor="#FFF2D4" />
                            <stop offset="70%" stopColor="#F5B83D" />
                            <stop offset="100%" stopColor="#E2950A" />
                        </radialGradient>
                    </defs>

                    {/* L'Étoile Hôte */}
                    <circle cx="140" cy="55" r={STAR_SVG_RADIUS} fill="url(#starGradient)" className="shadow-hero" />

                    {/* L'Exoplanète */}
                    <circle
                        cx={planetX}
                        cy="55"
                        r={planetSvgRadius}
                        fill="#090909"
                        stroke="#E2950A"
                        strokeWidth="0.5"
                    />
                </svg>
            </div>

            {/* Tracé de la Courbe de Lumière */}
            <div className="space-y-1">
                <span className="block font-sans text-[10px] font-medium tracking-wide text-mp-text-muted uppercase">
                    Courbe de flux relatif (Luminosité de l'étoile)
                </span>
                <div className="flex h-20 items-center justify-center rounded-lg border border-mp-glass-border bg-mp-bg-secondary/70 p-2">
                    <svg className="h-full w-full overflow-visible" viewBox="0 0 280 60">
                        {/* Ligne de référence à 100% */}
                        <line x1="20" y1="10" x2="260" y2="10" stroke="rgba(255,255,255,0.1)" strokeDasharray="3" />

                        {/* Courbe de transit */}
                        <polyline fill="none" stroke="#D4B483" strokeWidth="1.5" points={curvePoints} />

                        {/* Réticule du flux courant */}
                        <circle
                            cx={planetX}
                            cy={lightCurveY(currentFlux, planet.depth)}
                            r="4"
                            fill="#D4B483"
                            className="animate-pulse"
                        />
                    </svg>
                </div>
                <div className="flex justify-between px-1 font-mono text-xs text-mp-text-muted">
                    <span>Flux : 100%</span>
                    <span className="font-semibold text-mp-accent">Flux actuel : {currentFlux.toFixed(3)}%</span>
                </div>
            </div>

            {/* Curseur de contrôle de la phase */}
            <div className="space-y-1 block">
                <div className="flex justify-between text-[11px] text-mp-text-muted uppercase">
                    <label htmlFor={phaseInputId}>Phase de transit</label>
                    <span className="font-mono">{transitPhaseLabel(progress)}</span>
                </div>
                <input
                    id={phaseInputId}
                    type="range"
                    min="0"
                    max="100"
                    value={progress}
                    onChange={(e) => setProgress(Number(e.target.value))}
                    className="h-1 w-full cursor-pointer appearance-none rounded-lg bg-mp-glass-border accent-mp-accent"
                />
            </div>

            {/* Horodatage simulé (sous le slider) */}
            <div className="pt-1 text-center">
                <span className="inline-block rounded-sm border border-mp-accent/30 bg-mp-ui-black/60 px-2.5 py-1 font-mono text-[11px] font-medium text-mp-accent">
                    {formatDateInLocation(timeAtProgress, location)} à{' '}
                    {formatTimeInLocation(timeAtProgress, location, true)}
                </span>
            </div>
        </div>
    );
}
