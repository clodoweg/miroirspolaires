/**
 * @file VariableStarDetail.tsx
 * @description Panneau de détail déroulant d'une étoile variable.
 *
 * Responsabilité : assembler la fiche technique, l'analyse instrumentale, les liens catalogues,
 * les horaires du phénomène, le simulateur de variabilité, la visibilité annuelle et journalière
 * et la carte du ciel locale.
 */

import { lazy, Suspense } from 'react';
import AnnualVisibilityPanel from '../AnnualVisibilityPanel';
import DailyVisibilityPanel from '../DailyVisibilityPanel';
import { getConstellationName } from '@/lib/constellations';
import { getLocalNoonAtLongitude, type ObsLocation } from '@/lib/objects/observation';
import {
    getVariabilityTypeLabel,
    getVariableStarPhenomenaInWindow,
    type AnalysedVariableStar,
} from '@/lib/objects/variable-stars';
import InstrumentalAnalysis from './InstrumentalAnalysis';
import PhenomenonSchedule from './PhenomenonSchedule';
import VariabilitySimulator from './VariabilitySimulator';

const StaticSkyMap = lazy(() => import('@/components/SkyMap/StaticSkyMap'));

const SECTION_TITLE_CLASS =
    'border-b border-mp-glass-border pb-2 text-sm uppercase tracking-uppercase text-mp-text-secondary';
const CATALOGUE_LINK_CLASS =
    'duration-normal flex items-center gap-1 rounded-sm border border-mp-accent/25 bg-mp-accent/10 px-2.5 py-1.5 font-sans font-medium text-mp-accent no-underline transition-all hover:bg-mp-accent hover:text-mp-ui-black';

/** Contexte d'observation partagé par toutes les lignes (date, lieu, instrument). */
export interface VariableStarDetailContext {
    date: Date;
    location: ObsLocation;
    tzLabel: string;
    formattedDate: string;
    aperture: number;
    limitMag: number;
    limitMagPhoto: number;
}

interface VariableStarDetailProps extends VariableStarDetailContext {
    star: AnalysedVariableStar;
}

/**
 * Panneau de détail d'une étoile variable.
 *
 * @param props - Étoile analysée et contexte d'observation.
 * @returns Le contenu déplié de la ligne.
 */
