import { describe, expect, it } from 'vitest';
import {
    classifyAnnotationSvg,
    describeAnnotationRun,
    formatAnnotationDate,
    latestAnnotationAttempt,
    matchesAnnotationFilter,
} from './annotation-source';

const OWN_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 2000" data-generator="annotate_astro" ' +
    'data-generated-at="2026-11-27T08:35:12Z" data-wcs-source="astrobin" data-objects="9" role="img" ' +
    'aria-label="Objets annotés : NGC 2014, NGC 2020">';

describe('classifyAnnotationSvg', () => {
    it('reconnaît un calque Miroirs Polaires et lit ses métadonnées', () => {
        expect(classifyAnnotationSvg(OWN_SVG)).toEqual({
            kind: 'miroirs',
            generatedAt: '2026-11-27T08:35:12Z',
            wcsSource: 'astrobin',
            objectCount: 9,
        });
    });

    it('compte les objets de l’aria-label sur les premiers calques, sans data-objects', () => {
        const head =
            '<svg viewBox="0 0 10 10" data-generator="annotate_astro" role="img" aria-label="Objets annotés : M 42, M 43, NGC 1977">';
        expect(classifyAnnotationSvg(head)).toEqual({ kind: 'miroirs', objectCount: 3 });
        expect(classifyAnnotationSvg('<svg data-generator="annotate_astro" aria-label="Objets annotés : ">')).toEqual({
            kind: 'miroirs',
            objectCount: 0,
        });
    });

    it('ignore une source de WCS inconnue ou vide', () => {
        const head = '<svg data-generator="annotate_astro" data-wcs-source="" data-objects="2">';
        expect(classifyAnnotationSvg(head)).toEqual({ kind: 'miroirs', objectCount: 2 });
    });

    it('distingue le SVG natif d’AstroBin de sa reconstruction locale', () => {
        expect(
            classifyAnnotationSvg(
                '<svg><title>PixInsight SVG Document</title><desc>Generated with PixInsight Core</desc>',
            ),
        ).toEqual({ kind: 'astrobin' });
        expect(
            classifyAnnotationSvg(
                '<svg><title>PixInsight SVG Document</title><desc>Generated with PixInsight Core 1.9.3 (x64) [Antigravity Local Generator]</desc>',
            ),
        ).toEqual({ kind: 'astrobin-local' });
    });

    it('signale un SVG d’origine inconnue', () => {
        expect(classifyAnnotationSvg('<svg viewBox="0 0 1 1"></svg>')).toEqual({ kind: 'unknown' });
    });
});

describe('latestAnnotationAttempt', () => {
    it('renvoie le passage le plus récent, rangé en premier', () => {
        const runs = {
            '42': [
                { at: '2026-11-27T10:00:00Z', status: 'ok' as const, objects: 4 },
                { at: '2026-11-26T16:07:58Z', status: 'failed' as const, reason: 'HTTP Error 429' },
            ],
        };
        expect(latestAnnotationAttempt(runs, '42')).toEqual({ at: '2026-11-27T10:00:00Z', status: 'ok', objects: 4 });
        expect(latestAnnotationAttempt(runs, '7')).toBeUndefined();
        expect(latestAnnotationAttempt({ '7': [] }, '7')).toBeUndefined();
    });
});

describe('filtres et libellés de la liste', () => {
    const own = { hasAnnotation: true, annotation: { kind: 'miroirs' as const } };
    const native = { hasAnnotation: true, annotation: { kind: 'astrobin' as const } };
    const local = { hasAnnotation: true, annotation: { kind: 'astrobin-local' as const } };
    const missing = { hasAnnotation: false };
    const failed = { ...native, annotationRun: { at: '2026-11-26T16:07:40Z', status: 'failed' as const } };
    const skipped = { ...own, annotationRun: { at: '2026-11-26T16:07:40Z', status: 'skipped' as const } };

    it('filtre selon l’origine du calque', () => {
        expect([own, native, local, missing].map((p) => matchesAnnotationFilter(p, 'annotation-miroirs'))).toEqual([
            true,
            false,
            false,
            false,
        ]);
        expect([own, native, local, missing].map((p) => matchesAnnotationFilter(p, 'annotation-not-miroirs'))).toEqual([
            false,
            true,
            true,
            true,
        ]);
        expect([own, native, local, missing].map((p) => matchesAnnotationFilter(p, 'annotation-astrobin'))).toEqual([
            false,
            true,
            true,
            false,
        ]);
    });

    it('retient les photos dont le dernier essai a échoué ou a été ignoré', () => {
        expect([own, failed, skipped].map((p) => matchesAnnotationFilter(p, 'annotation-failed'))).toEqual([
            false,
            true,
            true,
        ]);
    });

    it('décrit un passage et formate sa date', () => {
        expect(formatAnnotationDate('2026-11-26T16:07:40Z')).toBe('26/11/2026');
        expect(formatAnnotationDate('hier')).toBe('hier');
        expect(describeAnnotationRun({ at: '2026-11-26T16:07:40Z', status: 'failed', reason: 'HTTP Error 429' })).toBe(
            'Échec le 26/11/2026 : HTTP Error 429',
        );
        expect(describeAnnotationRun({ at: '2026-11-27T10:00:00Z', status: 'ok', objects: 9 })).toBe(
            'Réussi le 27/11/2026 : 9 objet(s)',
        );
        expect(describeAnnotationRun({ at: '2026-11-27T10:00:00Z', status: 'ok' })).toBe('Réussi le 27/11/2026');
        expect(describeAnnotationRun({ at: '2026-11-27T10:00:00Z', status: 'skipped' })).toBe('Ignorée le 27/11/2026');
    });
});
