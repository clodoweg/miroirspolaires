/**
 * @file VariabilityVisualModel.tsx
 * @description Illustrations SVG animées des mécanismes physiques de variabilité, pilotées par la phase.
 *
 * Responsabilité : dessiner, pour une phase donnée, la binaire à éclipses, l'étoile pulsante
 * (Céphéide / Mira), la nova naine avec son disque d'accrétion ou la supergéante semi-régulière.
 * POURQUOI : couleurs en dur dans les dégradés SVG, car elles figurent des températures
 * stellaires et non des éléments de l'interface (indépendantes du thème).
 */

import type { VariableStarType } from '@/lib/objects/variable-stars';

interface ModelProps {
    phase: number;
}

/** Binaire à éclipses : deux corps en rotation autour du barycentre. */
function EclipsingBinaryModel({ phase }: ModelProps) {
    // On calcule les positions X orbitales projetées.
    const angle = (phase / 100) * 2 * Math.PI;
    // Étoile primaire (bleue, chaude, centre environ 140, oscille de -45px à +45px)
    const star1X = 140 + Math.cos(angle) * 45;
    // Étoile secondaire (jaune/orange, plus grande mais moins chaude, oscille en opposition de phase)
    const star2X = 140 - Math.cos(angle) * 45;

    // Ordre de tracé (Z-index simulé) selon la position de l'orbite (Y projeté)
    const isStar1InFront = Math.sin(angle) > 0;

    return (
        <svg className="h-full w-full" viewBox="0 0 280 110">
            <defs>
                <radialGradient id="blueStar" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#E0F2FE" />
                    <stop offset="60%" stopColor="#38BDF8" />
                    <stop offset="100%" stopColor="#0369A1" />
                </radialGradient>
                <radialGradient id="orangeStar" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#FEF3C7" />
                    <stop offset="60%" stopColor="#F59E0B" />
                    <stop offset="100%" stopColor="#B45309" />
                </radialGradient>
            </defs>

            {/* Orbite en pointillé */}
            <ellipse cx="140" cy="55" rx="45" ry="8" fill="none" stroke="rgba(255,255,255,0.08)" strokeDasharray="3" />

            {/* Tracé ordonné des étoiles */}
            {!isStar1InFront ? (
                <>
                    {/* Étoile 2 (secondaire, grande, orange, rayon 18) en arrière-plan */}
                    <circle cx={star2X} cy="55" r="18" fill="url(#orangeStar)" />
                    {/* Étoile 1 (primaire, petite, bleue, rayon 12) au premier plan */}
                    <circle cx={star1X} cy="55" r="12" fill="url(#blueStar)" className="shadow-lg" />
                </>
            ) : (
                <>
                    {/* Étoile 1 (primaire, bleue, rayon 12) en arrière-plan */}
                    <circle cx={star1X} cy="55" r="12" fill="url(#blueStar)" />
                    {/* Étoile 2 (secondaire, grande, orange, rayon 18) au premier plan */}
                    <circle cx={star2X} cy="55" r="18" fill="url(#orangeStar)" className="shadow-lg" />
                </>
            )}
        </svg>
    );
}

/** Pulsation radiale et thermique : le rayon et la couleur varient avec la phase. */
function PulsatingStarModel({ phase, type }: ModelProps & { type: 'cepheid' | 'mira' }) {
    const minRad = type === 'cepheid' ? 14 : 10;
    const maxRad = type === 'cepheid' ? 26 : 32;

    // Calcul de la pulsation asymétrique
    const angle = (phase / 100) * 2 * Math.PI;
    const synth = Math.sin(angle - 0.5 * Math.sin(angle)); // varie de -1 à +1
    const r = minRad + (maxRad - minRad) * (1 - (synth + 1) / 2); // Grand rayon au maximum d'éclat

    // Changement thermique de couleur : du jaune-blanc (chaud, maximum d'éclat) au rouge-orange (froid, minimum)
    const redStop = type === 'mira' ? '#991B1B' : '#EA580C';
    const yellowStop = type === 'cepheid' ? '#FEF08A' : '#FBBF24';
    const mixColor = (synth + 1) / 2; // 0 = max chaud, 1 = min froid

    return (
        <svg className="h-full w-full" viewBox="0 0 280 110">
            <defs>
                <radialGradient id="pulsingStarGrad" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#FFFFFF" />
                    <stop offset="50%" stopColor={mixColor > 0.5 ? '#F97316' : yellowStop} />
                    <stop offset="100%" stopColor={mixColor > 0.7 ? redStop : '#C2410C'} />
                </radialGradient>
            </defs>
            {/* Étoile centrale pulsante */}
            <circle cx="140" cy="55" r={r} fill="url(#pulsingStarGrad)" className="transition-all duration-75" />
            {/* Traits de rayonnement/pulsation */}
            {mixColor < 0.3 && (
                <g stroke="#FEF08A" strokeWidth="1" opacity={0.6} className="animate-pulse">
                    <line x1="140" y1="15" x2="140" y2="25" />
                    <line x1="140" y1="85" x2="140" y2="95" />
                    <line x1="100" y1="55" x2="110" y2="55" />
                    <line x1="170" y1="55" x2="180" y2="55" />
                </g>
            )}
        </svg>
    );
}

