import { describe, it, expect } from 'vitest';
import { aggregateByGroup, aggregateTimeSeries, aggregateHeatmap, getFilterType } from './chartUtils';
import type { Photo } from '@/lib/photos';

describe('Chart Utilities', () => {
    const mockPhotos: Partial<Photo>[] = [
        {
            year: 2023,
            type: 'Galaxie',
            acquisitionDetails: [{ filter: 'Ha', number: 10, duration: 600 }],
            integrationSeconds: 6000,
        },
        {
            year: 2023,
            type: 'Nébuleuse',
            acquisitionDetails: [{ filter: 'OIII', number: 5, duration: 600 }],
            integrationSeconds: 3000,
        },
        {
            year: 2022,
            type: 'Galaxie',
            acquisitionDetails: [{ filter: 'L', number: 20, duration: 300 }],
            integrationSeconds: 6000,
        },
    ];

    describe('getFilterType', () => {
        it('resolves common filters correctly', () => {
            expect(getFilterType('Hydrogen Alpha')).toBe('Ha');
            expect(getFilterType('Oxygen III')).toBe('OIII');
            expect(getFilterType('Luminance')).toBe('L');
            expect(getFilterType('Unknown')).toBe('Autre');
        });
    });

    describe('aggregateByGroup', () => {
        it('aggregates total integration in HOURS by type', () => {
            const result = aggregateByGroup(mockPhotos as Photo[], 'type');
            expect(result).toHaveLength(2);
            expect(result[0].name).toBe('Galaxie');
            // (6000 + 6000) / 3600 = 12000 / 3600 = 3.333
            expect(result[0].value).toBeCloseTo(3.333, 3);
            expect(result[1].name).toBe('Nébuleuse');
            expect(result[1].value).toBeCloseTo(0.833, 3); // 3000 / 3600
        });
    });

    describe('aggregateTimeSeries', () => {
        it('aggregates data for time series (Year)', () => {
            const { data, series } = aggregateTimeSeries(mockPhotos as Photo[], 'year', 'type');
            expect(data).toHaveLength(2); // 2022 and 2023
            expect(series).toContain('Galaxie');
            expect(series).toContain('Nébuleuse');

            const data2023 = data.find((d) => d.x === '2023');
            expect(data2023?.Galaxie).toBeCloseTo(1.667, 3);
            expect(data2023?.Nébuleuse).toBeCloseTo(0.833, 3);
        });
    });

    describe('aggregateHeatmap', () => {
        it('aggregates data for heatmap (Year vs Type)', () => {
            const { data, xValues, yValues } = aggregateHeatmap(mockPhotos as Photo[], 'year', 'type');
            expect(xValues).toContain('2022');
            expect(xValues).toContain('2023');
            expect(yValues).toContain('Galaxie');
            expect(yValues).toContain('Nébuleuse');

            const cell = data.find((d) => d.x === '2023' && d.y === 'Galaxie');
            expect(cell?.value).toBeCloseTo(1.667, 3);
        });
    });
});
