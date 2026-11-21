import { describe, it, expect } from 'vitest';
import {
    raToDegrees,
    decToDegrees,
    getUniqueTypes,
    getUniqueConstellations,
    getUniqueObservatories,
    getUniqueLocations,
    getUniqueTelescopes,
    getUniqueCameras,
    getUniqueMounts,
    getUniqueYears,
    getSimilarPhotos,
    photos,
} from './photos';

describe('Photo Library Utilities', () => {
    describe('raToDegrees', () => {
        it('converts HHh MMm SSs to degrees correctly', () => {
            // 12h 00m 00s = 180 degrees
            expect(raToDegrees('12h 00m 00s')).toBe(180);
            // 00h 00m 00s = 0 degrees
            expect(raToDegrees('00h 00m 00s')).toBe(0);
            // 20h 30m 00s = (20 + 30/60) * 15 = 20.5 * 15 = 307.5
            expect(raToDegrees('20h 30m 00s')).toBe(307.5);
        });

        it('returns null for Unknown or invalid strings', () => {
            expect(raToDegrees('Unknown')).toBeNull();
            expect(raToDegrees('')).toBeNull();
        });
    });

    describe('decToDegrees', () => {
        it('converts +DD° MM\' SS" to degrees correctly', () => {
            expect(decToDegrees('+45° 00\' 00"')).toBe(45);
            expect(decToDegrees('-45° 00\' 00"')).toBe(-45);
            // +10° 30' 00" = 10.5
            expect(decToDegrees('+10° 30\' 00"')).toBe(10.5);
        });

        it('returns null for Unknown or invalid strings', () => {
            expect(decToDegrees('Unknown')).toBeNull();
            expect(decToDegrees('')).toBeNull();
        });
    });

    // --- getUnique* helpers ---
    // These tests verify contract properties against the real CSV data.
    // Exact values are intentionally not asserted to stay data-agnostic.

    const uniqueHelpers = [
        { name: 'getUniqueTypes', fn: getUniqueTypes },
        { name: 'getUniqueConstellations', fn: getUniqueConstellations },
        { name: 'getUniqueObservatories', fn: getUniqueObservatories },
        { name: 'getUniqueLocations', fn: getUniqueLocations },
        { name: 'getUniqueTelescopes', fn: getUniqueTelescopes },
        { name: 'getUniqueCameras', fn: getUniqueCameras },
        { name: 'getUniqueMounts', fn: getUniqueMounts },
    ] as const;

    uniqueHelpers.forEach(({ name, fn }) => {
        describe(name, () => {
            it('returns an array with no duplicate values', () => {
                const result = fn();
                expect(Array.isArray(result)).toBe(true);
                expect(new Set(result).size).toBe(result.length);
            });

            it('excludes "Unknown" entries', () => {
                expect(fn().includes('Unknown')).toBe(false);
            });

            it('is sorted (using native .sort() order)', () => {
                const result = fn();
                // The source uses Array.sort() without a comparator, so we mirror that here
                expect([...result].sort()).toEqual(result);
            });
        });
    });

    describe('getUniqueYears', () => {
        it('returns numbers with no duplicates', () => {
            const years = getUniqueYears();
            expect(Array.isArray(years)).toBe(true);
            expect(new Set(years).size).toBe(years.length);
        });

        it('excludes year 0 (unparseable dates)', () => {
            expect(getUniqueYears().includes(0)).toBe(false);
        });

        it('is sorted descending (most recent first)', () => {
            const years = getUniqueYears();
            expect([...years].sort((a, b) => b - a)).toEqual(years);
        });
    });

    describe('getSimilarPhotos', () => {
        it('never includes the reference photo in results', () => {
            const photo = photos[0];
            const similar = getSimilarPhotos(photo, 5);
            expect(similar.every((p) => p.id !== photo.id)).toBe(true);
        });

        it('respects the limit parameter', () => {
            const photo = photos[0];
            expect(getSimilarPhotos(photo, 1).length).toBeLessThanOrEqual(1);
            expect(getSimilarPhotos(photo, 2).length).toBeLessThanOrEqual(2);
        });

        it('returns at most 3 results by default', () => {
            expect(getSimilarPhotos(photos[0]).length).toBeLessThanOrEqual(3);
        });

        it('matches by shared objectsInField when present', () => {
            // Find a photo that has objects in field
            const photoWithObjects = photos.find((p) => p.objectsInField.length > 0);
            if (!photoWithObjects) return; // skip if CSV has no objects data

            const similar = getSimilarPhotos(photoWithObjects, 10);
            // Every result must share at least one object with the reference
            similar.forEach((p) => {
                const hasSharedObject = p.objectsInField.some((obj) => photoWithObjects.objectsInField.includes(obj));
                expect(hasSharedObject).toBe(true);
            });
        });
    });
});
