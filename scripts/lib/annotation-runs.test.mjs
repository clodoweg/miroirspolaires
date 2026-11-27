import { describe, expect, it } from 'vitest';
import { MAX_ATTEMPTS_PER_PHOTO, mergeAnnotationReport, summarizeAnnotationReport } from './annotation-runs.mjs';

const REPORT = {
    runAt: '2026-11-27T10:00:00Z',
    photos: {
        123: { status: 'ok', objects: 9, wcsSource: 'astrobin' },
        456: { status: 'failed', reason: 'HTTP Error 429: Too Many Requests' },
        789: { status: 'skipped', reason: 'aucune solution astrométrique' },
    },
};

describe('mergeAnnotationReport', () => {
    it('ajoute chaque passage en tête de l’historique de sa photo', () => {
        const history = { 456: [{ at: '2026-11-26T16:07:58Z', status: 'failed', reason: 'HTTP Error 429' }] };
        const { history: next, added } = mergeAnnotationReport(history, REPORT);
        expect(added).toBe(3);
        expect(next['123']).toEqual([{ at: REPORT.runAt, status: 'ok', objects: 9, wcsSource: 'astrobin' }]);
        expect(next['456']).toEqual([
            { at: REPORT.runAt, status: 'failed', reason: 'HTTP Error 429: Too Many Requests' },
            { at: '2026-11-26T16:07:58Z', status: 'failed', reason: 'HTTP Error 429' },
        ]);
        expect(next['789'][0]).toEqual({
            at: REPORT.runAt,
            status: 'skipped',
            reason: 'aucune solution astrométrique',
        });
        expect(history['456']).toHaveLength(1);
    });

    it('ne fusionne pas deux fois le même rapport', () => {
        const once = mergeAnnotationReport({}, REPORT).history;
        const twice = mergeAnnotationReport(once, REPORT);
        expect(twice.added).toBe(0);
        expect(twice.history).toEqual(once);
    });

    it(`garde ${MAX_ATTEMPTS_PER_PHOTO} passages au plus par photo`, () => {
        let history = {};
        for (let day = 1; day <= MAX_ATTEMPTS_PER_PHOTO + 2; day++) {
            const runAt = `2026-11-${String(day).padStart(2, '0')}T00:00:00Z`;
            history = mergeAnnotationReport(history, { runAt, photos: { 1: { status: 'ok' } } }).history;
        }
        expect(history['1']).toHaveLength(MAX_ATTEMPTS_PER_PHOTO);
        expect(history['1'][0].at).toBe('2026-11-07T00:00:00Z');
    });

    it('écarte les entrées invalides et les rapports sans date', () => {
        expect(mergeAnnotationReport({}, { photos: REPORT.photos }).added).toBe(0);
        expect(mergeAnnotationReport({}, null).added).toBe(0);
        const { history, added } = mergeAnnotationReport(
            {},
            {
                runAt: REPORT.runAt,
                photos: { abc: { status: 'ok' }, 1: { status: 'bizarre' }, 2: null, 3: { status: 'ok', reason: '' } },
            },
        );
        expect(added).toBe(1);
        expect(history).toEqual({ 3: [{ at: REPORT.runAt, status: 'ok' }] });
    });
});

describe('summarizeAnnotationReport', () => {
    it('compte les photos par statut', () => {
        expect(summarizeAnnotationReport(REPORT)).toEqual({ ok: 1, skipped: 1, failed: 1 });
        expect(summarizeAnnotationReport(undefined)).toEqual({ ok: 0, skipped: 0, failed: 0 });
    });
});
