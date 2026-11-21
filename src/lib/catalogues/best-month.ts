/**
 * Compute the ideal observation month for a deep-sky object given the
 * observer's latitude. "Ideal" = the month during which the object transits
 * the meridian around local midnight (opposition for non-solar targets),
 * giving the longest time above horizon during astronomical night.
 *
 * Approximation: vernal equinox falls on day-of-year 80 (≈ March 21) when
 * the Sun has RA = 0°. Sun RA progresses ≈ 360° / 365.25 days.
 */

const MONTHS_FR_SHORT = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jui', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

export interface BestMonth {
    /** 1-based month index (1 = January). Undefined when the object never reaches a usable altitude. */
    monthIndex?: number;
    /** Short French label ("Mai", "—" when not visible). */
    label: string;
    /** Maximum altitude reached at transit, in degrees. */
    maxAltitudeDeg: number;
}

/** Day-of-year (1..365) when the Sun has the given RA (degrees, 0..360). */
function dayOfYearForSunRa(sunRaDeg: number): number {
    const ra = ((sunRaDeg % 360) + 360) % 360;
    return 80 + (ra / 360) * 365.25;
}

/** Convert a day-of-year (1..366) to (month, day). Non-leap year. */
function dayOfYearToMonthDay(d: number): { month: number; day: number } {
    const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let n = ((((d - 1) % 365) + 365) % 365) + 1;
    for (let m = 0; m < 12; m++) {
        if (n <= days[m]) return { month: m + 1, day: Math.floor(n) };
        n -= days[m];
    }
    return { month: 12, day: 31 };
}

export function bestObservationMonth(raDeg: number, decDeg: number, observerLatDeg: number): BestMonth {
    // Max altitude at transit = 90° − |observerLat − dec|.
    const maxAlt = 90 - Math.abs(observerLatDeg - decDeg);
    if (!Number.isFinite(maxAlt) || maxAlt < 20) {
        return { label: '—', maxAltitudeDeg: maxAlt };
    }
    const sunRa = (((raDeg - 180) % 360) + 360) % 360;
    const d = dayOfYearForSunRa(sunRa);
    const { month } = dayOfYearToMonthDay(d);
    return {
        monthIndex: month,
        label: MONTHS_FR_SHORT[month - 1],
        maxAltitudeDeg: maxAlt,
    };
}
