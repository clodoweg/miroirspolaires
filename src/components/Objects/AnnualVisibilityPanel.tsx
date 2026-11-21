import { useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
import { useCollapsible } from '@/lib/useCollapsible';
import { annualVisibility, type ObsLocation } from '@/lib/objects/observation';

interface Props {
    ra: number;
    dec: number;
    location: ObsLocation;
    date: Date;
    magV?: number;
    diamArcmin?: number;
}

/** 0..1 quality score from a max-altitude-during-night value (degrees). */
function score(maxAltDeg: number): number {
    if (maxAltDeg <= 0) return 0;
    if (maxAltDeg >= 70) return 1;
    return maxAltDeg / 70;
}

/** Quality → CSS color (orange = poor, amber = fair, green = great). */
function qualityColor(q: number): string {
    if (q <= 0.05) return '#1f2937';
    // Interpolate from #b45309 (orange) → #f59e0b (amber) → #65a30d (green)
    if (q < 0.5) {
        const t = q / 0.5;
        return mix('#b45309', '#f59e0b', t);
    }
    const t = (q - 0.5) / 0.5;
    return mix('#f59e0b', '#65a30d', t);
}

function mix(a: string, b: string, t: number): string {
    const ah = a.replace('#', '');
    const bh = b.replace('#', '');
    const ar = parseInt(ah.slice(0, 2), 16);
    const ag = parseInt(ah.slice(2, 4), 16);
    const ab = parseInt(ah.slice(4, 6), 16);
    const br = parseInt(bh.slice(0, 2), 16);
    const bg = parseInt(bh.slice(2, 4), 16);
    const bb = parseInt(bh.slice(4, 6), 16);
    const r = Math.round(ar + (br - ar) * t);
    const g = Math.round(ag + (bg - ag) * t);
    const bx = Math.round(ab + (bb - ab) * t);
    return `rgb(${r},${g},${bx})`;
}

export default function AnnualVisibilityPanel({ ra, dec, location, date, magV, diamArcmin }: Props) {
    const months = useMemo(() => annualVisibility(ra, dec, location, date), [ra, dec, location, date]);
    const best = months.reduce((b, m) => (m.maxNightAltDeg > b.maxNightAltDeg ? m : b), months[0]);

    const fmt = new Intl.DateTimeFormat('fr-FR', { month: 'short' });
    const fmtFull = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });

    const startLabel = fmtFull.format(months[0].monthStart);
    const endLabel = fmtFull.format(months[months.length - 1].monthStart);

    const [expanded, setExpanded] = useCollapsible('obj-annual-visibility');

    return (
        <section className="space-y-3 rounded-lg border border-mp-glass-border bg-mp-glass-solid p-4">
            <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="flex w-full items-center justify-between gap-2 text-left"
            >
                <div className="space-y-1">
                    <h3 className="text-sm tracking-uppercase text-mp-text-secondary uppercase">
                        Visibilité {startLabel} → {endLabel}
                    </h3>
                    {!expanded && (
                        <p className="text-xs text-mp-text-muted">
                            {typeof magV === 'number' && (
                                <>
                                    m<sub>V</sub> = {magV.toFixed(1)}
                                </>
                            )}
                            {typeof diamArcmin === 'number' && diamArcmin > 0 && <> · ⌀ ≈ {diamArcmin.toFixed(0)}′</>}
                        </p>
                    )}
                </div>
                <ChevronDown
                    className={`h-4 w-4 shrink-0 text-mp-text-muted transition-transform ${expanded ? 'rotate-180' : ''}`}
                />
            </button>

            {expanded && (
                <>
                    <p className="text-xs text-mp-text-muted">
                        Hauteur maximale atteinte pendant la nuit astronomique (sun ≤ -12°).
                        {typeof magV === 'number' && (
                            <>
                                {' '}
                                · m<sub>V</sub> = {magV.toFixed(1)}
                            </>
                        )}
                        {typeof diamArcmin === 'number' && diamArcmin > 0 && <> · ⌀ ≈ {diamArcmin.toFixed(0)}′</>}
                    </p>

                    <div className="flex gap-1 overflow-x-auto pb-1 sm:grid sm:grid-cols-12 sm:overflow-visible sm:pb-0">
                        {months.map((m) => {
                            const q = score(m.maxNightAltDeg);
                            const isBest = m === best && best.visible;
                            return (
                                <div
                                    key={m.monthStart.toISOString()}
                                    className={`min-w-[2.8rem] shrink-0 overflow-hidden rounded-md p-2 text-center transition-transform hover:scale-105 sm:min-w-0 ${
                                        isBest ? 'ring-2 ring-mp-accent' : ''
                                    }`}
                                    style={{ backgroundColor: qualityColor(q) }}
                                    title={`${fmtFull.format(m.monthStart)} — alt max ${m.maxNightAltDeg.toFixed(0)}°`}
                                >
                                    <div className="w-full truncate text-[10px] tracking-wide text-white/80 uppercase">
                                        {fmt.format(m.monthStart).replace('.', '').slice(0, 4)}
                                    </div>
                                    <div className="w-full truncate font-mono text-xs text-white">
                                        {m.maxNightAltDeg > 0 ? `${m.maxNightAltDeg.toFixed(0)}°` : '—'}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {best?.visible && (
                        <p className="text-xs text-mp-text-body">
                            Meilleure période :{' '}
                            <span className="text-mp-accent">{fmtFull.format(best.monthStart)}</span> (culmination ≈{' '}
                            {best.maxNightAltDeg.toFixed(0)}° en pleine nuit).
                        </p>
                    )}
                </>
            )}
        </section>
    );
}
