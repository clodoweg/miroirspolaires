// @vitest-environment node
/**
 * Tests de la lecture de l'état des instantanés de catalogues.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CATALOGUES } from '@/lib/catalogues/registry';
import { readCatalogueSnapshotStatus } from './catalogue-snapshots';

describe('readCatalogueSnapshotStatus', () => {
    let rootDirectory: string;

    const writeSnapshot = (slug: string, content: string) => {
        writeFileSync(path.join(rootDirectory, 'src/data/catalogues', `${slug}.json`), content);
    };

    beforeEach(() => {
        rootDirectory = mkdtempSync(path.join(tmpdir(), 'catalogue-snapshots-'));
        mkdirSync(path.join(rootDirectory, 'src/data/catalogues'), { recursive: true });
    });

    afterEach(() => {
        rmSync(rootDirectory, { recursive: true, force: true });
    });

    it('signale tous les catalogues comme manquants sans instantané', async () => {
        const status = await readCatalogueSnapshotStatus(rootDirectory);
        expect(status.generatedCount).toBe(0);
        expect(status.lastGeneratedAt).toBeNull();
        expect(status.missing).toHaveLength(CATALOGUES.length);
    });

    it('agrège les instantanés et garde la génération la plus récente', async () => {
        const messier = JSON.stringify({ generatedAt: '2026-11-01T00:00:00.000Z', entries: [{}, {}] });
        writeSnapshot('messier', messier);
        writeSnapshot('caldwell', JSON.stringify({ generatedAt: '2026-11-04T00:00:00.000Z', entries: [{}] }));

        const status = await readCatalogueSnapshotStatus(rootDirectory);
        expect(status.generatedCount).toBe(2);
        expect(status.entryCount).toBe(3);
        expect(status.sizeBytes).toBeGreaterThan(messier.length);
        expect(status.lastGeneratedAt).toBe('2026-11-04T00:00:00.000Z');
        expect(status.missing.map((catalogue) => catalogue.slug)).not.toContain('messier');
    });

    it('compte un fichier illisible comme manquant', async () => {
        writeSnapshot('messier', '{ tronqué');
        const status = await readCatalogueSnapshotStatus(rootDirectory);
        expect(status.generatedCount).toBe(0);
        expect(status.missing.map((catalogue) => catalogue.slug)).toContain('messier');
    });
});
