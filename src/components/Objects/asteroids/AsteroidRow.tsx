/**
 * Ligne du tableau des astéroïdes, son panneau de détail et son simulateur orbital
 *
 * Responsabilité : badge de classe dynamique (PHA, NEA, distant, inhabituel), mesures
 * (magnitude, demi-grand axe, excentricité), fiche technique, liens MPC/JPL et simulateur
 * (orbite elliptique, planètes de Mercure à Jupiter), sur la structure commune
 * `SmallBodyRow` / `SmallBodyDetailPanel` / `OrbitSimulator`.
 */

import { useMemo } from 'react';
import { getConstellationName } from '@/lib/constellations';
import { ASTEROID_SIMULATOR_PLANETS, asteroidOrbitPath, type SmallBodyPosition } from '@/lib/objects/orbits';
import { classifyAsteroid, type AsteroidClass } from '@/lib/objects/small-bodies';
import type { ObsLocation } from '@/lib/objects/observation';
import OrbitSimulator from '../small-bodies/OrbitSimulator';
import SmallBodyDetailPanel, { type InstrumentAnalysisCopy } from '../small-bodies/SmallBodyDetailPanel';
import { SmallBodyRow } from '../small-bodies/SmallBodyTable';
import { ASTEROID_SCORE_TITLE, type Asteroid, type CalculatedAsteroid } from './asteroidConfig';

const ASTEROID_ANALYSIS_COPY: InstrumentAnalysisCopy = {
    manageableSubject: 'Cet astéroïde',
    manageablePronoun: 'Il',
    targetNoun: 'la cible',
    exceededCapacity: 'les capacités visuelles de votre télescope',
};

/** Libellé, classes et infobulle du badge de chaque classe d'astéroïde. */
const ASTEROID_CLASS_BADGES: Record<AsteroidClass, { label: string; className: string; title: string }> = {
    PHA: {
        label: 'PHA',
        className:
            'cursor-help select-none rounded-sm border border-rose-500/40 bg-rose-500/15 px-1.5 py-0.5 font-sans text-[9px] font-medium uppercase tracking-wider text-rose-400',
        title: "PHA (Potentially Hazardous Asteroid) : Astéroïde potentiellement dangereux croisant l'orbite terrestre à moins de 0.05 UA avec une magnitude H <= 22.0.",
    },
    NEA: {
        label: 'NEA',
        className:
            'cursor-help select-none rounded-sm border border-teal-500/40 bg-teal-500/15 px-1.5 py-0.5 font-sans text-[9px] font-medium uppercase tracking-wider text-teal-400',
        title: 'NEA (Near-Earth Asteroid) : Astéroïde géocroiseur dont le périhélie est inférieur à 1.3 UA.',
    },
    Distant: {
        label: 'Distant',
        className:
            'cursor-help select-none rounded-sm border border-blue-500/40 bg-blue-500/15 px-1.5 py-0.5 font-sans text-[9px] font-medium uppercase tracking-wider text-blue-400',
        title: "Astéroïde distant (Troïen ou Centaure) : Astéroïde circulant au-delà de l'orbite de Jupiter (a > 5.5 UA).",
    },
    Unusual: {
        label: 'Inhabituel',
        className:
            'cursor-help select-none rounded-sm border border-amber-500/40 bg-amber-500/15 px-1.5 py-0.5 font-sans text-[9px] font-medium uppercase tracking-wider text-amber-400',
        title: 'Astéroïde à orbite inhabituelle ou de la Ceinture Principale externe.',
    },
};

/**
 * Badge de classe dynamique d'un astéroïde.
 *
 * @param props - Demi-grand axe, excentricité et magnitude absolue.
 * @returns Le badge avec son infobulle.
 */
function AsteroidTypeBadge({ asteroid }: { asteroid: { a: number; e: number; h: number } }) {
    const badge = ASTEROID_CLASS_BADGES[classifyAsteroid(asteroid)];
    return (
        <span className={badge.className} title={badge.title}>
            {badge.label}
        </span>
    );
}