export default function VariableStarDetail({
    star: s,
    date,
    location,
    tzLabel,
    formattedDate,
    aperture,
    limitMag,
    limitMagPhoto,
}: VariableStarDetailProps) {
    const noon = getLocalNoonAtLongitude(date, location.lon);
    const transits = getVariableStarPhenomenaInWindow(s, noon, new Date(noon.getTime() + 24 * 3600 * 1000));

    return (
        <div className="col-span-full space-y-6 border-t border-mp-glass-border bg-mp-bg-secondary/40 p-6">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* Fiche technique */}
                <div className="space-y-4">
                    <h4 className={SECTION_TITLE_CLASS}>Fiche Technique & Diagnostic</h4>

                    <p className="text-sm leading-relaxed text-mp-text-body">
                        {s.details ||
                            `Étoile variable de type ${getVariabilityTypeLabel(s.type).toLowerCase()} située dans la constellation de ${getConstellationName(s.constellation) || 'inconnue'}. Sa luminosité apparente varie entre la magnitude ${s.vMagMin.toFixed(1)} et la magnitude ${s.vMagMax.toFixed(1)} sur un cycle d'environ ${!s.period || s.period >= 10000 ? 'irrégulier' : `${s.period.toFixed(2)} jours`}.`}
                    </p>

                    <div className="grid grid-cols-2 gap-4 pt-2 text-sm">
                        <div>
                            <span className="block text-mp-text-muted">Type spectral :</span>
                            <span className="font-mono text-mp-text-body">{s.spectralType}</span>
                        </div>
                        <div>
                            <span className="block text-mp-text-muted">Distance :</span>
                            <span className="font-mono text-mp-text-body">
                                {s.distance > 0
                                    ? `${s.distance.toLocaleString('fr-FR')} al`
                                    : 'Inconnue (Gaia DR3 N/A)'}
                            </span>
                        </div>
                        <div>
                            <span className="block text-mp-text-muted">Coordonnées célestes :</span>
                            <span className="font-mono text-xs text-mp-text-body">
                                RA {s.ra.toFixed(2)}° · Dec {s.dec.toFixed(2)}°
                            </span>
                        </div>
                        <div>
                            <span className="block text-mp-text-muted">Altitude max ce soir :</span>
                            <span className="font-mono text-mp-text-body">
                                {s.maxAltNight ? `${s.maxAltNight.toFixed(0)}°` : "Sous l'horizon"}
                            </span>
                        </div>
                    </div>

                    <InstrumentalAnalysis
                        star={s}
                        aperture={aperture}
                        limitMag={limitMag}
                        limitMagPhoto={limitMagPhoto}
                    />

                    {/* Catalogues & Courbes Réelles */}
                    <div className="space-y-3 rounded-lg border border-mp-glass-border bg-mp-ui-black/30 p-4 text-xs">
                        <div className="font-medium tracking-wide text-mp-text-primary uppercase">
                            <span>Catalogues & Données réelles :</span>
                        </div>
                        <p className="leading-relaxed text-mp-text-muted">
                            Consultez les courbes de lumière réelles et les données de suivi sur les portails
                            astronomiques professionnels :
                        </p>
                        <div className="flex flex-wrap gap-2 pt-1">
                            <a
                                href={`https://vsx.aavso.org/index.php?view=results.get&coords=${encodeURIComponent(`${s.ra} ${s.dec >= 0 ? '+' : ''}${s.dec}`)}&format=d&size=10&units=2`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={CATALOGUE_LINK_CLASS}
                            >
                                AAVSO VSX 📂
                            </a>
                            <a
                                href={`https://asas-sn.osu.edu/variables?ra=${s.ra}&dec=${s.dec}&radius=0.05`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={CATALOGUE_LINK_CLASS}
                            >
                                ASAS-SN 🔭
                            </a>
                            <a
                                href={`http://simbad.cds.unistra.fr/simbad/sim-basic?Ident=${encodeURIComponent(s.starName)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={CATALOGUE_LINK_CLASS}
                            >
                                Simbad 🌌
                            </a>
                        </div>
                    </div>

                    {/* Horaires locaux de l'observatoire (Phénomène de variabilité) */}
                    <PhenomenonSchedule star={s} date={date} location={location} tzLabel={tzLabel} />
                </div>

                {/* Colonne 2 : Simulateur Interactif & Hauteur Céleste */}
                <div className="space-y-6">
                    <div className="space-y-4">
                        <h4 className={SECTION_TITLE_CLASS}>Simulateur de Variabilité</h4>

                        <VariabilitySimulator star={s} date={date} location={location} />
                    </div>

                    {/* Graphique de visibilité de la nuit */}
                    <div className="space-y-2">
                        <h4 className={SECTION_TITLE_CLASS}>Visibilité Annuelle</h4>
                        <AnnualVisibilityPanel
                            ra={s.ra}
                            dec={s.dec}
                            location={location}
                            date={date}
                            magV={(s.vMagMin + s.vMagMax) / 2}
                        />
                    </div>
                </div>

                {/* Blocs de Visibilité Annuelle et Localisation */}
                <div className="grid grid-cols-1 gap-6 border-t border-mp-glass-border/30 pt-6 lg:col-span-2 lg:grid-cols-2">
                    <div className="space-y-4">
                        <h4 className={SECTION_TITLE_CLASS}>Visibilité {formattedDate}</h4>
                        <DailyVisibilityPanel
                            ra={s.ra}
                            dec={s.dec}
                            location={location}
                            date={date}
                            targetName={s.name}
                            magV={(s.vMagMin + s.vMagMax) / 2}
                            magLim={limitMagPhoto}
                            hideTitle={true}
                            transits={transits}
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
                                <StaticSkyMap
                                    raVal={s.ra}
                                    decVal={s.dec}
                                    radius={5}
                                    fieldSize="5° × 5°"
                                    title={s.name}
                                />
                            </Suspense>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
