/**
 * Contrôle des instantanés versionnés de `src/data/catalogues/` et de leur chargement.
 */

import { describe, it, expect } from 'vitest';
import { loadCatalogueSnapshot } from './snapshot';
import { getCatalogue } from './registry';

const snapshotFiles = Object.keys(import.meta.glob('/src/data/catalogues/*.json'));
const slugOf = (file: string) => file.split('/').pop()!.replace('.json', '');

describe('instantanés de catalogues', () => {
    it('renvoie null pour un catalogue sans instantané', async () => {
        expect(await loadCatalogueSnapshot('inconnu')).toBeNull();
    });

    it.each(snapshotFiles.map(slugOf))(
        '%s : correspond au registre et contient des positions valides',
        async (slug) => {
            expect(getCatalogue(slug)).toBeDefined();
            const entries = (await loadCatalogueSnapshot(slug)) ?? [];
            expect(entries.length).toBeGreaterThan(0);
            for (const entry of entries) {
                expect(entry.id).toBeTruthy();
                expect(entry.ra).toBeGreaterThanOrEqual(0);
                expect(entry.ra).toBeLessThanOrEqual(360);
                expect(Math.abs(entry.dec)).toBeLessThanOrEqual(90);
            }
        },
    );
});
