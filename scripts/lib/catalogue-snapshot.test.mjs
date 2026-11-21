/**
 * Tests de la validation et de la sérialisation des instantanés de catalogues.
 */

import { describe, it, expect } from 'vitest';
import { findSnapshotRejection, serializeSnapshot } from './catalogue-snapshot.mjs';

const entry = (id = 'M 1') => ({ id, ra: 83.6, dec: 22 });

describe('findSnapshotRejection', () => {
    it('accepte une première génération', () => {
        expect(findSnapshotRejection([entry()], null)).toBeNull();
    });

    it('refuse une liste vide, même avec --force', () => {
        expect(findSnapshotRejection([], null, true)).toBe('liste vide');
    });

    it('refuse des coordonnées invalides, même avec --force', () => {
        expect(findSnapshotRejection([{ id: 'M 2', ra: NaN, dec: 0 }], null, true)).toContain('M 2');
    });

    it('refuse une liste nettement plus courte que la précédente, sauf avec --force', () => {
        const entries = Array.from({ length: 80 }, () => entry());
        expect(findSnapshotRejection(entries, 100)).toContain('80 entrées');
        expect(findSnapshotRejection(entries, 100, true)).toBeNull();
    });

    it('tolère une légère baisse', () => {
        expect(
            findSnapshotRejection(
                Array.from({ length: 90 }, () => entry()),
                100,
            ),
        ).toBeNull();
    });
});

describe('serializeSnapshot', () => {
    it('produit un JSON valide sans le champ interne de tri', () => {
        const parsed = JSON.parse(serializeSnapshot([{ ...entry(), _idx: 3 }], '2026-11-04T00:00:00.000Z'));
        expect(parsed).toEqual({ generatedAt: '2026-11-04T00:00:00.000Z', entries: [entry()] });
    });
});
