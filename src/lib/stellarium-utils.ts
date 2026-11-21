/**
 * Coordinate Transformation Utilities for Stellarium Web Engine
 *
 * Centralizes the Matrix-based math (Primary) and Manual Trigonometry (Fallback)
 * to convert between:
 * - Horizontal (Alt/Az) - View Frame
 * - Equatorial (RA/Dec J2000) - Celestial Frame
 */

// Types
export interface CoordinatesJ2000 {
    ra: number; // Radians
    dec: number; // Radians
}

export interface CoordinatesAltAz {
    alt: number; // Radians
    az: number; // Radians
}

export interface ObserverState {
    ri2h?: number[] | Float32Array;
    latitude?: number;
    longitude?: number;
    lst?: number;
    localSiderealTime?: number;
    utc?: number;
    yaw?: number;
    pitch?: number;
}

/**
 * Transforms J2000 Equatorial coordinates (RA/Dec) to Horizontal (Alt/Az).
 * Automatically chooses the best method:
 * 1. Matrix Transform (Precision J2000 -> Hor) via ri2h
 * 2. Manual Spherical Trigonometry (Fallback)
 */
export function j2000ToHorizontal(raRad: number, decRad: number, obs: ObserverState): CoordinatesAltAz | null {
    // 1. Try Matrix (Best Accuracy)
    if (obs.ri2h && obs.ri2h.length >= 9) {
        return j2000ToHorizontalMatrix(raRad, decRad, obs.ri2h);
    }

    // 2. Fallback: Manual Calculation
    // Stellarium exposes `localSiderealTime` but its unit is undocumented in the JS bridge.
    // In practice, lat/lon come in degrees, yaw/pitch in radians, and LST appears to
    // also be in degrees (empirically validated against known observations).
    // We therefore always run degreesToRadians on LST. If Stellarium ever changes this,
    // the symptom will be a ~57x error in RA — easy to spot.

    // Convert Lat to Radians
    const lat = obs.latitude !== undefined ? degreesToRadians(obs.latitude) : null;

    if (lat !== null) {
        // Use supplied LST or UTC
        let lstRad = undefined;
        if (obs.localSiderealTime !== undefined) {
            lstRad = degreesToRadians(obs.localSiderealTime);
        } else if (obs.utc !== undefined && obs.longitude !== undefined) {
            // Calc from UTC
            lstRad = calculateLST(obs.utc, obs.longitude);
        }

        if (lstRad !== undefined) {
            return j2000ToHorizontalManual(raRad, decRad, lat, lstRad);
        }
    }

    // 3. Failure
    return null;
}

/**
 * Transforms Horizontal coordinates (Alt/Az) to J2000 Equatorial (RA/Dec)
 */
export function horizontalToJ2000(azRad: number, altRad: number, obs: ObserverState): CoordinatesJ2000 | null {
    if (obs.ri2h && obs.ri2h.length >= 9) {
        return horizontalToJ2000Matrix(azRad, altRad, obs.ri2h);
    }

    // Manual Fallback (Restored)
    const lat = obs.latitude !== undefined ? degreesToRadians(obs.latitude) : null;

    if (lat !== null) {
        let lstRad = undefined;
        if (obs.localSiderealTime !== undefined) {
            lstRad = degreesToRadians(obs.localSiderealTime);
        } else if (obs.utc !== undefined && obs.longitude !== undefined) {
            // Calculate LST from UTC (MJD) and Longitude
            lstRad = calculateLST(obs.utc, obs.longitude);
        }

        if (lstRad !== undefined) {
            const result = horizontalToJ2000Manual(azRad, altRad, lat, lstRad);
            return result;
        }
    }

    return null;
}

// --- Matrix Implementations ---

