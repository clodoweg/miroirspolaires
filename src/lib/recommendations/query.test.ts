import { describe, it, expect } from 'vitest';
import { quantizeCoordinate, quantizeDateToHour } from './query';

describe('quantification des requêtes de recommandations', () => {
    it('arrondit les coordonnées au centième de degré', () => {
        expect(quantizeCoordinate(48.856613)).toBe(48.86);
        expect(quantizeCoordinate(-70.853)).toBe(-70.85);
        expect(quantizeCoordinate(2.3522)).toBe(2.35);
    });

    it('ramène la date au début de son heure UTC', () => {
        expect(quantizeDateToHour(new Date('2026-10-27T21:47:13.512Z')).toISOString()).toBe('2026-10-27T21:00:00.000Z');
    });

    it('donne la même clé pour deux visites de la même heure', () => {
        const first = quantizeDateToHour(new Date('2026-10-27T21:01:00Z')).toISOString();
        const second = quantizeDateToHour(new Date('2026-10-27T21:59:59Z')).toISOString();
        expect(first).toBe(second);
    });
});
