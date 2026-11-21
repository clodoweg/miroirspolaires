// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { computeReadingTime } from './reading-time';

const words = (count: number) => Array.from({ length: count }, () => 'mot').join(' ');

describe('computeReadingTime', () => {
    it('compte 200 mots par minute', () => {
        expect(computeReadingTime(words(400))).toBe('2 min');
        expect(computeReadingTime(words(1000))).toBe('5 min');
    });

    it('renvoie au moins une minute', () => {
        expect(computeReadingTime('')).toBe('1 min');
        expect(computeReadingTime('Trois petits mots')).toBe('1 min');
    });

    it('ne compte pas les images', () => {
        const image = `![${words(1000)}](/assets/blog/2026/a/photo.jpg)`;
        expect(computeReadingTime(`${words(400)}\n${image}`)).toBe('2 min');
    });
});
