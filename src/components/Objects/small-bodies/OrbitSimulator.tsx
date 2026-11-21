/**
 * Simulateur orbital SVG commun aux comètes et aux astéroïdes
 *
 * Responsabilité : vue héliocentrique écliptique zoomable (Soleil, orbites et positions
 * des planètes, orbite et position de l'objet). La largeur du SVG suit celle du conteneur
 * (ResizeObserver) ; la hauteur est fixe (300 px), ce qui évite tout décalage de mise en page.
 * Les éléments propres à un type d'objet (queue de comète, dégradés) sont injectés par
 * `renderBodyDecoration` et `extraDefs`.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { julianDate } from '@/lib/astro/time';
import {
    J2000_JULIAN_DAY,
    planetHeliocentricPosition,
    planetOrbitEllipse,
    toSvgPathData,
    type EclipticPoint,
    type PlanetElements,
    type SmallBodyPosition,
} from '@/lib/objects/orbits';

/** Point en pixels SVG. */
export interface SvgPoint {
    cx: number;
    cy: number;
}

const SVG_HEIGHT = 300;
const DEFAULT_SVG_WIDTH = 480;

const ZOOM_BUTTON_CLASS =
    'flex h-7 w-7 items-center justify-center rounded-md border border-mp-glass-border bg-mp-ui-black/60 text-mp-text-muted backdrop-blur-xs transition-colors hover:bg-mp-ui-black/80 hover:text-mp-text-primary';

interface OrbitSimulatorProps {
    /** Points de l'orbite de l'objet (UA, héliocentriques écliptiques). */
    orbitPoints: readonly EclipticPoint[];
    /** Demi-champ automatique (UA), avant zoom manuel. */
    autoFieldAu: number;
    /** Position courante de l'objet et de la Terre. */
    orbit: Pick<SmallBodyPosition, 'x_hel' | 'y_hel' | 'x_earth' | 'y_earth'>;
    date: Date;
    /** Planètes représentées (la Terre reprend la position fournie par `orbit`). */
    planets: readonly PlanetElements[];
    /** Étiquette de l'objet (« Comète », « Astéroïde »). */
    bodyLabel: string;
    /** Rayon du point représentant l'objet (attribut SVG `r`). */
    bodyRadius: string;
    /** Décor dessiné entre l'orbite et le noyau (ex. queue de comète). */
    renderBodyDecoration?: (bodyPosition: SvgPoint) => ReactNode;
    /** Définitions SVG supplémentaires (dégradés), après le clipPath du cadre. */
    extraDefs?: ReactNode;
}

/**
 * Simulateur de trajectoire orbitale en SVG.
 *
 * @param props - Orbite, position, date, planètes et habillage propre au type d'objet.
 * @returns La carte du simulateur avec ses boutons de zoom et sa légende d'échelle.
 */
