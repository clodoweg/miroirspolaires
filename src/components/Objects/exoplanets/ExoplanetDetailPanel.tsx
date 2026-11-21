/**
 * Panneau de détail d'une exoplanète dépliée
 *
 * Responsabilité : fiche technique, analyse instrumentale (bruit, S/B), liens vers les catalogues,
 * horaires du transit de la nuit, simulateur de transit, visibilité annuelle et journalière, et
 * carte du ciel. Rendu seulement quand la ligne est dépliée.
 */

import { lazy, Suspense, type ReactNode } from 'react';
import { Calendar, Info } from 'lucide-react';
import AnnualVisibilityPanel from '../AnnualVisibilityPanel';
import DailyVisibilityPanel from '../DailyVisibilityPanel';
import TransitSimulator from './TransitSimulator';
import { formatDateInLocation, formatTimeInLocation, type ObsLocation } from '@/lib/objects/observation';
import type { AnalysedExoplanet, DifficultyLabel } from '@/lib/objects/exoplanets';

const StaticSkyMap = lazy(() => import('@/components/SkyMap/StaticSkyMap'));

const SECTION_TITLE_CLASS =
    'border-b border-mp-glass-border pb-2 text-sm uppercase tracking-uppercase text-mp-text-secondary';
const CATALOGUE_LINK_CLASS =
    'duration-normal flex items-center gap-1 rounded-sm border border-mp-accent/25 bg-mp-accent/10 px-2.5 py-1.5 font-sans font-medium text-mp-accent no-underline transition-all hover:bg-mp-accent hover:text-mp-ui-black';

const DIFFICULTY_SYMBOL: Record<DifficultyLabel, string> = {
    Facile: '✓',
    Moyen: '✓',
    Difficile: '⚠',
    'Hors de portée': '✗',
};

const DIFFICULTY_ADVICE: Record<DifficultyLabel, string> = {
    Facile: 'Le signal est très fort. Idéal pour débuter et obtenir une courbe de lumière propre.',
    Moyen: 'Détectable avec un autoguide stable et de bons fichiers de calibration (Darks/Flats).',
    Difficile: "Exigeant. Requiert un ciel transparent, un guidage précis, et une réduction d'image soignée.",
    'Hors de portée':
        'La baisse de luminosité est trop faible par rapport au bruit. Nécessite un télescope de plus grand diamètre.',
};

interface ExoplanetDetailPanelProps {
    planet: AnalysedExoplanet;
    aperture: number;
    location: ObsLocation;
    date: Date;
    /** Libellé du fuseau de l'observatoire (ex. `UTC+2`). */
    tzLabel: string;
    /** Date de la nuit, formatée dans le fuseau de l'observatoire. */
    formattedDate: string;
}

/**
 * Caractéristique physique (libellé + valeur).
 *
 * @param props - Libellé et contenu de la valeur.
 * @returns La cellule de la grille des caractéristiques.
 */
function Characteristic({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div>
            <span className="block text-mp-text-muted">{label}</span>
            <span className="font-mono text-mp-text-body">{children}</span>
        </div>
    );
}

/**
 * Cellule horaire du planning (début, milieu, fin).
 *
 * @param props - Titre, instant, site, mise en avant et altitude éventuelle.
 * @returns La cellule.
 */
function TransitTimeCell({
    title,
    instant,
    location,
    highlighted = false,
    altitudeDeg,
}: {
    title: string;
    instant: Date;
    location: ObsLocation;
    highlighted?: boolean;
    altitudeDeg?: number;
}) {
    return (
        <div
            className={`rounded-sm border ${highlighted ? 'border-mp-accent/20' : 'border-mp-glass-border'} bg-mp-bg-secondary/40 p-2.5`}
        >
            <div className="mb-0.5 tracking-wider text-mp-text-muted uppercase">{title}</div>
            <div
                className={`font-mono text-xs leading-tight font-semibold ${highlighted ? 'text-mp-accent' : 'text-mp-text-body'}`}
            >
                {formatDateInLocation(instant, location)} à {formatTimeInLocation(instant, location)}
            </div>
            {altitudeDeg !== undefined && (
                <div className="mt-0.5 font-mono text-[10px] text-mp-text-muted">Alt: {altitudeDeg.toFixed(0)}°</div>
            )}
        </div>
    );
}

