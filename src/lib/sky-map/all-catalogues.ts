/**
 * Build-time loader that fetches every catalogue in parallel, applies the
 * shared FRENCH_NAMES + constellation enrichment, filters by magnitude to
 * keep the shipped JSON manageable, and returns a flat `Photo[]` ready for
 * the SkyMap container.
 */

import type { Photo } from '@/lib/photos';
import { CATALOGUES } from '@/lib/catalogues/registry';
import { fetchCatalogueEntries } from '@/lib/catalogues/fetch';
import { constellationFromCoords } from '@/lib/constellation-from-coords';
import { FRENCH_NAMES } from '@/data/common_names_fr';
import { catalogueEntryToPhoto } from './catalogue-to-photo';

interface Result {
    photos: Photo[];
    /** Per-catalogue retained entry counts (shortName → count). */
    counts: Record<string, number>;
}

/** Server-side magnitude cut. Keeps entries up to mag 12 so users can loosen
 *  the UI filter live without losing data. Entries without a magnitude are kept. */
const SERVER_MAG_LIMIT = 12;

/** Per-catalogue cap. Small curated lists (Messier, Caldwell, …) end up well
 *  below this so they're fully preserved; large lists (NGC, IC, UGC, …) keep
 *  their N brightest entries. This guarantees that filtering by a specific
 *  catalogue surfaces every entry that catalogue cares about. */
const PER_CATALOGUE_CAP = 500;

export async function fetchAllCataloguesAsPhotos(): Promise<Result> {
    const results = await Promise.all(CATALOGUES.map((c) => fetchCatalogueEntries(c.slug).catch(() => null)));

    const byId = new Map<string, Photo>();
    const counts: Record<string, number> = {};

    results.forEach((r, i) => {
        const cat = CATALOGUES[i];
        const eligible = (r?.entries ?? []).filter(
            (e) =>
                Number.isFinite(e.ra) &&
                Number.isFinite(e.dec) &&
                (typeof e.mag !== 'number' || e.mag <= SERVER_MAG_LIMIT),
        );

        // Sort brightest first; entries without magnitude rank last so they
        // don't crowd out useful targets in large catalogues.
        eligible.sort((a, b) => (a.mag ?? 99) - (b.mag ?? 99));
        const kept = eligible.slice(0, PER_CATALOGUE_CAP);

        for (const raw of kept) {
            const fr = FRENCH_NAMES[raw.id];
            const enriched = fr ? { ...raw, commonName: fr } : { ...raw };
            if (!enriched.constellation) {
                const c = constellationFromCoords(enriched.ra, enriched.dec);
                if (c) enriched.constellation = c;
            }
            // Dedupe by canonical id: Caldwell aliases NGC ids (Caldwell 20 ≡
            // NGC 7000, etc.), so the same sky object can appear in several
            // catalogues. Keep the first occurrence and merge catalogue tags.
            const existing = byId.get(enriched.id);
            if (existing) {
                if (!existing.catalogue?.includes(cat.shortName)) {
                    existing.catalogue = [...(existing.catalogue ?? []), cat.shortName];
                }
            } else {
                const photo = catalogueEntryToPhoto(enriched);
                photo.catalogue = [cat.shortName];
                byId.set(enriched.id, photo);
            }
        }
        counts[cat.shortName] = kept.length;
    });

    return { photos: [...byId.values()], counts };
}