export default function OrbitSimulator({
    orbitPoints,
    autoFieldAu,
    orbit,
    date,
    planets,
    bodyLabel,
    bodyRadius,
    renderBodyDecoration,
    extraDefs,
}: OrbitSimulatorProps) {
    // zoomFactor < 1 → zoom in (vue plus resserrée), > 1 → zoom out (vue plus large)
    const [zoomFactor, setZoomFactor] = useState(1.0);
    const handleZoomIn = useCallback(() => setZoomFactor((f) => Math.max(0.1, f / 1.5)), []);
    const handleZoomOut = useCallback(() => setZoomFactor((f) => Math.min(10, f * 1.5)), []);
    const handleZoomReset = useCallback(() => setZoomFactor(1.0), []);
    const R_max = autoFieldAu * zoomFactor;

    // Largeur du SVG mesurée dynamiquement pour remplir le container card
    const wrapperRef = useRef<HTMLDivElement>(null);
    const [svgW, setSvgW] = useState(DEFAULT_SVG_WIDTH);
    const svgH = SVG_HEIGHT;

    useEffect(() => {
        const el = wrapperRef.current;
        if (!el) return;
        const obs = new ResizeObserver((entries) => {
            const w = entries[0].contentRect.width;
            if (w > 0) setSvgW(Math.floor(w));
        });
        obs.observe(el);
        // Mesure initiale immédiate
        setSvgW(Math.floor(el.getBoundingClientRect().width) || DEFAULT_SVG_WIDTH);
        return () => obs.disconnect();
    }, []);

    const cx = svgW / 2; // x-centre (Soleil)
    const cy = svgH / 2; // y-centre (Soleil)
    const scale = (svgH - 40) / (2 * R_max); // pixels par UA (basé sur la hauteur)

    const toSvg = useCallback(
        (x: number, y: number): SvgPoint => ({
            cx: cx + x * scale,
            cy: cy - y * scale, // y inversé pour repère SVG standard
        }),
        [scale, cx, cy],
    );

    // Calcul des positions des planètes du système solaire pour la date choisie
    const tDays = useMemo(() => julianDate(date) - J2000_JULIAN_DAY, [date]);

    const planetPositions = useMemo(() => {
        return planets
            .map((p) => {
                // POURQUOI : la Terre reprend la position du Soleil utilisée pour l'objet, cohérente avec son orbite.
                const { x, y } =
                    p.abbr === 'earth' ? { x: orbit.x_earth, y: orbit.y_earth } : planetHeliocentricPosition(p, tDays);
                return { name: p.name, abbr: p.abbr, a: p.a, color: p.color, pos: toSvg(x, y) };
            })
            .filter((p) => p.a <= R_max * 1.05); // N'affiche que les planètes dans le champ de vision actuel
    }, [planets, tDays, orbit.x_earth, orbit.y_earth, R_max, toSvg]);

    // Tracé des ellipses orbitales des planètes visibles
    const planetOrbits = useMemo(() => {
        return planets
            .filter((p) => p.a <= R_max * 1.15)
            .map((p) => ({
                name: p.name,
                pathD: toSvgPathData(planetOrbitEllipse(p).map((pt) => toSvg(pt.x, pt.y))),
                color: p.color,
            }));
    }, [planets, R_max, toSvg]);

    const bodyPos = toSvg(orbit.x_hel, orbit.y_hel);

    const pathD = useMemo(() => toSvgPathData(orbitPoints.map((p) => toSvg(p.x, p.y))), [orbitPoints, toSvg]);

    return (
        <div className="relative space-y-4 flex flex-col items-center overflow-hidden rounded-xl border border-mp-glass-border bg-mp-ui-black/40 p-4">
            {/* Boutons zoom positionnés dans le coin supérieur droit du card */}
            <div className="absolute top-3 right-3 z-10 flex flex-col gap-1">
                <button type="button" onClick={handleZoomIn} title="Zoom avant" className={ZOOM_BUTTON_CLASS}>
                    <ZoomIn className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={handleZoomOut} title="Zoom arrière" className={ZOOM_BUTTON_CLASS}>
                    <ZoomOut className="h-3.5 w-3.5" />
                </button>
                {zoomFactor !== 1.0 && (
                    <button
                        type="button"
                        onClick={handleZoomReset}
                        title="Réinitialiser le zoom"
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-mp-glass-border bg-mp-ui-black/60 text-mp-accent backdrop-blur-xs transition-colors hover:bg-mp-ui-black/80 hover:text-mp-text-primary"
                    >
                        <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                )}
            </div>
            <div ref={wrapperRef} className="w-full overflow-hidden rounded-lg bg-mp-bg-secondary/20">
                {/* SVG pleine largeur — le système de coordonnées s'adapte dynamiquement */}
                <svg width={svgW} height={svgH} className="block overflow-hidden rounded-lg select-none">
                    {/* Orbites planétaires en arrière-plan */}
                    {planetOrbits.map((orb) => (
                        <path
                            key={orb.name}
                            d={orb.pathD}
                            fill="none"
                            stroke={orb.color}
                            strokeWidth="0.8"
                            strokeOpacity="0.15"
                            strokeDasharray="3 4"
                        />
                    ))}

                    {/* Soleil au centre */}
                    <circle cx={cx} cy={cy} r="6" fill="#D4B483" className="animate-pulse shadow-glow" />

                    {/* Positions des planètes */}
                    {planetPositions.map((p) => (
                        <g key={p.name}>
                            <circle cx={p.pos.cx} cy={p.pos.cy} r="3" fill={p.color} />
                            {/* Pour éviter les superpositions, on n'affiche les étiquettes de texte que pour les planètes telluriques,
                                ou si le zoom est suffisamment grand */}
                            {(p.a <= 1.6 || R_max > 4) && (
                                <text
                                    x={p.pos.cx + 6}
                                    y={p.pos.cy + 3}
                                    className="pointer-events-none fill-mp-text-muted font-sans text-[9px] font-medium"
                                >
                                    {p.name}
                                </text>
                            )}
                        </g>
                    ))}

                    {/* Orbite de l'objet — clipée proprement sur le viewport SVG */}
                    <path
                        d={pathD}
                        fill="none"
                        stroke="#D4B483"
                        strokeWidth="1.5"
                        strokeOpacity="0.45"
                        clipPath="url(#orbit-viewport)"
                    />

                    {renderBodyDecoration?.(bodyPos)}

                    {/* Noyau de l'objet */}
                    <circle cx={bodyPos.cx} cy={bodyPos.cy} r={bodyRadius} fill="#EBEBE6" className="shadow-glow" />
                    <circle
                        cx={bodyPos.cx}
                        cy={bodyPos.cy}
                        r="8"
                        fill="none"
                        stroke="#D4B483"
                        strokeWidth="1"
                        opacity="0.3"
                        className="animate-ping"
                        style={{ transformOrigin: `${bodyPos.cx}px ${bodyPos.cy}px` }}
                    />

                    <text
                        x={bodyPos.cx + 8}
                        y={bodyPos.cy + 4}
                        className="fill-mp-text-heading font-sans text-[10px] font-semibold"
                    >
                        {bodyLabel}
                    </text>

                    {/* Définitions des gradients + clipPath pour l'orbite */}
                    <defs>
                        <clipPath id="orbit-viewport">
                            <rect x="0" y="0" width={svgW} height={svgH} />
                        </clipPath>
                        {extraDefs}
                    </defs>
                </svg>
            </div>

            <div className="flex w-full justify-between border-t border-mp-glass-border/30 pt-3 font-sans text-[11px] text-mp-text-muted">
                <span>Échelle : 1 division = 1 UA</span>
                <span>
                    Champ : {R_max.toFixed(1)} UA{' '}
                    {zoomFactor !== 1.0 ? <span className="text-mp-accent">(zoom manuel)</span> : '(auto)'}
                </span>
            </div>
        </div>
    );
}
