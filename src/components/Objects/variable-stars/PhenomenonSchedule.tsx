/**
 * @file PhenomenonSchedule.tsx
 * @description Horaires locaux du phénomène de variabilité (début, milieu, fin) d'une étoile variable.
 *
 * Responsabilité : afficher, dans le fuseau de l'observatoire, le phénomène du cycle couvrant la nuit
 * sélectionnée, ou à défaut le lever, le transit et le coucher de la cible, puis la fenêtre exploitable.
 */

import { Calendar, Info } from 'lucide-react';
import {
    formatDateInLocation,
    formatTimeInLocation,
    getLocalNoonAtLongitude,
    type ObsLocation,
} from '@/lib/objects/observation';
import { getVariableStarPhenomenon, type AnalysedVariableStar } from '@/lib/objects/variable-stars';

interface PhenomenonScheduleProps {
    star: AnalysedVariableStar;
    date: Date;
    location: ObsLocation;
    tzLabel: string;
}

/**
 * Formate « date à heure » dans le fuseau de l'observatoire.
 *
 * @param d - Instant à formater.
 * @param location - Lieu d'observation.
 * @returns Chaîne « <date> à <heure> ».
 */
function formatDateTime(d: Date, location: ObsLocation): string {
    return `${formatDateInLocation(d, location)} à ${formatTimeInLocation(d, location)}`;
}

/**
 * Bloc des horaires du phénomène.
 *
 * @param props - Étoile analysée, date, lieu et libellé du fuseau.
 * @returns L'encadré des horaires.
 */
export default function PhenomenonSchedule({ star: s, date, location, tzLabel }: PhenomenonScheduleProps) {
    // POURQUOI : midi local + 10 h ≈ 22 h, pour viser le cycle qui couvre la nuit sélectionnée.
    const nightTargetDate = new Date(getLocalNoonAtLongitude(date, location.lon).getTime() + 10 * 3600 * 1000);
    const phenom = getVariableStarPhenomenon(s, nightTargetDate);
    const { riseSet } = s.obs;

    return (
        <div className="space-y-3 rounded-lg border border-mp-glass-border bg-mp-ui-black/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-1.5 font-medium text-mp-text-heading">
                    <Calendar className="h-4 w-4 text-mp-accent" />
                    Horaire du phénomène ({tzLabel})
                </span>
                <span className="text-xs text-mp-text-muted">
                    Coordonnées : {location.name} ({location.lat.toFixed(2)}°, {location.lon.toFixed(2)}°)
                </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-sm border border-mp-glass-border bg-mp-bg-secondary/40 p-2.5">
                    <div className="mb-0.5 font-sans text-[11px] font-medium tracking-wider text-mp-text-muted uppercase">
                        {phenom ? phenom.startLabel : 'Début du phénomène'}
                    </div>
                    <div className="font-mono text-xs leading-tight font-semibold text-mp-text-body">
                        {phenom
                            ? formatDateTime(phenom.startDate, location)
                            : riseSet.circumpolar
                              ? 'Circumpolaire'
                              : riseSet.rise
                                ? formatDateTime(riseSet.rise, location)
                                : '—'}
                    </div>
                </div>
                <div className="rounded-sm border border-mp-accent/20 bg-mp-bg-secondary/40 p-2.5">
                    <div className="mb-0.5 font-sans text-[11px] font-medium tracking-wider text-mp-text-muted uppercase">
                        {phenom ? phenom.midLabel : 'Milieu du phénomène'}
                    </div>
                    <div className="font-mono text-xs leading-tight font-semibold text-mp-accent">
                        {phenom
                            ? formatDateTime(phenom.midDate, location)
                            : riseSet.transit
                              ? formatDateTime(riseSet.transit, location)
                              : '—'}
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] text-mp-text-muted">
                        {s.period
                            ? `Période : ${s.period < 1 ? (s.period * 24).toFixed(1) + ' h' : s.period.toFixed(2) + ' j'}`
                            : `Alt max: ${riseSet.maxAltDeg.toFixed(0)}°`}
                    </div>
                </div>
                <div className="rounded-sm border border-mp-glass-border bg-mp-bg-secondary/40 p-2.5">
                    <div className="mb-0.5 font-sans text-[11px] font-medium tracking-wider text-mp-text-muted uppercase">
                        {phenom ? phenom.endLabel : 'Fin du phénomène'}
                    </div>
                    <div className="font-mono text-xs leading-tight font-semibold text-mp-text-body">
                        {phenom
                            ? formatDateTime(phenom.endDate, location)
                            : riseSet.circumpolar
                              ? 'Non couchant'
                              : riseSet.set
                                ? formatDateTime(riseSet.set, location)
                                : '—'}
                    </div>
                </div>
            </div>

            <p className="flex items-start gap-1 text-xs text-mp-text-muted">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-mp-accent" />
                <span>
                    <strong>Fenêtre d'observation ce soir :</strong>{' '}
                    {riseSet.hoursAboveHorizonAtNight && riseSet.hoursAboveHorizonAtNight > 0
                        ? `${riseSet.hoursAboveHorizonAtNight.toFixed(1)}h exploitables de nuit (hauteur > 30°)`
                        : "Faible visibilité nocturne (< 30° d'altitude durant la nuit)"}
                </span>
            </p>
        </div>
    );
}
