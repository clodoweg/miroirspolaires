import { describe, it, expect } from 'vitest';
import { formatDate } from './date';

describe('formatDate', () => {
    it('formats a Date object to French string', () => {
        // Use local date constructor to avoid UTC timezone issues
        expect(formatDate(new Date(2024, 5, 14))).toBe('14 juin 2024');
        expect(formatDate(new Date(2023, 0, 1))).toBe('1 janvier 2023');
    });

    it('formats ISO string (YYYY-MM-DD)', () => {
        const result = formatDate('2024-06-14');
        expect(result).toContain('juin');
        expect(result).toContain('2024');
    });

    it('formats DD/MM/YYYY (AstroBin CSV format)', () => {
        const result = formatDate('14/06/2024');
        expect(result).toContain('juin');
        expect(result).toContain('2024');
    });

    it('returns raw string as fallback for invalid input', () => {
        expect(formatDate('not-a-date')).toBe('not-a-date');
        expect(formatDate('invalid/date/here')).toBe('invalid/date/here');
    });

    it('handles partial DD/MM/YYYY gracefully (not 3 parts)', () => {
        // Single-slash input falls back to Date constructor → likely invalid
        const result = formatDate('06/2024');
        // Should either return the raw string or a date — just should not throw
        expect(typeof result).toBe('string');
    });
});
