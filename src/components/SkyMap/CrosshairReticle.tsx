import React from 'react';
import { theme, withOpacity } from '@/lib/theme';

interface Props {
    /**
     * Tailwind positioning classes applied to the outer wrapper.
     * @example "inset-0" (StaticSkyMap) or "top-[33.33%] left-1/2 -translate-x-1/2 -translate-y-1/2" (StellariumWrapper)
     */
    className?: string;
}

// Pre-computed color values derived from tokens.colors.accent.red so a single
// token change propagates to all usages across the sky map components.
const colorMain = withOpacity(theme.accent.red, 0.8);
const shadow = `0 0 8px ${withOpacity(theme.accent.red, 0.6)}`;
const shadowStrong = `0 0 12px ${withOpacity(theme.accent.red, 0.9)}`;

/**
 * Crosshair reticle overlay shared by StellariumWrapper and StaticSkyMap.
 * @param className - Tailwind positioning classes for the outer container
 * @returns Pointer-events-none SVG crosshair with glow effect
 */
export const CrosshairReticle: React.FC<Props> = ({ className = '' }) => (
    <div className={`pointer-events-none absolute z-0 flex items-center justify-center ${className}`}>
        <div className="relative flex h-16 w-16 items-center justify-center opacity-60">
            <div className="absolute h-px w-full" style={{ backgroundColor: colorMain, boxShadow: shadow }} />
            <div className="absolute h-full w-px" style={{ backgroundColor: colorMain, boxShadow: shadow }} />
            <div
                className="absolute h-8 w-8 rounded-full"
                style={{ border: `1px solid ${colorMain}`, boxShadow: shadow }}
            />
            <div
                className="absolute h-1 w-1 rounded-full"
                style={{ backgroundColor: theme.accent.red, boxShadow: shadowStrong }}
            />
        </div>
    </div>
);
