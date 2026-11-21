/**
 * Panneau de détail d'un petit corps (comète ou astéroïde), affiché sous la ligne dépliée
 *
 * Responsabilité : mise en page commune (fiche technique, analyse instrumentale, liens
 * MPC/JPL, simulation orbitale, visibilités annuelle et journalière, carte du ciel). Le
 * paragraphe de présentation, les deux premières caractéristiques, le simulateur et les
 * formulations propres au type d'objet sont fournis par le visualiseur.
 */

import { lazy, Suspense, type ReactNode } from 'react';
import AnnualVisibilityPanel from '../AnnualVisibilityPanel';
import DailyVisibilityPanel from '../DailyVisibilityPanel';
import type { ObsLocation } from '@/lib/objects/observation';
import type { FeasibilityLabel } from '@/lib/objects/small-bodies';

const StaticSkyMap = lazy(() => import('@/components/SkyMap/StaticSkyMap'));

const SECTION_TITLE_CLASS =
    'border-b border-mp-glass-border pb-2 text-sm uppercase tracking-uppercase text-mp-text-secondary';

const PORTAL_LINK_CLASS =
    'duration-normal flex items-center gap-1 rounded-sm border border-mp-accent/25 bg-mp-accent/10 px-2.5 py-1.5 font-sans font-medium text-mp-accent no-underline transition-all hover:bg-mp-accent hover:text-mp-ui-black';

/** Formulations de l'analyse instrumentale propres au type d'objet. */
export interface InstrumentAnalysisCopy {
    /** Sujet du verdict « Gérable » (ex. « Cette comète »). */
    manageableSubject: string;
    /** Pronom de reprise du verdict « Gérable » (« Elle », « Il »). */
    manageablePronoun: string;
    /** Désignation de la cible dans les autres verdicts (« la comète », « la cible »). */
    targetNoun: string;
    /** Fin de la phrase « dépasse … » du verdict « Setup insuffisant ». */
    exceededCapacity: string;
}

/** Caractéristique affichée dans la grille de la fiche technique. */
export interface DetailFact {
    label: string;
    value: string;
}

interface SmallBodyDetailPanelProps {
    name: string;
    ra: number;
    dec: number;
    apparentMag: number;
    maxAltNight: number | undefined;
    feasibilityLabel: FeasibilityLabel;
    limitMagPhoto: number;
    location: ObsLocation;
    date: Date;
    /** Date d'observation formatée pour le titre de la visibilité journalière. */
    formattedDate: string;
    /** Paragraphe de présentation de l'objet. */
    description: ReactNode;
    /** Deux premières caractéristiques de la grille (avant coordonnées et hauteur). */
    facts: readonly [DetailFact, DetailFact];
    analysisCopy: InstrumentAnalysisCopy;
    mpcUrl: string;
    jplUrl: string;
    /** Simulateur orbital SVG. */
    simulator: ReactNode;
}

function Fact({ label, value, valueClassName }: { label: string; value: ReactNode; valueClassName: string }) {
    return (
        <div>
            <span className="block text-mp-text-muted">{label}</span>
            <span className={valueClassName}>{value}</span>
        </div>
    );
}

function Highlight({ children }: { children: ReactNode }) {
    return <span className="font-semibold text-mp-accent">{children}</span>;
}

function Mark({ symbol }: { symbol: string }) {
    return <span className="mr-1.5 inline-block font-bold text-mp-accent">{symbol}</span>;
}

/**
 * Explication du verdict de faisabilité au regard de l'instrument.
 *
 * @param props - Verdict, magnitudes et formulations propres au type d'objet.
 * @returns Le paragraphe d'analyse.
 */
function InstrumentAnalysis({
    feasibilityLabel,
    apparentMag,
    limitMagPhoto,
    copy,
}: {
    feasibilityLabel: FeasibilityLabel;
    apparentMag: number;
    limitMagPhoto: number;
    copy: InstrumentAnalysisCopy;
}) {
    const mag = <Highlight>{apparentMag.toFixed(1)}</Highlight>;
    const limit = <Highlight>{limitMagPhoto.toFixed(1)} V</Highlight>;
    return (
        <p className="leading-relaxed text-mp-text-body">
            {feasibilityLabel === 'Gérable' && (
                <span>
                    <Mark symbol="✓" />
                    {copy.manageableSubject} a un éclat suffisant (mag {mag}) pour être détectable.{' '}
                    {copy.manageablePronoun} est largement à la portée de votre magnitude limite photo de {limit} avec
                    votre caméra.
                </span>
            )}
            {feasibilityLabel === 'Délicat' && (
                <span>
                    <Mark symbol="⚠" />
                    L'observation sera exigeante : l'éclat de {copy.targetNoun} (mag {mag}) est proche de la limite de
                    votre instrument ou très bas sur l'horizon, mais reste accessible en imagerie grâce à votre limite
                    photo de {limit}.
                </span>
            )}
            {feasibilityLabel === 'Setup insuffisant' && (
                <span>
                    <Mark symbol="✗" />
                    L'éclat de {copy.targetNoun} (mag {mag}) dépasse {copy.exceededCapacity}. En imagerie, elle reste{' '}
                    {apparentMag > limitMagPhoto ? 'hors de portée' : 'accessible en cumulant des poses'} par rapport à
                    votre limite photo de {limit}.
                </span>
            )}
            {feasibilityLabel === 'Inobservable' && (
                <span>
                    <Mark symbol="✗" />
                    Cette cible reste sous l'horizon ou se lève uniquement en plein jour pour votre observatoire à la
                    date choisie.
                </span>
            )}
        </p>
    );
}