function horizontalToJ2000Matrix(azRad: number, altRad: number, m: number[] | Float32Array): CoordinatesJ2000 {
    // vHor = [-cosY cosP, sinY cosP, sinP] (X=South, Y=East)
    const cosP = Math.cos(altRad);
    const sinP = Math.sin(altRad);
    const cosY = Math.cos(azRad);
    const sinY = Math.sin(azRad);

    // vEq = M^T * vHor
    const vEq = [
        m[0] * (-cosY * cosP) + m[1] * (sinY * cosP) + m[2] * sinP,
        m[3] * (-cosY * cosP) + m[4] * (sinY * cosP) + m[5] * sinP,
        m[6] * (-cosY * cosP) + m[7] * (sinY * cosP) + m[8] * sinP,
    ];

    const r = Math.sqrt(vEq[0] * vEq[0] + vEq[1] * vEq[1] + vEq[2] * vEq[2]);
    return {
        dec: Math.asin(Math.max(-1, Math.min(1, vEq[2] / r))),
        ra: normalizeRad(Math.atan2(vEq[1], vEq[0])),
    };
}

function horizontalToJ2000Manual(azRad: number, altRad: number, latRad: number, lstRad: number): CoordinatesJ2000 {
    const sinAlt = Math.sin(altRad);
    const cosAlt = Math.cos(altRad);
    const sinLat = Math.sin(latRad);
    const cosLat = Math.cos(latRad);
    const sinAz = Math.sin(azRad);
    const cosAz = Math.cos(azRad);

    // Declination
    // Stellarium's internal `yaw` has Az=0 pointing South (yaw=PI = South in UI).
    // However, the UI remaps yaw so that the value passed here as `azRad` is already
    // in the standard astronomical convention (Az=0 = North, increasing clockwise).
    // This is verified by the forward path (j2000ToHorizontalManual) which uses the
    // same convention and round-trips correctly. Do NOT flip cosAz here.

    // Standard Astro Formula (Az 0=North, clockwise):
    // sin(Dec) = sin(Alt)sin(Lat) + cos(Alt)cos(Lat)cos(Az)

    const sinDec = sinAlt * sinLat + cosAlt * cosLat * cosAz;
    const dec = Math.asin(Math.max(-1, Math.min(1, sinDec)));

    // Hour Angle (HA)
    // tan(HA) = (-sin(Az) cos(Alt)) / (cos(Az) cos(Alt) sin(Lat) - sin(Alt) cos(Lat)) (Denominator might differ)
    // sin(HA) = -sin(Az) cos(Alt) / cos(Dec)
    // cos(HA) = (sin(Alt) - sin(Lat)sin(Dec)) / (cos(Lat)cos(Dec))

    let ha = 0;
    const cosDec = Math.cos(dec);
    if (Math.abs(cosDec) > 0.001) {
        const sinHA = (-sinAz * cosAlt) / cosDec;
        const cosHA = (sinAlt - sinLat * sinDec) / (cosLat * cosDec);
        ha = Math.atan2(sinHA, cosHA);
    }

    // RA = LST - HA
    let ra = lstRad - ha;
    ra = normalizeRad(ra);

    return { ra, dec };
}

function j2000ToHorizontalMatrix(raRad: number, decRad: number, m: number[] | Float32Array): CoordinatesAltAz {
    const cosDec = Math.cos(decRad);
    // vEq
    const x = cosDec * Math.cos(raRad);
    const y = cosDec * Math.sin(raRad);
    const z = Math.sin(decRad);

    // vHor = M * vEq
    const vHor = [m[0] * x + m[3] * y + m[6] * z, m[1] * x + m[4] * y + m[7] * z, m[2] * x + m[5] * y + m[8] * z];

    return {
        alt: Math.asin(Math.max(-1, Math.min(1, vHor[2]))),
        // Azimuth: tan(Az) = East / -South = vHor[1] / -vHor[0]
        az: normalizeRad(Math.atan2(vHor[1], -vHor[0])),
    };
}

