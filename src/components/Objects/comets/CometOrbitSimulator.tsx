/**
 * Simulateur orbital d'une comète
 *
 * Responsabilité : préparer l'orbite (ellipse ou branche d'hyperbole), le champ automatique
 * et la queue orientée à l'opposé du Soleil, puis déléguer le rendu à `OrbitSimulator`
 * avec les huit planètes.
 */

import { useCallback, useMemo } from 'react';
import { COMET_SIMULATOR_PLANETS, cometOrbitPath, type SmallBodyPosition } from '@/lib/objects/orbits';
import OrbitSimulator, { type SvgPoint } from '../small-bodies/OrbitSimulator';
import type { Comet } from './cometConfig';

interface CometOrbitSimulatorProps {
    comet: Comet;
    orbit: SmallBodyPosition;
    date: Date;
}

/**
 * Simulateur de trajectoire orbitale d'une comète en SVG.
 *
 * @param props - Comète, position calculée et date.
 * @returns Le simulateur avec la queue de la comète.
 */
export default function CometOrbitSimulator({ comet, orbit, date }: CometOrbitSimulatorProps) {
    // Échelle d'affichage automatique basée sur le périhélie (q) de la comète.
    // On montre environ 3× la distance du périhélie pour avoir une vue bien remplie.
    // WARNING: ne pas baser sur orbit.r (distance courante) car si la comète est loin,
    // l'orbite au périhélie (la partie visible et intéressante) devient un minuscule arc.
    const autoFieldAu = useMemo(() => Math.max(1.5, Math.min(15.0, comet.q * 3.5)), [comet.q]);

    // Orbite complète de la comète. On trace toute la plage d'anomalie vraie accessible
    // et on laisse le <clipPath> SVG découper proprement hors du cadre.
    const orbitPoints = useMemo(() => cometOrbitPath(comet), [comet]);

    const renderTail = useCallback(
        (cometPos: SvgPoint) => {
            // Vecteur Soleil -> Comète pour la direction de la queue (la queue pointe à l'opposé du Soleil)
            const dx = orbit.x_hel;
            const dy = orbit.y_hel;
            const distSun = Math.sqrt(dx * dx + dy * dy);

            // Longueur et opacité de la queue dépendante de la distance au Soleil
            const tailLength = Math.max(5, Math.min(60, 40 / (distSun * distSun)));
            const tailOpacity = Math.max(0.0, Math.min(0.8, 1.2 / distSun - 0.2));

            const tailAngle = Math.atan2(-dy, dx); // Angle opposé au Soleil (y inversé)

            const tailEndX1 = cometPos.cx + Math.cos(tailAngle - 0.12) * tailLength;
            const tailEndY1 = cometPos.cy + Math.sin(tailAngle - 0.12) * tailLength;
            const tailEndX2 = cometPos.cx + Math.cos(tailAngle + 0.12) * tailLength;
            const tailEndY2 = cometPos.cy + Math.sin(tailAngle + 0.12) * tailLength;

            return (
                tailOpacity > 0 && (
                    <path
                        d={`M ${cometPos.cx} ${cometPos.cy} L ${tailEndX1} ${tailEndY1} L ${tailEndX2} ${tailEndY2} Z`}
                        fill="url(#comet-tail-grad)"
                        opacity={tailOpacity}
                    />
                )
            );
        },
        [orbit.x_hel, orbit.y_hel],
    );

    return (
        <OrbitSimulator
            orbitPoints={orbitPoints}
            autoFieldAu={autoFieldAu}
            orbit={orbit}
            date={date}
            planets={COMET_SIMULATOR_PLANETS}
            bodyLabel="Comète"
            bodyRadius="3"
            renderBodyDecoration={renderTail}
            extraDefs={
                <>
                    <radialGradient id="sun-glow" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#D4B483" stopOpacity="0.8" />
                        <stop offset="100%" stopColor="#D4B483" stopOpacity="0" />
                    </radialGradient>
                    <linearGradient id="comet-tail-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#EBEBE6" stopOpacity="0.8" />
                        <stop offset="40%" stopColor="#D4B483" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="#D4B483" stopOpacity="0" />
                    </linearGradient>
                </>
            }
        />
    );
}
