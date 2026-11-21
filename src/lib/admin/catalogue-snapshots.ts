/**
 * État des instantanés de catalogues pour l'admin.
 *
 * Responsabilité : comparer `src/data/catalogues/` au registre, pour que `/admin/database` montre
 * les catalogues encore servis par le CDS et non par un fichier versionné.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { CATALOGUES } from '@/lib/catalogues/registry';

export interface CatalogueSnapshotStatus {
    /** Nombre de catalogues du registre. */
    totalCount: number;
    /** Nombre de catalogues dotés d'un instantané lisible. */
    generatedCount: number;
    /** Nombre total d'entrées dans les instantanés. */
    entryCount: number;
    /** Poids cumulé des instantanés, en octets. */
    sizeBytes: number;
    /** Date ISO de la génération la plus récente, null s'il n'y a aucun instantané. */
    lastGeneratedAt: string | null;
    /** Catalogues sans instantané lisible, dans l'ordre du registre. */
    missing: { slug: string; shortName: string }[];
}

/**
 * Lit l'état des instantanés.
 *
 * @param rootDirectory - Racine du projet.
 * @returns L'état de chaque catalogue du registre, agrégé.
 */
export async function readCatalogueSnapshotStatus(rootDirectory: string): Promise<CatalogueSnapshotStatus> {
    const status: CatalogueSnapshotStatus = {
        totalCount: CATALOGUES.length,
        generatedCount: 0,
        entryCount: 0,
        sizeBytes: 0,
        lastGeneratedAt: null,
        missing: [],
    };

    for (const catalogue of CATALOGUES) {
        const snapshotPath = path.join(rootDirectory, 'src/data/catalogues', `${catalogue.slug}.json`);
        try {
            const content = await fs.readFile(snapshotPath, 'utf-8');
            const snapshot: { generatedAt: string; entries: unknown[] } = JSON.parse(content);
            status.generatedCount += 1;
            status.entryCount += snapshot.entries.length;
            status.sizeBytes += Buffer.byteLength(content);
            if (!status.lastGeneratedAt || snapshot.generatedAt > status.lastGeneratedAt) {
                status.lastGeneratedAt = snapshot.generatedAt;
            }
        } catch {
            // POURQUOI : un fichier absent ou illisible revient au même pour l'admin, le catalogue reste à générer.
            status.missing.push({ slug: catalogue.slug, shortName: catalogue.shortName });
        }
    }

    return status;
}