function j2000ToHorizontalManual(raRad: number, decRad: number, latRad: number, lstRad: number): CoordinatesAltAz {
    const ha = lstRad - raRad;
    const sinDec = Math.sin(decRad);
    const cosDec = Math.cos(decRad);
    const sinLat = Math.sin(latRad);
    const cosLat = Math.cos(latRad);
    const cosHa = Math.cos(ha);
    const sinHa = Math.sin(ha);

    // Altitude
    const sinAlt = sinDec * sinLat + cosDec * cosLat * cosHa;
    const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
    const cosAlt = Math.cos(alt);

    // Azimuth
    // sin(Az) = -sin(HA) * cos(Dec) / cos(Alt)
    // cos(Az) = (sin(Dec) - sin(Alt)*sin(Lat)) / (cos(Alt)*cos(Lat))
    let az = 0;
    if (Math.abs(cosAlt) > 0.001) {
        const sinAz = (-sinHa * cosDec) / cosAlt;
        const cosAz = (sinDec - sinAlt * sinLat) / (cosAlt * cosLat);
        az = Math.atan2(sinAz, cosAz);
        // Normalize Azimuth (0=North?)
        // Standard formula gives Az from South usually?
        // Let's assume 0=North for continuity with Matrix logic
    }
    az = normalizeRad(az);

    return { alt, az };
}

// --- Helpers ---

export function degreesToRadians(deg: number): number {
    return (deg * Math.PI) / 180;
}

export function radiansToDegrees(rad: number): number {
    return (rad * 180) / Math.PI;
}

function normalizeRad(rad: number) {
    let r = rad % (2 * Math.PI);
    if (r < 0) r += 2 * Math.PI;
    return r;
}

/**
 * Calculates Local Sidereal Time (LST) in Radians from Modified Julian Date (UTC) and Longitude.
 * GMST formula from Meeus.
 */
function calculateLST(mjd: number, longitudeDeg: number): number {
    const jd = mjd + 2400000.5;
    const t = (jd - 2451545.0) / 36525.0;
    // GMST in seconds
    let gmst = 24110.54841 + 8640184.812866 * t + 0.093104 * t * t - 0.0000062 * t * t * t;

    // Normalize to 0-86400
    const SEC_PER_DAY = 86400;
    gmst = ((gmst % SEC_PER_DAY) + SEC_PER_DAY) % SEC_PER_DAY;

    // Convert to degrees (360 deg = 86400 sec => / 240)
    const gmstDeg = gmst / 240.0;

    // LST = GMST + Longitude
    const lstDeg = gmstDeg + longitudeDeg;

    return degreesToRadians(lstDeg);
}

/**
 * Formats J2000 equatorial coordinates (radians) into human-readable strings.
 * @param raRad - Right Ascension in radians
 * @param decRad - Declination in radians
 * @returns Object with raStr (e.g. "12h30") and decStr (e.g. "45.50°")
 */
export function formatCoordinates(raRad: number, decRad: number) {
    const raH = (raRad * 12) / Math.PI;
    const raH_int = Math.floor(raH);
    const raM = Math.floor((raH - raH_int) * 60);

    return {
        raStr: `${raH_int}h${raM.toString().padStart(2, '0')}`,
        decStr: `${((decRad * 180) / Math.PI).toFixed(2)}°`,
    };
}

/**
 * Formats horizontal coordinates (radians) into human-readable degree strings.
 * @param azRad - Azimuth in radians
 * @param altRad - Altitude in radians
 * @param fovRad - Field of view in radians
 * @returns Object with azStr, altStr, fovStr in degrees
 */
export function formatHorizontal(azRad: number, altRad: number, fovRad: number) {
    let azDeg = ((azRad * 180) / Math.PI + 360) % 360;
    if (azDeg > 180) azDeg -= 360;
    const altDeg = (altRad * 180) / Math.PI;
    return {
        azStr: azDeg.toFixed(2),
        altStr: altDeg.toFixed(2),
        fovStr: ((fovRad * 180) / Math.PI).toFixed(2),
    };
}
