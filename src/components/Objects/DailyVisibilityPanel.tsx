import { useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
import { useCollapsible } from '@/lib/useCollapsible';
import {
    altitudeSeries,
    findBestMoment,
    azimuthCardinal,
    type ObsLocation,
    getObservatoryOffsetHours,
} from '@/lib/objects/observation';

interface Props {
    ra: number;
    dec: number;
    location: ObsLocation;
    date: Date;
    targetName: string;
    /** Optional V magnitude to colour the narrative */
    magV?: number;
    /** Optional photometric limiting magnitude (camera-based) — shown only when a camera is configured */
    magLim?: number;
    hideTitle?: boolean;
    transitStart?: Date;
    transitEnd?: Date;
    transitLabel?: string;
    transits?: Array<{ start: Date; end: Date; label?: string }>;
}

const W = 700;
const H = 220;
const PAD = { left: 36, right: 16, top: 28, bottom: 28 };

function formatHM(d: Date, loc: ObsLocation): string {
    const offsetHours = getObservatoryOffsetHours(loc, d);
    const localMs = d.getTime() + offsetHours * 3600000;
    const localDate = new Date(localMs);
    const hh = String(localDate.getUTCHours()).padStart(2, '0');
    const mm = String(localDate.getUTCMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
}

function formatLongDate(d: Date, loc: ObsLocation): string {
    const offsetHours = getObservatoryOffsetHours(loc, d);
    const localMs = d.getTime() + offsetHours * 3600000;
    const localDate = new Date(localMs);
    return localDate.toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
    });
}

/**
 * Map a sun altitude to a background brightness for the chart.
 * Day → light blue, civil → dusk, nautical → dark blue, astronomical → near-black.
 */
function sunShade(sunAlt: number): string {
    if (sunAlt > 0) return '#a3c9f7';
    if (sunAlt > -6) return '#7186b8';
    if (sunAlt > -12) return '#3b4778';
    if (sunAlt > -18) return '#1d2444';
    return '#080d1a';
}

