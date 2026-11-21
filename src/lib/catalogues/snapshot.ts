/**
 * Instantanés versionnés des catalogues du ciel profond.
 *
 * Responsabilité : lire `src/data/catalogues/<slug>.json`, généré par
 * `scripts/build/update-catalogue-snapshots.mjs`, pour que les pages ne dépendent pas de la
 * disponibilité du CDS (SIMBAD, VizieR) à l'exécution.
 *
 * POURQUOI un chargement paresseux : ces fichiers pèsent plusieurs Mo. Une route qui n'a besoin que
 * d'un catalogue ne doit pas les charger tous.
 */

import type { CatalogueEntry } from './fetch';

export interface CatalogueSnapshot {
    /** Date ISO de la génération. */
    generatedAt: string;
    entries: CatalogueEntry[];
}

const snapshotLoaders = import.meta.glob<CatalogueSnapshot>('/src/data/catalogues/*.json', { import: 'default' });

/**
 * Charge l'instantané d'un catalogue.
 *
 * @param slug - Slug du catalogue dans le registre.
 * @returns Les entrées, ou null si aucun instantané n'a encore été généré pour ce catalogue.
 */
export async function loadCatalogueSnapshot(slug: string): Promise<CatalogueEntry[] | null> {
    const loadSnapshot = snapshotLoaders[`/src/data/catalogues/${slug}.json`];
    if (!loadSnapshot) return null;
    const snapshot = await loadSnapshot();
    return snapshot.entries;
}
