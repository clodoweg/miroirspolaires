/**
 * @file VariabilitySimulator.tsx
 * @description Simulateur interactif de variabilité d'une étoile (modèle physique + courbe de lumière).
 *
 * Responsabilité : initialiser la phase sur la phase réelle à la date choisie, la laisser piloter
 * par un curseur, et afficher l'illustration physique, la courbe de lumière théorique, la magnitude
 * simulée et l'horodatage correspondant à la phase.
 */

import { useEffect, useId, useMemo, useState } from 'react';
import { formatDateInLocation, formatTimeInLocation, type ObsLocation } from '@/lib/objects/observation';
import {
    getDateAtPhase,
    getLightCurvePoints,
    getMagnitudeAtPhase,
    getRealTimePhase,
    magnitudeToCurveY,
    type VariableStar,
} from '@/lib/objects/variable-stars';
import VariabilityVisualModel from './VariabilityVisualModel';

interface VariabilitySimulatorProps {
    star: VariableStar;
    date: Date;
    location: ObsLocation;
}

/**
 * Composant de simulation dynamique gérant les rendus SVG adaptés à chaque type de variabilité.
 *
 * @param props - Étoile simulée, date sélectionnée et lieu (fuseau de l'horodatage).
 * @returns Le bloc du simulateur.
 */
export default function VariabilitySimulator({ star, date, location }: VariabilitySimulatorProps) {
    const phaseInputId = useId();
    const realTimePhase = useMemo(() => getRealTimePhase(star, date), [date, star]);

    const [phase, setPhase] = useState(realTimePhase);

    useEffect(() => {
        setPhase(realTimePhase);
    }, [realTimePhase]);

    // Date et heure de la phase courante, ancrées sur le début du cycle en cours à la date sélectionnée.
    const timeAtPhase = useMemo(() => getDateAtPhase(star, date, phase), [phase, date, star]);
    const currentMag = useMemo(() => getMagnitudeAtPhase(star, phase), [phase, star]);
    const curvePoints = useMemo(() => getLightCurvePoints(star), [star]);
    const cursorY = useMemo(() => magnitudeToCurveY(currentMag, star.vMagMin, star.vMagMax), [currentMag, star]);

    return (
        <div className="space-y-4 rounded-lg border border-mp-glass-border bg-mp-ui-black/40 p-4">
            {/* Visualisation Physique animée */}
            <div className="relative flex h-28 items-center justify-center overflow-hidden rounded-lg border border-mp-glass-border bg-mp-bg-secondary">
                <span className="absolute top-2 left-2 font-sans text-[10px] font-medium tracking-wide text-mp-text-muted uppercase">
                    Modèle de variabilité physique
                </span>

                <VariabilityVisualModel type={star.type} phase={phase} />
            </div>

            {/* Tracé de la courbe de lumière */}
            <div className="space-y-1">
                <span className="block font-sans text-[10px] font-medium tracking-wide text-mp-text-muted uppercase">
                    Courbe de lumière théorique (Magnitude V)
                </span>
                <div className="flex h-20 items-center justify-center rounded-lg border border-mp-glass-border bg-mp-bg-secondary/70 p-2">
                    <svg className="h-full w-full overflow-visible" viewBox="0 0 280 60">
                        {/* Lignes de référence (mag min et mag max) */}
                        <line x1="20" y1="10" x2="260" y2="10" stroke="rgba(255,255,255,0.06)" strokeDasharray="2" />
                        <line x1="20" y1="45" x2="260" y2="45" stroke="rgba(255,255,255,0.06)" strokeDasharray="2" />

                        {/* Courbe photométrique */}
                        <polyline fill="none" stroke="#D4B483" strokeWidth="1.5" points={curvePoints} />

                        {/* Réticule de phase courante */}
                        <circle
                            cx={20 + (phase / 100) * 240}
                            cy={cursorY}
                            r="4"
                            fill="#D4B483"
                            className="animate-pulse"
                        />
                    </svg>
                </div>
                <div className="flex justify-between px-1 font-mono text-xs text-mp-text-muted">
                    <span>Brillant : {star.vMagMin.toFixed(1)}V</span>
                    <span className="font-semibold text-mp-accent">Éclat actuel : {currentMag.toFixed(2)} V</span>
                    <span>Faible : {star.vMagMax.toFixed(1)}V</span>
                </div>
            </div>

            {/* Range slider de phase */}
            <div className="space-y-1 block">
                <div className="flex justify-between text-[11px] text-mp-text-muted uppercase">
                    <label htmlFor={phaseInputId}>Avancement du cycle</label>
                    <span className="font-mono">
                        {star.type === 'cataclysmique'
                            ? phase >= 73 && phase <= 95
                                ? '💥 ÉRUPTION / OUTBURST'
                                : 'Repos'
                            : `Phase ${phase}%`}
                    </span>
                </div>
                <input
                    id={phaseInputId}
                    type="range"
                    min="0"
                    max="100"
                    value={phase}
                    onChange={(e) => setPhase(Number(e.target.value))}
                    className="h-1 w-full cursor-pointer appearance-none rounded-lg bg-mp-glass-border accent-mp-accent"
                />
            </div>

            {/* Horodatage simulé (sous le slider) */}
            <div className="pt-1 text-center">
                <span className="inline-block rounded-sm border border-mp-accent/30 bg-mp-ui-black/60 px-2.5 py-1 font-mono text-[11px] font-medium text-mp-accent">
                    {formatDateInLocation(timeAtPhase, location)} à {formatTimeInLocation(timeAtPhase, location, true)}
                </span>
            </div>
        </div>
    );
}
