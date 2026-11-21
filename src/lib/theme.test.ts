import { describe, it, expect } from 'vitest';
import { theme, withOpacity, toggleButtonStyle, glassStyle, dividerStyle, dividerTopStyle } from './theme';
import { tokens } from '@/styles/design-tokens';

describe('Theme — token alignment', () => {
    it('theme values match design-tokens SSOT', () => {
        expect(theme.accent.red).toBe(tokens.colors.accent.red);
        expect(theme.accent.primary).toBe(tokens.colors.accent.primary);
        expect(theme.border.subtle).toBe(tokens.colors.border.subtle);
        expect(theme.bg.glass).toBe(tokens.colors.bg.glass);
        expect(theme.text.muted).toBe(tokens.colors.text.muted);
    });
});

describe('withOpacity', () => {
    it('converts a 6-digit hex color to rgba with the given alpha', () => {
        expect(withOpacity('#EF4444', 0.8)).toBe('rgba(239, 68, 68, 0.8)');
        expect(withOpacity('#FFFFFF', 1)).toBe('rgba(255, 255, 255, 1)');
        expect(withOpacity('#000000', 0)).toBe('rgba(0, 0, 0, 0)');
    });

    it('passes through non-hex strings (e.g. existing rgba) unchanged', () => {
        const rgba = 'rgba(21, 26, 37, 0.8)';
        expect(withOpacity(rgba, 0.5)).toBe(rgba);
    });

    it('theme.accent.red round-trips through withOpacity correctly', () => {
        const result = withOpacity(theme.accent.red, 0.6);
        expect(result).toMatch(/^rgba\(\d+, \d+, \d+, 0\.6\)$/);
    });
});

describe('toggleButtonStyle', () => {
    it('returns accent background and primary text when active', () => {
        const style = toggleButtonStyle(true);
        expect(style.backgroundColor).toBe(theme.accent.light);
        expect(style.color).toBe(theme.accent.primary);
    });

    it('returns transparent background and muted text when inactive', () => {
        const style = toggleButtonStyle(false);
        expect(style.backgroundColor).toBe('transparent');
        expect(style.color).toBe(theme.text.muted);
    });
});

describe('style helpers', () => {
    it('glassStyle references the glass background and subtle border tokens', () => {
        expect(glassStyle.backgroundColor).toBe(theme.bg.glass);
        expect(glassStyle.border).toContain(theme.border.subtle);
    });

    it('dividerStyle references the subtle border token as a bottom border', () => {
        expect(dividerStyle.borderBottom).toContain(theme.border.subtle);
    });

    it('dividerTopStyle references the subtle border token as a top border', () => {
        expect(dividerTopStyle.borderTop).toContain(theme.border.subtle);
    });

    it('dividerStyle and dividerTopStyle use the same color value', () => {
        // Both helpers reference theme.border.subtle — changing the token must update both
        const bottomColor = dividerStyle.borderBottom.match(/rgba\([^)]+\)/)?.[0];
        const topColor = dividerTopStyle.borderTop.match(/rgba\([^)]+\)/)?.[0];
        expect(bottomColor).toBe(topColor);
    });
});