export default function DailyVisibilityPanel({
    ra,
    dec,
    location,
    date,
    targetName,
    magV,
    magLim,
    hideTitle = false,
    transitStart,
    transitEnd,
    transitLabel,
    transits,
}: Props) {
    const series = useMemo(() => altitudeSeries(ra, dec, location, date, 192), [ra, dec, location, date]);
    const best = useMemo(() => findBestMoment(series), [series]);

    const t0 = series[0].time.getTime();
    const t1 = series[series.length - 1].time.getTime();

    const transitList = useMemo(() => {
        const list: Array<{ start: Date; end: Date; label?: string }> = [];
        if (transits && transits.length > 0) {
            list.push(...transits);
        } else if (transitStart && transitEnd) {
            list.push({ start: transitStart, end: transitEnd, label: transitLabel });
        }
        return list;
    }, [transits, transitStart, transitEnd, transitLabel]);

    const transitBands = useMemo(() => {
        return transitList
            .map((t) => {
                const tsMs = t.start.getTime();
                const teMs = t.end.getTime();
                if (teMs < t0 || tsMs > t1) return null;
                const startClip = Math.max(t0, tsMs);
                const endClip = Math.min(t1, teMs);
                const xStart = PAD.left + ((startClip - t0) / (t1 - t0)) * (W - PAD.left - PAD.right);
                const xEnd = PAD.left + ((endClip - t0) / (t1 - t0)) * (W - PAD.left - PAD.right);
                return {
                    x: xStart,
                    width: Math.max(1, xEnd - xStart),
                    label: t.label || 'Transit',
                };
            })
            .filter(Boolean) as Array<{ x: number; width: number; label: string }>;
    }, [transitList, t0, t1]);

    const xFor = (t: Date) => PAD.left + ((t.getTime() - t0) / (t1 - t0)) * (W - PAD.left - PAD.right);
    const yFor = (alt: number) => PAD.top + (1 - Math.max(-10, Math.min(90, alt)) / 90) * (H - PAD.top - PAD.bottom);

    // Build target altitude path — only render segments where the target is
    // above the horizon. We start a new sub-path each time the target rises.
    // POURQUOI : boucle plutôt que map avec closure, pour ne pas réassigner `started`
    // depuis une fonction (règle react-hooks/immutability).
    const pathSegments: string[] = [];
    let started = false;
    for (const s of series) {
        if (s.targetAltDeg <= 0) {
            started = false;
            continue;
        }
        const cmd = started ? 'L' : 'M';
        started = true;
        pathSegments.push(`${cmd} ${xFor(s.time).toFixed(1)} ${yFor(s.targetAltDeg).toFixed(1)}`);
    }
    const path = pathSegments.join(' ');

    // Build twilight bands (one rect per sample to render the shading gradient)
    const sliceW = (W - PAD.left - PAD.right) / (series.length - 1);
    const bands = series
        .slice(0, -1)
        .map((s, i) => (
            <rect
                key={i}
                x={xFor(s.time)}
                y={PAD.top}
                width={sliceW + 0.6}
                height={H - PAD.top - PAD.bottom}
                fill={sunShade(s.sunAltDeg)}
            />
        ));

    // Y-axis ticks every 30°
    const yTicks = [0, 30, 60, 90];

    // X-axis ticks every 3 hours
    const xTicks: { t: Date; label: string }[] = [];
    for (let i = 0; i <= 8; i++) {
        const t = new Date(t0 + ((t1 - t0) * i) / 8);
        xTicks.push({ t, label: formatHM(t, location) });
    }

    // Narrative
    const summary = best
        ? `Meilleur moment : ${formatHM(best.time, location)} · ${azimuthCardinal(best.azDeg)} à ${best.altDeg.toFixed(0)}° de hauteur`
        : `${targetName} ne s'élève pas suffisamment cette nuit.`;

    const [expanded, setExpanded] = useCollapsible('obj-daily-visibility');

    return (
        <section className="space-y-3 rounded-lg border border-mp-glass-border bg-mp-glass-solid p-4">
            <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="flex w-full items-center justify-between gap-2 text-left"
            >
                <div className="space-y-1">
                    {!hideTitle && (
                        <h3 className="text-sm tracking-uppercase text-mp-text-secondary uppercase">
                            Visibilité {formatLongDate(date, location)}
                        </h3>
                    )}
                    <p className="text-xs text-mp-text-body">
                        {summary}
                        {typeof magV === 'number' && (
                            <span className="text-mp-text-muted">
                                {' '}
                                · m<sub>V</sub> = {magV.toFixed(1)}
                            </span>
                        )}
                        {/* POURQUOI: Magnitude limite photométrique affichée uniquement si une caméra est configurée par l'utilisateur. */}
                        {typeof magLim === 'number' && (
                            <span className="text-mp-text-muted">
                                {' '}
                                · m<sub>lim</sub> = {magLim.toFixed(1)}
                            </span>
                        )}
                    </p>
                </div>
                <ChevronDown
                    className={`h-4 w-4 shrink-0 text-mp-text-muted transition-transform ${expanded ? 'rotate-180' : ''}`}
                />
            </button>

            {expanded && (
                <div className="overflow-hidden rounded-md border border-mp-glass-border">
                    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full">
                        {bands}

                        {/* Transit / Phenomenon period overlays */}
                        {transitBands.map((band, idx) => (
                            <g key={idx}>
                                <rect
                                    x={band.x}
                                    y={PAD.top}
                                    width={band.width}
                                    height={H - PAD.top - PAD.bottom}
                                    fill="rgba(168, 85, 247, 0.22)"
                                    stroke="rgba(192, 132, 252, 0.55)"
                                    strokeWidth={1}
                                    strokeDasharray="3,3"
                                />
                                {band.width >= 35 && (
                                    <text
                                        x={band.x + band.width / 2}
                                        y={PAD.top + 14}
                                        textAnchor="middle"
                                        fontSize={9}
                                        fontWeight="bold"
                                        fill="#e9d5ff"
                                        className="tracking-widest uppercase"
                                    >
                                        {band.label}
                                    </text>
                                )}
                            </g>
                        ))}

                        {/* Horizon line */}
                        <line
                            x1={PAD.left}
                            y1={yFor(0)}
                            x2={W - PAD.right}
                            y2={yFor(0)}
                            stroke="rgba(255,255,255,0.45)"
                            strokeDasharray="3,3"
                        />

                        {/* Y grid + labels */}
                        {yTicks.map((alt) => (
                            <g key={alt}>
                                <line
                                    x1={PAD.left}
                                    y1={yFor(alt)}
                                    x2={W - PAD.right}
                                    y2={yFor(alt)}
                                    stroke="rgba(255,255,255,0.06)"
                                />
                                <text
                                    x={PAD.left - 6}
                                    y={yFor(alt) + 4}
                                    textAnchor="end"
                                    fontSize={10}
                                    fill="rgba(255,255,255,0.55)"
                                >
                                    {alt}°
                                </text>
                            </g>
                        ))}

                        {/* Target curve */}
                        <path d={path} fill="none" stroke="#facc15" strokeWidth={2} />

                        {/* Best moment marker */}
                        {best && (
                            <g>
                                <line
                                    x1={xFor(best.time)}
                                    y1={PAD.top}
                                    x2={xFor(best.time)}
                                    y2={H - PAD.bottom}
                                    stroke="#ef4444"
                                    strokeOpacity={0.6}
                                    strokeDasharray="2,2"
                                />
                                <circle
                                    cx={xFor(best.time)}
                                    cy={yFor(best.altDeg)}
                                    r={5}
                                    fill="#facc15"
                                    stroke="#fff"
                                />
                            </g>
                        )}

                        {/* X labels */}
                        {xTicks.map((tk, i) => (
                            <text
                                key={i}
                                x={xFor(tk.t)}
                                y={H - 8}
                                textAnchor="middle"
                                fontSize={10}
                                fill="rgba(255,255,255,0.6)"
                            >
                                {tk.label}
                            </text>
                        ))}
                    </svg>
                </div>
            )}

            {expanded && (
                <div className="flex flex-wrap items-center gap-4 text-[10px] text-mp-text-muted">
                    <LegendSwatch color="#a3c9f7" label="Jour" />
                    <LegendSwatch color="#7186b8" label="Crépuscule civil" />
                    <LegendSwatch color="#3b4778" label="Crép. nautique" />
                    <LegendSwatch color="#1d2444" label="Crép. astro" />
                    <LegendSwatch color="#080d1a" label="Nuit" />
                </div>
            )}
        </section>
    );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
    return (
        <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: color }} />
            {label}
        </span>
    );
}
