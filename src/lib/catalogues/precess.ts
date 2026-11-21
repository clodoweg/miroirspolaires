/**
 * IAU 1976 precession (Lieske et al.) for equatorial coordinates.
 *
 * VizieR exposes catalogue coordinates in various reference epochs (B1875,
 * B1900, B1950, J2000). The Stellarium engine renders stars in J2000, so any
 * marker we place using a different-epoch RA/Dec ends up offset and "drifts"
 * relative to the background when the user pans.
 *
 * Magnitude of the offset:
 *  - B1950 → J2000: ~0.7°
 *  - B1900 → J2000: ~1.3°
 *  - B1875 → J2000: ~1.6°
 *
 * We treat Besselian and Julian epochs as equivalent here; the residual is
 * < 0.01° which is far below visual sky-map accuracy.
 */

const ARCSEC_TO_RAD = Math.PI / (180 * 3600);
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

/** Precess equatorial (RA, Dec) in degrees from `fromEpoch` to J2000. */
export function precessToJ2000(raDeg: number, decDeg: number, fromEpoch: number): { ra: number; dec: number } {
    const T0 = (fromEpoch - 2000) / 100; // Julian centuries J2000 → source
    const t = -T0; // centuries source → J2000 (positive when source < 2000)
    if (Math.abs(t) < 1e-6) return { ra: raDeg, dec: decDeg };

    // IAU 1976 precession angles (arcseconds).
    const zeta =
        (2306.2181 + 1.39656 * T0 - 0.000139 * T0 * T0) * t + (0.30188 - 0.000344 * T0) * t * t + 0.017998 * t * t * t;
    const z =
        (2306.2181 + 1.39656 * T0 - 0.000139 * T0 * T0) * t + (1.09468 + 0.000066 * T0) * t * t + 0.018203 * t * t * t;
    const theta =
        (2004.3109 - 0.8533 * T0 - 0.000217 * T0 * T0) * t - (0.42665 + 0.000217 * T0) * t * t - 0.041833 * t * t * t;

    const zetaR = zeta * ARCSEC_TO_RAD;
    const zR = z * ARCSEC_TO_RAD;
    const thetaR = theta * ARCSEC_TO_RAD;

    const ra0 = raDeg * D2R;
    const dec0 = decDeg * D2R;

    const A = Math.cos(dec0) * Math.sin(ra0 + zetaR);
    const B = Math.cos(thetaR) * Math.cos(dec0) * Math.cos(ra0 + zetaR) - Math.sin(thetaR) * Math.sin(dec0);
    const C = Math.sin(thetaR) * Math.cos(dec0) * Math.cos(ra0 + zetaR) + Math.cos(thetaR) * Math.sin(dec0);

    let raJ = (Math.atan2(A, B) + zR) * R2D;
    raJ = ((raJ % 360) + 360) % 360;
    const decJ = Math.asin(C) * R2D;
    return { ra: raJ, dec: decJ };
}

/** Source epoch (year) for each catalogue, used to precess to J2000. */
export const CATALOGUE_EPOCH: Record<string, number> = {
    // J2000 / equivalent → no precession needed
    messier: 2000,
    caldwell: 2000,
    ngc: 2000, // NGC 2000.0 (RAB2000 ≡ J2000 to < 0.01°)
    ic: 2000,
    arp: 2000,
    vdb: 2000, // VizieR _RA/_DE are SIMBAD-resolved J2000
    ocl: 2000,
    // Besselian epochs → need precession
    sharpless: 1900,
    lbn: 1950,
    barnard: 1875,
    ugc: 1950,
    rcw: 1950,
    hcg: 1950,
    ldn: 1950,
    ced: 1900,
    pn: 1950,
    aco: 1950,
    gc: 1950,
};
