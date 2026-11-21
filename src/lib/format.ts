/**
 * Shared formatting utilities used across the catalogue / recommendations / objet
 * UIs. All functions are deterministic and pure.
 */

/** Right ascension in compact form: "00h13m". Wraps at 24h. */
export function formatRa(deg: number): string {
    const total = (deg + 360) % 360;
    const h = total / 15;
    const hh = Math.floor(h);
    const m = Math.floor((h - hh) * 60);
    return `${hh.toString().padStart(2, '0')}h${m.toString().padStart(2, '0')}m`;
}

/** Right ascension in long form: "00h 13m 1.0s". */
export function formatRaLong(deg: number): string {
    const total = (deg + 360) % 360;
    const h = total / 15;
    const hh = Math.floor(h);
    const m = (h - hh) * 60;
    const mm = Math.floor(m);
    const s = (m - mm) * 60;
    return `${hh.toString().padStart(2, '0')}h ${mm.toString().padStart(2, '0')}m ${s.toFixed(1)}s`;
}

/** Declination in compact form: "+72°31′". */
export function formatDec(deg: number): string {
    const sign = deg >= 0 ? '+' : '−';
    const a = Math.abs(deg);
    const d = Math.floor(a);
    const m = Math.floor((a - d) * 60);
    return `${sign}${d.toString().padStart(2, '0')}°${m.toString().padStart(2, '0')}′`;
}

/** Declination in long form: "+72° 31′ 19.0″". */
export function formatDecLong(deg: number): string {
    const sign = deg >= 0 ? '+' : '−';
    const a = Math.abs(deg);
    const d = Math.floor(a);
    const minutesFloat = (a - d) * 60;
    const m = Math.floor(minutesFloat);
    const s = (minutesFloat - m) * 60;
    return `${sign}${d.toString().padStart(2, '0')}° ${m.toString().padStart(2, '0')}′ ${s.toFixed(1)}″`;
}

const MONTH_YEAR_FMT = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });
const DATE_LONG_FMT = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
});
const DATE_SHORT_FMT = new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
});

export const formatMonthYear = (d: Date) => MONTH_YEAR_FMT.format(d);
export const formatDateLong = (d: Date) => DATE_LONG_FMT.format(d);
export const formatDateShort = (d: Date) => DATE_SHORT_FMT.format(d);
