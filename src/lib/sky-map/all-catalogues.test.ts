/**
 * Tests du chargeur de tous les catalogues pour la carte du ciel : filtre de
 * magnitude, tri, plafond par catalogue, enrichissement et dédoublonnage.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CatalogueEntry, CatalogueListing } from '@/lib/catalogues/fetch';
import { CATALOGUES, getCatalogue } from '@/lib/catalogues/registry';
import { fetchAllCataloguesAsPhotos } from './all-catalogues';

const fetchCatalogueEntries = vi.hoisted(() => vi.fn());

vi.mock('@/lib/catalogues/fetch', () => ({ fetchCatalogueEntries }));

function listing(slug: string, entries: CatalogueEntry[]): CatalogueListing {
    const def = getCatalogue(slug);
    if (!def) throw new Error(`catalogue inconnu : ${slug}`);
    return { catalogue: def, entries, total: entries.length };
}

describe('fetchAllCataloguesAsPhotos', () => {
    beforeEach(() => {
        fetchCatalogueEntries.mockReset();
    });

    it('filtre, trie, enrichit et fusionne les catalogues en photos uniques', async () => {
        const bySlug: Record<string, CatalogueEntry[]> = {
            messier: [
                { id: 'M 42', label: 'M 42', ra: 83.82, dec: -5.39, mag: 4 },
                { id: 'M 42', label: 'M 42 (doublon)', ra: 83.82, dec: -5.39, mag: 4.1 },
                { id: 'M 31', label: 'M 31', ra: 10.68, dec: 41.27, mag: 3.4, constellation: 'And' },
                { id: 'M 999', label: 'M 999', ra: Number.NaN, dec: 0, mag: 1 },
                { id: 'M 998', label: 'M 998', ra: 1, dec: 1, mag: 15 },
            ],
            caldwell: [
                { id: 'NGC 7000', label: 'NGC 7000', ra: 314.7, dec: 44.3 },
                { id: 'M 31', label: 'M 31', ra: 10.68, dec: 41.27, mag: 3.4 },
            ],
            ngc: [{ id: 'NGC 7000', label: 'NGC 7000', ra: 314.7, dec: 44.3, mag: 4 }],
        };
        fetchCatalogueEntries.mockImplementation(async (slug: string) => {
            if (slug === 'ic') throw new Error('VizieR indisponible');
            return listing(slug, bySlug[slug] ?? []);
        });

        const { photos, counts } = await fetchAllCataloguesAsPhotos();

        expect(fetchCatalogueEntries).toHaveBeenCalledTimes(CATALOGUES.length);
        expect(counts[getCatalogue('messier')?.shortName ?? '']).toBe(3);
        expect(counts[getCatalogue('caldwell')?.shortName ?? '']).toBe(2);
        expect(counts[getCatalogue('ic')?.shortName ?? '']).toBe(0);

        expect(photos.map((p) => p.slug)).toEqual(['M 31', 'M 42', 'NGC 7000']);
        const m31 = photos[0];
        expect(m31.title).toBe("M 31 — Galaxie d'Andromède");
        expect(m31.constellation).toBe('Andromède');
        expect(m31.catalogue).toEqual([getCatalogue('messier')?.shortName, getCatalogue('caldwell')?.shortName]);
        expect(photos[1].constellation).toBe('Orion');
        expect(photos[1].catalogue).toEqual([getCatalogue('messier')?.shortName]);
        expect(photos[2].catalogue).toEqual([getCatalogue('caldwell')?.shortName, getCatalogue('ngc')?.shortName]);
    });

    it('ne garde que les 500 entrées les plus brillantes d’un grand catalogue', async () => {
        const many: CatalogueEntry[] = Array.from({ length: 520 }, (_, i) => ({
            id: `UGC ${i}`,
            label: `UGC ${i}`,
            ra: (i * 0.5) % 360,
            dec: 10,
            mag: i === 0 ? undefined : 12 - i / 100,
        }));
        fetchCatalogueEntries.mockImplementation(async (slug: string) => listing(slug, slug === 'ugc' ? many : []));
        const { photos, counts } = await fetchAllCataloguesAsPhotos();
        expect(counts[getCatalogue('ugc')?.shortName ?? '']).toBe(500);
        expect(photos).toHaveLength(500);
        // L'entrée sans magnitude est classée en dernier, donc écartée par le plafond.
        expect(photos.some((p) => p.slug === 'UGC 0')).toBe(false);
    });
});