/**
 * Panneau de détail d'un petit corps.
 *
 * @param props - Position, verdict, contexte d'observation et contenus propres au type d'objet.
 * @returns Le panneau affiché sous la ligne dépliée.
 */
export default function SmallBodyDetailPanel({
    name,
    ra,
    dec,
    apparentMag,
    maxAltNight,
    feasibilityLabel,
    limitMagPhoto,
    location,
    date,
    formattedDate,
    description,
    facts,
    analysisCopy,
    mpcUrl,
    jplUrl,
    simulator,
}: SmallBodyDetailPanelProps) {
    return (
        <div className="col-span-full space-y-6 border-t border-mp-glass-border bg-mp-bg-secondary/40 p-6">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="space-y-4">
                    <h4 className={SECTION_TITLE_CLASS}>Fiche Technique & Coordonnées</h4>

                    <p className="text-sm leading-relaxed text-mp-text-body">{description}</p>

                    <div className="grid grid-cols-2 gap-4 pt-2 text-sm">
                        {facts.map((fact) => (
                            <Fact
                                key={fact.label}
                                label={fact.label}
                                value={fact.value}
                                valueClassName="font-mono text-mp-text-body"
                            />
                        ))}
                        <Fact
                            label="Coordonnées célestes (J2000) :"
                            value={`AD ${(ra / 15).toFixed(2)}h · Déc ${dec.toFixed(2)}°`}
                            valueClassName="font-mono text-xs text-mp-text-body"
                        />
                        <Fact
                            label="Hauteur max cette nuit :"
                            value={maxAltNight ? `${maxAltNight.toFixed(0)}°` : "Sous l'horizon"}
                            valueClassName="font-mono text-mp-text-body"
                        />
                    </div>

                    <div className="space-y-2 rounded-lg border border-mp-glass-border bg-mp-ui-black/30 p-4 text-xs">
                        <div className="font-medium tracking-wide text-mp-text-primary uppercase">
                            Analyse instrumentale :
                        </div>
                        <InstrumentAnalysis
                            feasibilityLabel={feasibilityLabel}
                            apparentMag={apparentMag}
                            limitMagPhoto={limitMagPhoto}
                            copy={analysisCopy}
                        />
                    </div>

                    <div className="space-y-3 rounded-lg border border-mp-glass-border bg-mp-ui-black/30 p-4 text-xs">
                        <div className="font-medium tracking-wide text-mp-text-primary uppercase">
                            <span>Portails & Éphémérides :</span>
                        </div>
                        <p className="leading-relaxed text-mp-text-muted">
                            Consultez les informations de la base de données du Minor Planet Center (MPC) et du JPL :
                        </p>
                        <div className="flex flex-wrap gap-2 pt-1">
                            <a href={mpcUrl} target="_blank" rel="noopener noreferrer" className={PORTAL_LINK_CLASS}>
                                Minor Planet Center 🌍
                            </a>
                            <a href={jplUrl} target="_blank" rel="noopener noreferrer" className={PORTAL_LINK_CLASS}>
                                JPL Small-Body Database 🔭
                            </a>
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="space-y-4">
                        <h4 className={SECTION_TITLE_CLASS}>Simulation Orbitale</h4>
                        {simulator}
                    </div>

                    <div className="space-y-4">
                        <h4 className={SECTION_TITLE_CLASS}>Visibilité Annuelle</h4>
                        <AnnualVisibilityPanel ra={ra} dec={dec} location={location} date={date} magV={apparentMag} />
                    </div>
                </div>
            </div>

            {/* Blocs de Visibilité Annuelle et Localisation */}
            <div className="grid grid-cols-1 gap-6 border-t border-mp-glass-border/30 pt-6 lg:grid-cols-2">
                <div className="space-y-4">
                    <h4 className={SECTION_TITLE_CLASS}>Visibilité {formattedDate}</h4>
                    <DailyVisibilityPanel
                        ra={ra}
                        dec={dec}
                        location={location}
                        date={date}
                        targetName={name}
                        magV={apparentMag}
                        magLim={limitMagPhoto}
                        hideTitle={true}
                    />
                </div>
                <div className="space-y-4">
                    <h4 className={SECTION_TITLE_CLASS}>Localisation dans le Ciel</h4>
                    <div className="relative aspect-video overflow-hidden rounded-lg border border-mp-glass-border">
                        <Suspense
                            fallback={
                                <div className="flex h-full w-full items-center justify-center bg-mp-glass-solid text-sm text-mp-text-muted">
                                    Chargement de la carte du ciel…
                                </div>
                            }
                        >
                            <StaticSkyMap raVal={ra} decVal={dec} radius={5} fieldSize="5° × 5°" title={name} />
                        </Suspense>
                    </div>
                </div>
            </div>
        </div>
    );
}
