import { describe, it, expect } from 'vitest';
import {
    getFlagUrl,
    getCountryIcon,
    getSeasonIcon,
    getCategoryIcon,
    COUNTRY_ISO,
    SEASON_ICONS,
    CATEGORY_ICONS,
} from './constants';

describe('getFlagUrl', () => {
    it('returns CDN SVG URL for known countries', () => {
        expect(getFlagUrl('Norvège')).toBe(`https://flagcdn.com/${COUNTRY_ISO['Norvège']}.svg`);
        expect(getFlagUrl('Islande')).toBe(`https://flagcdn.com/${COUNTRY_ISO['Islande']}.svg`);
        expect(getFlagUrl('Finlande')).toBe(`https://flagcdn.com/${COUNTRY_ISO['Finlande']}.svg`);
    });

    it('returns null for unknown country', () => {
        expect(getFlagUrl('Atlantide')).toBeNull();
        expect(getFlagUrl('')).toBeNull();
    });

    it('all COUNTRY_ISO entries produce a valid URL pattern', () => {
        for (const [country, iso] of Object.entries(COUNTRY_ISO)) {
            expect(getFlagUrl(country)).toBe(`https://flagcdn.com/${iso}.svg`);
        }
    });
});

describe('getCountryIcon', () => {
    it('always returns "globe" regardless of input', () => {
        expect(getCountryIcon('Norvège')).toBe('globe');
        expect(getCountryIcon('anything')).toBe('globe');
        expect(getCountryIcon('')).toBe('globe');
    });
});

describe('getSeasonIcon', () => {
    it('returns the correct icon for each defined season', () => {
        for (const [season, icon] of Object.entries(SEASON_ICONS)) {
            expect(getSeasonIcon(season)).toBe(icon);
        }
    });

    it('returns "calendar" fallback for unknown season', () => {
        expect(getSeasonIcon('Mousson')).toBe('calendar');
        expect(getSeasonIcon('')).toBe('calendar');
    });
});

describe('getCategoryIcon', () => {
    it('returns the correct icon for each defined category', () => {
        for (const [category, icon] of Object.entries(CATEGORY_ICONS)) {
            expect(getCategoryIcon(category)).toBe(icon);
        }
    });

    it('returns "tag" fallback for unknown category', () => {
        expect(getCategoryIcon('Inconnu')).toBe('tag');
        expect(getCategoryIcon('')).toBe('tag');
    });
});
