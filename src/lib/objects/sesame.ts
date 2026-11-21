/**
 * CDS Sesame name resolver.
 *
 * Resolves an arbitrary catalogue identifier (M31, NGC 224, Sh2-155…) to
 * canonical name + ICRS J2000 coordinates by querying the union of SIMBAD,
 * NED and VizieR. Returns plain text in `-op` mode for trivial parsing. Routes come from
 * `src/config/upstream-routes.ts`.
 *
 * @see https://cds.unistra.fr/cgi-bin/Sesame
 */

import { UPSTREAM_TIMEOUT_MS } from '@/lib/api/http';
import { UpstreamHttpError, withUpstreamFailover } from '@/lib/upstream/failover';

export interface SesameResult {
    canonicalName: string;
    ra: number;
    dec: number;
    aliases: string[];
}

/**
 * Resolve a name to coordinates and aliases.
 * @param name catalogue identifier as typed by the user
 * @returns null when Sesame couldn't resolve the target
 * @throws {UpstreamUnavailableError} Si aucune route ne répond.
 */
export function resolveWithSesame(name: string): Promise<SesameResult | null> {
    return withUpstreamFailover(
        'sesame',
        async (route, timeoutMs) => {
            const res = await fetch(`${route.baseUrl}?${encodeURIComponent(name)}`, {
                headers: { Accept: 'text/plain' },
                signal: AbortSignal.timeout(timeoutMs),
            });
            if (!res.ok) throw new UpstreamHttpError('Sesame', res.status);
            return parseSesamePlainText(await res.text(), name);
        },
        { finalTimeoutMs: UPSTREAM_TIMEOUT_MS.lookup },
    );
}

function parseSesamePlainText(txt: string, fallbackName: string): SesameResult | null {
    // Sesame plain-text returns a section per database (Simbad, NED, VizieR)
    // each with its own %J, %I.0 (canonical for that source), %I … (cross-ids).
    // We keep the FIRST %I.0 (Simbad's canonical name) and collect every %I.*
    // line as alias since some sources only expose canonical entries.
    const lines = txt.split(/\r?\n/);
    let ra: number | null = null;
    let dec: number | null = null;
    let canonical: string | null = null;
    const aliases: string[] = [];

    for (const raw of lines) {
        const line = raw.trimEnd();
        if (!line || line.startsWith('#')) continue;
        if (line.startsWith('%J ')) {
            if (ra === null || dec === null) {
                const m = line.match(/^%J\s+(-?\d+(?:\.\d+)?)\s+([+-]?\d+(?:\.\d+)?)/);
                if (m) {
                    ra = parseFloat(m[1]);
                    dec = parseFloat(m[2]);
                }
            }
        } else if (line.startsWith('%I')) {
            // Matches %I, %I.0, %I.NEDh, %I.* etc. Capture the rest after the tag.
            const m = line.match(/^%I[^\s]*\s+(.+)$/);
            if (!m) continue;
            const id = m[1].trim();
            if (!id) continue;
            if (line.startsWith('%I.0 ') && !canonical) {
                canonical = id;
            }
            aliases.push(id);
        }
    }

    if (ra === null || dec === null) return null;
    if (!canonical && aliases.length) canonical = aliases[0];
    return {
        canonicalName: canonical ?? fallbackName,
        ra,
        dec,
        aliases: dedupe(aliases),
    };
}

function dedupe(arr: string[]): string[] {
    return Array.from(new Set(arr.map((s) => s.replace(/\s+/g, ' ').trim()))).filter(Boolean);
}
