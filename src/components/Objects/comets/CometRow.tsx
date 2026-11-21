/**
 * Ligne du tableau des comètes et son panneau de détail
 *
 * Responsabilité : badge de type d'orbite, mesures (magnitude, distances au Soleil et à la
 * Terre), fiche technique et liens MPC/JPL propres aux comètes, sur la structure commune
 * `SmallBodyRow` / `SmallBodyDetailPanel`.
 */

import { getConstellationName } from '@/lib/constellations';
import { cometOrbitType } from '@/lib/objects/small-bodies';
import type { ObsLocation } from '@/lib/objects/observation';
import SmallBodyDetailPanel, { type InstrumentAnalysisCopy } from '../small-bodies/SmallBodyDetailPanel';
import { SmallBodyRow } from '../small-bodies/SmallBodyTable';
import CometOrbitSimulator from './CometOrbitSimulator';
import { COMET_SCORE_TITLE, type CalculatedComet } from './cometConfig';

const COMET_ANALYSIS_COPY: InstrumentAnalysisCopy = {
    manageableSubject: 'Cette comète',
    manageablePronoun: 'Elle',
    targetNoun: 'la comète',
    exceededCapacity: 'les capacités visuelles',
};

/**
 * Badge « Périodique » / « Non-périodique » selon l'excentricité.
 *
 * @param props - Excentricité de l'orbite.
 * @returns Le badge avec son infobulle.
 */
function CometTypeBadge({ e }: { e: number }) {
    const isPeriodic = e < 0.9;
    return (
        <span
            className={`cursor-help rounded border px-1.5 py-0.5 font-sans text-[9px] font-medium tracking-wider uppercase select-none ${
                isPeriodic
                    ? 'border-teal-500/40 bg-teal-500/15 text-teal-400'
                    : 'border-amber-500/40 bg-amber-500/15 text-amber-400'
            }`}
            title={
                isPeriodic
                    ? 'Comète périodique (e < 0.9) : Orbite elliptique fermée revenant régulièrement près du Soleil.'
                    : "Comète non-périodique (e >= 0.9) : Orbite parabolique ou hyperbolique provenant du nuage d'Oort."
            }
        >
            {cometOrbitType(e)}
        </span>
    );
}

/**
 * Désignation recherchée sur le JPL : numéro sans zéros de tête pour une périodique
 * numérotée (« 0001P » → « 1P »), sinon le nom sans parenthèses.
 *
 * @param comet - Désignation et nom de la comète.
 * @returns La chaîne de recherche JPL.
 */
function jplSearchTerm(comet: { id: string; name: string }): string {
    return /^\d+P$/.test(comet.id) ? comet.id.replace(/^0+/, '') : comet.name.replace(/\s*\(.*?\)\s*/g, '').trim();
}

interface CometRowProps {
    comet: CalculatedComet;
    isExpanded: boolean;
    onToggle: () => void;
    limitMagPhoto: number;
    location: ObsLocation;
    date: Date;
    formattedDate: string;
}

/**
 * Ligne dépliable d'une comète.
 *
 * @param props - Comète calculée, état de dépliage et contexte d'observation.
 * @returns La ligne et son panneau de détail.
 */
export default function CometRow({
    comet: c,
    isExpanded,
    onToggle,
    limitMagPhoto,
    location,
    date,
    formattedDate,
}: CometRowProps) {
    return (
        <SmallBodyRow
            body={c}
            isExpanded={isExpanded}
            onToggle={onToggle}
            typeBadge={<CometTypeBadge e={c.e} />}
            desktopIdClassName="shrink-0 font-sans text-xs text-mp-accent"
            desktopSubtitle={
                <>
                    Constellation : {getConstellationName(c.constellation)} · Orbite :{' '}
                    {c.e < 0.9 ? 'Périodique' : 'Non-périodique / Parabolique'}
                </>
            }
            metrics={[
                `${c.orbit.apparentMag.toFixed(1)} V`,
                `${c.orbit.r.toFixed(2)} UA`,
                `${c.orbit.delta.toFixed(2)} UA`,
            ]}
            scoreTitle={COMET_SCORE_TITLE}
            renderDetails={() => (
                <SmallBodyDetailPanel
                    name={c.name}
                    ra={c.orbit.ra}
                    dec={c.orbit.dec}
                    apparentMag={c.orbit.apparentMag}
                    maxAltNight={c.maxAltNight}
                    feasibilityLabel={c.feasibility.label}
                    limitMagPhoto={limitMagPhoto}
                    location={location}
                    date={date}
                    formattedDate={formattedDate}
                    description={
                        <>
                            Comète {c.e < 0.9 ? 'périodique' : 'parabolique ou hyperbolique'} de désignation officielle{' '}
                            <strong>{c.id}</strong>. Actuellement située dans la constellation de{' '}
                            <strong>{getConstellationName(c.constellation)}</strong>. Son passage au périhélie (point le
                            plus proche du Soleil) a lieu le{' '}
                            <strong>
                                {c.pYear}-{String(c.pMonth).padStart(2, '0')}-
                                {String(Math.floor(c.pDay)).padStart(2, '0')}
                            </strong>{' '}
                            à une distance de <strong>{c.q.toFixed(3)} UA</strong>.
                        </>
                    }
                    facts={[
                        { label: 'Excentricité (e) :', value: c.e.toFixed(6) },
                        { label: 'Inclinaison (i) :', value: `${c.inclination.toFixed(4)}°` },
                    ]}
                    analysisCopy={COMET_ANALYSIS_COPY}
                    mpcUrl={`https://www.minorplanetcenter.net/db_search/show_object?object_id=${encodeURIComponent(c.id)}`}
                    jplUrl={`https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=${encodeURIComponent(jplSearchTerm(c))}`}
                    simulator={<CometOrbitSimulator comet={c} orbit={c.orbit} date={date} />}
                />
            )}
        />
    );
}
