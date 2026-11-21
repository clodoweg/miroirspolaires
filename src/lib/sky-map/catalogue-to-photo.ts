/**
 * Adapt a catalogue entry into a synthetic `Photo` that the SkyMap components
 * can render natively. Thumbnails are pulled from CDS hips2fits, and clicks
 * are routed to the object explorer (`/objets?q=…`) instead of the personal
 * astrophotography pages.
 */

import type { Photo } from '@/lib/photos';
import type { CatalogueEntry } from '@/lib/catalogues/fetch';
import { hips2fitsUrl } from '@/lib/objects/hips2fits-url';
import { getConstellationName } from '@/lib/constellations';
import { typeLabel, categorize } from '@/lib/catalogues/classify';

/** Hash a string id to a stable positive integer (for the numeric Photo.id). */
function hashId(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    return Math.abs(h);
}

/** Compare two designations ignoring whitespace/case so "M  2" matches "M 2". */
function sameDesignation(a: string, b: string): boolean {
    const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();
    return norm(a) === norm(b);
}

export function catalogueEntryToPhoto(entry: CatalogueEntry): Photo {
    const titleParts = [entry.label];
    if (entry.commonName && !sameDesignation(entry.commonName, entry.label)) {
        titleParts.push(entry.commonName);
    }
    const title = titleParts.join(' — ');

    const constellation = entry.constellation ? getConstellationName(entry.constellation) : '';

    const detailedType = typeLabel(entry.type);
    return {
        id: hashId(entry.id),
        slug: entry.id,
        title,
        type: categorize(entry.type),
        constellation,
        observatories: [],
        locations: '',
        telescope: '',
        camera: '',
        mount: '',
        integrationTime: '',
        integrationSeconds: 0,
        uploaded: '',
        year: 0,
        ra: String(entry.ra),
        dec: String(entry.dec),
        raVal: entry.ra,
        decVal: entry.dec,
        description: entry.description ?? detailedType,
        objectsInField: [],
        astrobinUrl: '',
        acquisitionDetails: [],
        filters: [],
        filterString: '',
        imagePath: '',
        version: 'catalogue',
        thumbnailUrl: hips2fitsUrl({
            ra: entry.ra,
            dec: entry.dec,
            sizeArcmin: entry.sizeArcmin,
            sizePx: 200,
        }),
        href: `/objets?q=${encodeURIComponent(entry.id)}`,
        mag: typeof entry.mag === 'number' ? entry.mag : undefined,
    };
}
