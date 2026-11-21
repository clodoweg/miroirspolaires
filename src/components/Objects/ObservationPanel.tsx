import { useEffect, useMemo, useState } from 'react';
import { Sunrise, Sunset, ArrowUpToLine, Moon, Star, ChevronDown } from 'lucide-react';
import { useCollapsible } from '@/lib/useCollapsible';
import { observability, type ObsLocation } from '@/lib/objects/observation';

interface Props {
    ra: number;
    dec: number;
    location: ObsLocation;
    /** Reference date (typically from the date-picker). The displayed "now"
     *  values combine this date with the current local time of day. */
    date: Date;
}

const TAG_LABEL: Record<string, { text: string; color: string }> = {
    excellent: { text: 'Excellente cible', color: 'text-emerald-300' },
    correct: { text: 'Visible correctement', color: 'text-mp-accent' },
    bas: { text: "Bas sur l'horizon", color: 'text-amber-300' },
    circumpolaire: { text: 'Circumpolaire', color: 'text-emerald-300' },
    invisible: { text: 'Ne se lève jamais', color: 'text-mp-astro-red' },
    sous_horizon: { text: "Sous l'horizon", color: 'text-mp-text-muted' },
};

function formatTime(d: Date | undefined): string {
    if (!d) return '—';
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export default function ObservationPanel({ ra, dec, location, date }: Props) {
    const [expanded, setExpanded] = useCollapsible('obj-observation');
    // Tick once per minute so the live time-of-day stays fresh.
    const [tick, setTick] = useState(() => Date.now());
    useEffect(() => {
        const id = setInterval(() => setTick(Date.now()), 60_000);
        return () => clearInterval(id);
    }, []);

    // "Reference moment" = picked date + current local hour-of-day.
    const refMoment = useMemo(() => {
        const live = new Date(tick);
        const ref = new Date(date);
        ref.setHours(live.getHours(), live.getMinutes(), live.getSeconds(), 0);
        return ref;
    }, [date, tick]);

    const obs = useMemo(() => observability(ra, dec, location, refMoment), [ra, dec, location, refMoment]);
    const tag = TAG_LABEL[obs.tag] ?? TAG_LABEL.correct;

    return (
        <section className="space-y-4 rounded-lg border border-mp-glass-border bg-mp-glass-solid p-4">
            <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="flex w-full flex-wrap items-center justify-between gap-3 text-left"
            >
                <h2 className="text-sm tracking-uppercase text-mp-text-secondary uppercase">
                    Observation depuis {location.name}
                </h2>
                <div className="flex items-center gap-2">
                    <span className={`text-xs tracking-uppercase uppercase ${tag.color}`}>{tag.text}</span>
                    <ChevronDown
                        className={`h-4 w-4 shrink-0 text-mp-text-muted transition-transform ${expanded ? 'rotate-180' : ''}`}
                    />
                </div>
            </button>

            {expanded && (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                    <Stat
                        icon={<Sunrise className="h-4 w-4" />}
                        label="Lever"
                        value={
                            obs.riseSet.circumpolar
                                ? 'circumpolaire'
                                : obs.riseSet.neverRises
                                  ? '—'
                                  : formatTime(obs.riseSet.rise)
                        }
                    />
                    <Stat
                        icon={<ArrowUpToLine className="h-4 w-4" />}
                        label="Méridien"
                        value={
                            obs.riseSet.neverRises
                                ? '—'
                                : `${formatTime(obs.riseSet.transit)} · ${obs.riseSet.maxAltDeg.toFixed(0)}°`
                        }
                    />
                    <Stat
                        icon={<Sunset className="h-4 w-4" />}
                        label="Coucher"
                        value={
                            obs.riseSet.circumpolar
                                ? 'circumpolaire'
                                : obs.riseSet.neverRises
                                  ? '—'
                                  : formatTime(obs.riseSet.set)
                        }
                    />
                    <Stat
                        icon={<Moon className="h-4 w-4" />}
                        label="> 30°"
                        value={obs.riseSet.neverRises ? '0 h' : formatHours(obs.riseSet.hoursAboveHorizonAtNight ?? 0)}
                    />
                    <Stat
                        icon={<Star className="h-4 w-4" />}
                        label="Alt. max"
                        value={
                            typeof obs.riseSet.maxAltAtNightDeg === 'number'
                                ? `${obs.riseSet.maxAltAtNightDeg.toFixed(0)}° · ${formatTime(obs.riseSet.maxAltAtNightTime)}`
                                : '—'
                        }
                    />
                </div>
            )}
        </section>
    );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
    return (
        <div className="space-y-1 rounded-md border border-mp-glass-border bg-mp-glass-solid p-3">
            <div className="flex items-center gap-1.5 text-[11px] tracking-wide text-mp-text-muted uppercase">
                {icon}
                {label}
            </div>
            <div className="font-mono text-sm text-mp-text-primary">{value}</div>
        </div>
    );
}

function formatHours(h: number): string {
    const total = Math.max(0, Math.round(h * 60));
    const hh = Math.floor(total / 60);
    const mm = total % 60;
    return `${hh} h ${mm.toString().padStart(2, '0')}`;
}