/**
 * Panneau de détail d'une exoplanète.
 *
 * @param props - Exoplanète analysée, instrument, site, date et libellés de fuseau / date.
 * @returns Le panneau déplié.
 */
export default function ExoplanetDetailPanel({
    planet: p,
    aperture,
    location,
    date,
    tzLabel,
    formattedDate,
}: ExoplanetDetailPanelProps) {
    const activeTransit = p.transit || p.nextTransit;

    return (
        <div className="col-span-full space-y-6 border-t border-mp-glass-border bg-mp-bg-secondary/40 p-6">
            {/* Infos et simulation */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* Colonne 1 : Caractéristiques Physiques et Setup */}
                <div className="space-y-4">
                    <h4 className={SECTION_TITLE_CLASS}>Fiche Technique & Instrumentation</h4>

                    {/* Grille caractéristiques */}
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <Characteristic label="Période orbitale :">{p.period.toFixed(5)} jours</Characteristic>
                        <Characteristic label="Durée du transit :">{p.duration.toFixed(2)} heures</Characteristic>
                        <Characteristic label="Masse de la planète :">
                            {/* POURQUOI: Certaines planètes de VarAstro n'ont pas de masse renseignée dans le NASA Exoplanet Archive (fallback à 0). On affiche un tiret pour éviter un crash. */}
                            {p.mass && p.mass > 0 ? (
                                <>
                                    {p.mass.toFixed(2)} M<sub>J</sub>
                                    <span className="text-xs text-mp-text-muted">
                                        {' '}
                                        ({(p.mass * 317.8).toFixed(0)} M<sub>⊕</sub>)
                                    </span>
                                </>
                            ) : (
                                '—'
                            )}
                        </Characteristic>
                        <Characteristic label="Rayon de la planète :">
                            {/* POURQUOI: Certaines planètes peuvent avoir des rayons non disponibles ou aberrants (fallback à 0). */}
                            {p.radius && p.radius > 0 ? (
                                <>
                                    {p.radius.toFixed(2)} R<sub>J</sub>
                                    <span className="text-xs text-mp-text-muted">
                                        {' '}
                                        ({(p.radius * 11.2).toFixed(0)} R<sub>⊕</sub>)
                                    </span>
                                </>
                            ) : (
                                '—'
                            )}
                        </Characteristic>
                        <Characteristic label="Type spectral :">{p.spectralType || '—'}</Characteristic>
                        <Characteristic label="Distance :">
                            {/* POURQUOI: Permet de gérer les cas où la distance de l'étoile est inconnue. */}
                            {p.distance && p.distance > 0 ? `${p.distance.toFixed(0)} al` : '—'}
                        </Characteristic>
                    </div>

                    {/* Détails observabilité instrumentale */}
                    <div className="space-y-2 rounded-lg border border-mp-glass-border bg-mp-ui-black/30 p-4 text-xs">
                        <div className="font-medium tracking-wide text-mp-text-primary uppercase">
                            Analyse instrumentale :
                        </div>
                        <p className="text-mp-text-body">
                            <span className="mr-1.5 inline-block font-bold text-mp-accent">
                                {DIFFICULTY_SYMBOL[p.difficulty.label]}
                            </span>
                            Avec votre instrument de <span className="font-semibold text-mp-accent">{aperture} mm</span>
                            , le bruit photométrique estimé sur l'étoile {p.starName} est de{' '}
                            <span className="font-semibold text-mp-accent">{p.difficulty.noise.toFixed(2)} mmag</span>{' '}
                            pour 2 minutes d'intégration.
                        </p>
                        <div className="flex items-center gap-2 pt-1">
                            <span className="text-mp-text-muted">Rapport Signal/Bruit (S/B) estimé :</span>
                            <span className="rounded-sm bg-mp-accent-light px-1.5 py-0.5 font-mono font-semibold text-mp-accent">
                                {p.difficulty.snr.toFixed(1)}×
                            </span>
                        </div>
                        <p className="pt-1 text-mp-text-muted italic">{DIFFICULTY_ADVICE[p.difficulty.label]}</p>
                    </div>

                    {/* Catalogues & Données réelles */}
                    <div className="space-y-3 rounded-lg border border-mp-glass-border bg-mp-ui-black/30 p-4 text-xs">
                        <div className="font-medium tracking-wide text-mp-text-primary uppercase">
                            <span>Catalogues & Données réelles :</span>
                        </div>
                        <p className="leading-relaxed text-mp-text-muted">
                            Consultez les paramètres orbitaux officiels, publications scientifiques et données de suivi
                            sur les portails exoplanétaires professionnels :
                        </p>
                        <div className="flex flex-wrap gap-2 pt-1">
                            <a
                                href={`https://exoplanetarchive.ipac.caltech.edu/overview/${encodeURIComponent(p.name)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={CATALOGUE_LINK_CLASS}
                            >
                                NASA Exoplanet Archive 🪐
                            </a>
                            <a
                                href={`https://exoplanet.eu/catalog/${encodeURIComponent(p.name.toLowerCase().replace(/[\s-]+/g, '_'))}/`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={CATALOGUE_LINK_CLASS}
                            >
                                Exoplanet.eu 🌍
                            </a>
                            <a
                                href={`http://simbad.cds.unistra.fr/simbad/sim-basic?Ident=${encodeURIComponent(p.starName || p.name)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={CATALOGUE_LINK_CLASS}
                            >
                                Simbad CDS 🔬
                            </a>
                        </div>
                    </div>

                    {/* Planning détaillé de la nuit */}
                    {p.transit && (
                        <div className="space-y-3 rounded-lg border border-mp-glass-border bg-mp-ui-black/20 p-4">
                            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                                <span className="flex items-center gap-1.5 font-medium text-mp-text-heading">
                                    <Calendar className="h-4 w-4 text-mp-accent" />
                                    Horaire du phénomène ({tzLabel})
                                </span>
                                <span className="text-xs text-mp-text-muted">
                                    Coordonnées : {location.name} ({location.lat.toFixed(2)}°, {location.lon.toFixed(2)}
                                    °)
                                </span>
                            </div>

                            <div className="grid grid-cols-3 gap-2 text-center text-xs">
                                <TransitTimeCell title="Début" instant={p.transit.start} location={location} />
                                <TransitTimeCell
                                    title="Milieu du transit"
                                    instant={p.transit.tc}
                                    location={location}
                                    highlighted
                                    altitudeDeg={p.transit.starAltMid}
                                />
                                <TransitTimeCell title="Fin" instant={p.transit.end} location={location} />
                            </div>

                            <p className="flex items-start gap-1 text-xs text-mp-text-muted">
                                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-mp-accent" />
                                <span>
                                    <strong>Diagnostic d'observabilité :</strong> {p.transit.observabilityReason}
                                </span>
                            </p>
                        </div>
                    )}
                </div>

                {/* Colonne 2 : Simulateur Interactif & Hauteur Céleste */}
                <div className="space-y-6">
                    <div className="space-y-4">
                        <h4 className={SECTION_TITLE_CLASS}>Simulateur de Transit ({tzLabel})</h4>

                        {activeTransit ? (
                            <TransitSimulator planet={p} transit={activeTransit} location={location} />
                        ) : (
                            <div className="rounded-lg border border-mp-glass-border bg-mp-ui-black/20 py-8 text-center text-xs text-mp-text-muted italic">
                                Simulateur indisponible (paramètres orbitaux manquants ou invalides)
                            </div>
                        )}
                    </div>

                    {/* Graphique de visibilité de la nuit */}
                    <div className="space-y-2">
                        <h4 className={SECTION_TITLE_CLASS}>Visibilité Annuelle</h4>
                        <AnnualVisibilityPanel ra={p.ra} dec={p.dec} location={location} date={date} magV={p.vMag} />
                    </div>
                </div>
            </div>

            {/* Blocs de Visibilité Annuelle et Localisation */}
            <div className="grid grid-cols-1 gap-6 border-t border-mp-glass-border/30 pt-6 lg:grid-cols-2">
                <div className="space-y-4">
                    <h4 className={SECTION_TITLE_CLASS}>Visibilité {formattedDate}</h4>
                    <DailyVisibilityPanel
                        ra={p.ra}
                        dec={p.dec}
                        location={location}
                        date={date}
                        targetName={p.name}
                        magV={p.vMag}
                        hideTitle={true}
                        transitStart={p.transit?.start}
                        transitEnd={p.transit?.end}
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
                            <StaticSkyMap raVal={p.ra} decVal={p.dec} radius={5} fieldSize="5° × 5°" title={p.name} />
                        </Suspense>
                    </div>
                </div>
            </div>
        </div>
    );
}
