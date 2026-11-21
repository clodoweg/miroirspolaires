import { tokens } from '@/styles/design-tokens';

/**
 * Miroirs Polaires - Theme Engine
 *
 * This file provides JavaScript access to design tokens.
 * The SINGLE SOURCE OF TRUTH is src/styles/design-tokens.ts.
 */

export const theme = {
    // === BACKGROUNDS ===
    bg: {
        primary: tokens.colors.bg.primary,
        secondary: tokens.colors.bg.secondary,
        glass: tokens.colors.bg.glass,
        glassSolid: tokens.colors.bg.glassSolid,
        uiBlack: tokens.colors.bg.uiBlack,
    },

    // === TEXT COLORS ===
    text: {
        heading: tokens.colors.text.heading,
        body: tokens.colors.text.body,
        muted: tokens.colors.text.muted,
    },

    // === ACCENT COLORS ===
    accent: {
        primary: tokens.colors.accent.primary,
        light: tokens.colors.accent.light,
        hover: tokens.colors.accent.hover,
        border: tokens.colors.accent.border,
        red: tokens.colors.accent.red,
    },

    // === BORDERS ===
    border: {
        subtle: tokens.colors.border.subtle,
        light: tokens.colors.border.light,
        accent: tokens.colors.border.accent,
    },

    chart: {
        grid: tokens.colors.border.light,
        cursor: tokens.charts.cursor,
    },

    // === CHART DATA COLORS (JS Values) ===
    chartData: {
        observatories: tokens.charts.observatories,
        locations: tokens.charts.locations,
        palette: tokens.charts.palette,
    },
} as const;

// Type for autocomplete support
export type Theme = typeof theme;

/**
 * Helper to create inline style object for glassmorphism panels
 */
export const glassStyle = {
    backgroundColor: theme.bg.glass,
    border: `1px solid ${theme.border.subtle}`,
};

/**
 * Shared section divider style — bottom border using the subtle border token.
 * Use this instead of writing `borderBottom: \`1px solid ${theme.border.subtle}\`` inline.
 */
export const dividerStyle = {
    borderBottom: `1px solid ${theme.border.subtle}`,
};

/**
 * Same as dividerStyle but for top borders (e.g. legend positioned below content).
 */
export const dividerTopStyle = {
    borderTop: `1px solid ${theme.border.subtle}`,
};

/**
 * Helper for toggle buttons (active/inactive states)
 * @param isActive - Whether the button is currently active/selected
 * @returns Inline style object with background and text color
 */
export const toggleButtonStyle = (isActive: boolean) => ({
    backgroundColor: isActive ? theme.accent.light : 'transparent',
    color: isActive ? theme.accent.primary : theme.text.muted,
});

/**
 * Ajoute une opacité à une couleur (Hex ou Variable CSS RGB Channels)
 * @param color Couleur hex (#RRGGBB)
 * @param alpha Opacité de 0 à 1
 */
export function withOpacity(color: string, alpha: number): string {
    // Si c'est hex
    if (color.startsWith('#')) {
        const cleanHex = color.slice(1);
        const r = parseInt(cleanHex.substring(0, 2), 16);
        const g = parseInt(cleanHex.substring(2, 4), 16);
        const b = parseInt(cleanHex.substring(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    // Fallback for non-hex colors (like rgba strings already)
    return color;
}

// Alias pour backward compatibility
export const hexToRgba = withOpacity;