/**
 * Simulateur de trajectoire orbitale d'un astéroïde en SVG.
 *
 * @param props - Astéroïde, position calculée et date.
 * @returns Le simulateur.
 */
function AsteroidOrbitSimulator({
    asteroid,
    orbit,
    date,
}: {
    asteroid: Asteroid;
    orbit: SmallBodyPosition;
    date: Date;
}) {
    // Le zoom automatique s'adapte à la taille de l'orbite de l'astéroïde (demi-grand axe a)
    const autoFieldAu = useMemo(() => Math.max(1.2, Math.min(10.0, asteroid.a * 2.0)), [asteroid.a]);

    // Tracé de l'orbite complète (ellipse fermée), sur 360° d'anomalie moyenne
    const orbitPoints = useMemo(() => asteroidOrbitPath(asteroid), [asteroid]);

    return (
        <OrbitSimulator
            orbitPoints={orbitPoints}
            autoFieldAu={autoFieldAu}
            orbit={orbit}
            date={date}
            planets={ASTEROID_SIMULATOR_PLANETS}
            bodyLabel="Astéroïde"
            bodyRadius="3.5"
        />
    );
}

interface AsteroidRowProps {
    asteroid: CalculatedAsteroid;
    isExpanded: boolean;
    onToggle: () => void;
    limitMagPhoto: number;
    location: ObsLocation;
    date: Date;
    formattedDate: string;
}

/**
 * Ligne dépliable d'un astéroïde.
 *
 * @param props - Astéroïde calculé, état de dépliage et contexte d'observation.
 * @returns La ligne et son panneau de détail.
 */
export default function AsteroidRow({
    asteroid: a,
    isExpanded,
    onToggle,
    limitMagPhoto,
    location,
    date,
    formattedDate,
}: AsteroidRowProps) {
    return (
        <SmallBodyRow
            body={a}
            isExpanded={isExpanded}
            onToggle={onToggle}
            typeBadge={<AsteroidTypeBadge asteroid={a} />}
            desktopIdClassName="font-sans text-xs text-mp-accent"
            desktopSubtitle={
                <>
                    Constellation : {getConstellationName(a.constellation)} · Réf : {a.ref}
                </>
            }
            metrics={[`${a.orbit.apparentMag.toFixed(1)} V`, `${a.a.toFixed(3)} UA`, a.e.toFixed(4)]}
            scoreTitle={ASTEROID_SCORE_TITLE}
            renderDetails={() => (
                <SmallBodyDetailPanel
                    name={a.name}
                    ra={a.orbit.ra}
                    dec={a.orbit.dec}
                    apparentMag={a.orbit.apparentMag}
                    maxAltNight={a.maxAltNight}
                    feasibilityLabel={a.feasibility.label}
                    limitMagPhoto={limitMagPhoto}
                    location={location}
                    date={date}
                    formattedDate={formattedDate}
                    description={
                        <>
                            Astéroïde potentiellement dangereux (PHA) de désignation officielle{' '}
                            <strong>{a.name}</strong> (code MPC <strong>{a.id}</strong>). Actuellement situé dans la
                            constellation de <strong>{getConstellationName(a.constellation)}</strong>. Son orbite
                            présente un demi-grand axe de <strong>{a.a.toFixed(4)} UA</strong> et une excentricité de{' '}
                            <strong>{a.e.toFixed(6)}</strong>.
                        </>
                    }
                    facts={[
                        { label: 'Magnitude absolue (H) :', value: `${a.h.toFixed(2)} mag` },
                        { label: 'Paramètre de pente (G) :', value: a.g.toFixed(2) },
                    ]}
                    analysisCopy={ASTEROID_ANALYSIS_COPY}
                    mpcUrl={`https://www.minorplanetcenter.net/db_search/show_object?object_id=${encodeURIComponent(a.id)}`}
                    jplUrl={`https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=${encodeURIComponent(a.id)}`}
                    simulator={<AsteroidOrbitSimulator asteroid={a} orbit={a.orbit} date={date} />}
                />
            )}
        />
    );
}
