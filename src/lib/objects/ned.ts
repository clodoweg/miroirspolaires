/**
 * NED ObjectLookup client.
 *
 * Queries the NASA/IPAC Extragalactic Database object name interpreter to
 * obtain the preferred name, equatorial position, redshift and object type
 * for extragalactic targets (galaxies, AGN, quasars). Useful complement to
 * SIMBAD whose redshift coverage is incomplete.
 *
 * @see https://ned.ipac.caltech.edu/Documents/Guides/Interface/ObjectLookup
 */

import { UPSTREAM_TIMEOUT_MS } from '@/lib/api/http';

const ENDPOINT = 'https://ned.ipac.caltech.edu/srs/ObjectLookup';

export interface NedData {
    /** Preferred (canonical) name in NED */
    preferredName: string;
    /** Position J2000 in decimal degrees */
    coords?: { ra: number; dec: number };
    /** Redshift z (heliocentric) */
    redshift?: number;
    /** Redshift uncertainty */
    redshiftUncertainty?: number;
    /** NED object type code (G, GClstr, GPair, QSO, RadioS, …) */
    objType?: string;
    /** Bibliographic ref code for the redshift */
    redshiftRef?: string;
}

/**
 * Look up an object in NED. Returns null when the name is unknown or the
 * service errors out (non-fatal at the caller level).
 * @param name catalogue identifier
 */
export async function fetchNed(name: string): Promise<NedData | null> {
    const body = new URLSearchParams({
        json: JSON.stringify({ name: { v: name } }),
    });
    const res = await fetch(ENDPOINT, {
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS.lookup),
        method: 'POST',
        body,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
        },
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    if (data?.ResultCode !== 3 || !data?.Preferred?.Name) return null;

    const pref = data.Preferred;
    const out: NedData = {
        preferredName: String(pref.Name),
    };
    if (pref.Position && typeof pref.Position.RA === 'number' && typeof pref.Position.Dec === 'number') {
        out.coords = { ra: pref.Position.RA, dec: pref.Position.Dec };
    }
    if (pref.Redshift && typeof pref.Redshift.Value === 'number') {
        out.redshift = pref.Redshift.Value;
        if (typeof pref.Redshift.Uncertainty === 'number') out.redshiftUncertainty = pref.Redshift.Uncertainty;
        if (pref.Redshift.RefCode) out.redshiftRef = String(pref.Redshift.RefCode);
    }
    if (pref.ObjType?.Value) out.objType = String(pref.ObjType.Value);
    return out;
}