/** Nova naine : étoile rouge donneuse, flux de gaz et naine blanche avec disque d'accrétion. */
function DwarfNovaModel({ phase }: ModelProps) {
    // Le disque s'illumine lors de l'outburst (phases 73 à 95)
    const isOutburst = phase >= 73 && phase <= 95;
    const diskGlowOpacity = isOutburst ? Math.max(0.2, 1 - (phase - 75) / 20) : 0.1;
    const diskRadius = isOutburst ? 25 + 10 * Math.sin(((phase - 75) / 20) * Math.PI) : 15;

    return (
        <svg className="h-full w-full" viewBox="0 0 280 110">
            <defs>
                {/* Étoile rouge donatrice */}
                <radialGradient id="donorGrad" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#FCA5A5" />
                    <stop offset="70%" stopColor="#EF4444" />
                    <stop offset="100%" stopColor="#991B1B" />
                </radialGradient>
                {/* Naine blanche */}
                <radialGradient id="wdGrad" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#FFFFFF" />
                    <stop offset="100%" stopColor="#E0F2FE" />
                </radialGradient>
                {/* Disque d'accrétion normal */}
                <radialGradient id="diskGrad" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#38BDF8" stopOpacity={0.8} />
                    <stop offset="70%" stopColor="#1E3A8A" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#0F172A" stopOpacity={0} />
                </radialGradient>
                {/* Disque en sursaut (outburst) */}
                <radialGradient id="outburstGrad" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#FFFFFF" />
                    <stop offset="40%" stopColor="#67E8F9" />
                    <stop offset="80%" stopColor="#38BDF8" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="#0369A1" stopOpacity={0} />
                </radialGradient>
            </defs>

            {/* Étoile donatrice rouge déformée (lobe de Roche) */}
            <path d="M 60,55 C 60,35 85,35 95,55 C 85,75 60,75 60,55 Z" fill="url(#donorGrad)" />

            {/* Courant de transfert de matière */}
            <path
                d="M 92,55 Q 120,58 170,55"
                fill="none"
                stroke="#F87171"
                strokeWidth="1.5"
                strokeDasharray="3"
                className="animate-pulse"
            />

            {/* Disque d'accrétion */}
            <ellipse
                cx="180"
                cy="55"
                rx={diskRadius}
                ry={diskRadius / 3.5}
                fill={isOutburst ? 'url(#outburstGrad)' : 'url(#diskGrad)'}
            />

            {/* Halo d'outburst */}
            {isOutburst && (
                <circle
                    cx="180"
                    cy="55"
                    r={diskRadius * 1.5}
                    fill="#38BDF8"
                    opacity={diskGlowOpacity * 0.4}
                    filter="blur(4px)"
                />
            )}

            {/* Naine blanche centrale */}
            <circle cx="180" cy="55" r="2.5" fill="url(#wdGrad)" />
        </svg>
    );
}

/** Supergéante rouge avec cellules de convection dynamiques et irrégulières. */
function SemiRegularModel({ phase }: ModelProps) {
    const angle = (phase / 100) * 2 * Math.PI;
    const x1 = 140 + Math.sin(angle) * 8;
    const y1 = 55 + Math.cos(angle * 2) * 6;
    const x2 = 135 + Math.cos(angle + 1) * 10;
    const y2 = 60 + Math.sin(angle * 1.5) * 8;
    const x3 = 148 + Math.sin(angle * 0.8 + 2) * 6;
    const y3 = 50 + Math.cos(angle + 3) * 6;

    return (
        <svg className="h-full w-full" viewBox="0 0 280 110">
            <defs>
                <radialGradient id="baseSupergiant" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#EF4444" />
                    <stop offset="85%" stopColor="#991B1B" />
                    <stop offset="100%" stopColor="#7F1D1D" />
                </radialGradient>
            </defs>

            {/* Disque stellaire de base (supergéante rouge, grand rayon = 30) */}
            <circle cx="140" cy="55" r="30" fill="url(#baseSupergiant)" />

            {/* Cellules de convection géantes translucides */}
            <circle cx={x1} cy={y1} r="12" fill="#FBBF24" opacity={0.25} />
            <circle cx={x2} cy={y2} r="14" fill="#F97316" opacity={0.3} />
            <circle cx={x3} cy={y3} r="10" fill="#EF4444" opacity={0.4} />

            {/* Effet d'atmosphère turbulente autour du limbe */}
            <circle cx="140" cy="55" r="30.5" fill="none" stroke="#B91C1C" strokeWidth="0.8" opacity={0.5} />
        </svg>
    );
}

/**
 * Illustration physique du type de variabilité à la phase donnée.
 *
 * @param props - Type de variabilité et phase (0-100).
 * @returns Le SVG correspondant, ou `null` pour un type inconnu.
 */
export default function VariabilityVisualModel({ type, phase }: { type: VariableStarType; phase: number }) {
    if (type === 'eclipsing') return <EclipsingBinaryModel phase={phase} />;
    if (type === 'cepheid' || type === 'mira') return <PulsatingStarModel phase={phase} type={type} />;
    if (type === 'cataclysmique') return <DwarfNovaModel phase={phase} />;
    if (type === 'semiregular') return <SemiRegularModel phase={phase} />;
    return null;
}
