import { tokens } from './src/styles/design-tokens';
import { legacyFontSize, legacyPalette, legacyProseColors } from './src/styles/tailwind-v3-defaults.mjs';

/**
 * =============================================================================
 * MIROIRS POLAIRES - TAILWIND CONFIGURATION
 * =============================================================================
 *
 * This configuration defines the design system tokens for the site.
 * It consumes tokens from src/styles/design-tokens.ts (Single Source of Truth).
 *
 * Tailwind 4 : ce fichier ne porte plus que le thème ; il est chargé par `@config` dans
 * src/styles/base.css, qui déclare aussi les sources (@source), les variantes (@custom-variant),
 * les utilitaires (@utility) et le plugin typography (@plugin).
 *
 * See docs/style-guide.md for complete documentation.
 * =============================================================================
 * @type {import('tailwindcss').Config}
 */
export default {
    theme: {
        extend: {
            colors: {
                // POURQUOI : Tailwind 4 a redéfini sa palette en oklch ; on garde les teintes hexadécimales de la v3.
                ...legacyPalette,
                mp: {
                    // Surfaces & Backgrounds
                    bg: 'var(--color-mp-bg)',
                    'bg-secondary': 'var(--color-mp-bg-secondary)',
                    'ui-black': 'var(--color-mp-ui-black)',

                    // Glass & Effects
                    'glass-bg': 'var(--color-mp-glass-bg)',
                    'glass-solid': 'var(--color-mp-glass-solid)',
                    'glass-hover': 'var(--color-mp-glass-hover)',
                    'glass-border': 'var(--color-mp-border)',
                    'glass-hover-border': 'var(--color-mp-border-hover)',

                    // Text
                    text: {
                        heading: 'var(--color-mp-text-heading)',
                        primary: 'var(--color-mp-text-primary)',
                        secondary: 'var(--color-mp-text-secondary)',
                        body: 'var(--color-mp-text-body)',
                        muted: 'var(--color-mp-text-muted)',
                        link: 'var(--color-mp-text-link)',
                        'link-hover': 'var(--color-mp-text-link-hover)',
                    },

                    // Borders
                    border: 'var(--color-mp-border)',
                    'border-hover': 'var(--color-mp-border-hover)',
                    'border-accent': 'var(--color-mp-border-accent)',
                    'border-light': 'var(--color-mp-border-light)',

                    // Accents
                    accent: 'var(--color-mp-accent)',
                    brand: 'var(--color-mp-brand)',
                    'astro-red': 'var(--color-mp-astro-red)',

                    // Legacy/Component specific
                    'card-bg': 'var(--color-mp-glass-bg)',
                    'accent-light': 'var(--color-mp-accent-light)',
                    'accent-hover': 'var(--color-mp-accent-hover)',
                    'accent-border': 'var(--color-mp-accent-border)',
                    surface: 'var(--color-mp-surface)',
                    'surface-header': 'var(--color-mp-bg)',

                    // Static colors
                    'deep-space': 'var(--color-mp-deep-space)',
                    'ice-paper': 'var(--color-mp-ice-paper)',
                },
            },
            spacing: {
                // Layout Tokens
                'header-offset': tokens.spacing.headerOffset,
                navbar: tokens.spacing.navbar,
                'navbar-mobile': tokens.spacing.navbarMobile,
                breadcrumb: tokens.spacing.breadcrumb,
                'floating-menu': tokens.spacing.floatingMenu,

                // Touch Tokens
                touch: tokens.spacing.touch,
                'touch-comfort': tokens.spacing.touchComfort,
                'touch-icon': tokens.spacing.touchIcon,
                'gallery-gap': tokens.component.gallery.gap,
            },
            borderRadius: tokens.borderRadius,
            transitionDuration: {
                // ...tokens.transitions (spread not supported in some key contexts, listing explicitly)
                micro: tokens.transitions.micro,
                fast: tokens.transitions.fast,
                base: tokens.transitions.base,
                slow: tokens.transitions.slow,
                slower: tokens.transitions.slower,
                slowest: tokens.transitions.slowest,
                extended: tokens.transitions.extended,
                counter: tokens.transitions.counter,
            },
            transitionTimingFunction: {
                'mp-ease': tokens.transitions.ease,
                'ease-out': tokens.transitions.easeOut,
                'ease-in': tokens.transitions.easeIn,
                'ease-in-out': tokens.transitions.easeInOut,
                'ease-out-back': tokens.transitions.easeOutBack,
                'ease-spring': tokens.transitions.spring,
            },
            fontFamily: tokens.typography.fonts,

            // Typography Enriched
            fontSize: {
                // POURQUOI : interlignes absolus de la v3 (la v4 les exprime en ratio).
                ...legacyFontSize,
                // Scales responsive
                'hero-mobile': tokens.typography.scales.hero.mobile,
                'hero-tablet': tokens.typography.scales.hero.tablet,
                'hero-desktop': tokens.typography.scales.hero.desktop,
                'h1-mobile': tokens.typography.scales.h1.mobile,
                'h1-tablet': tokens.typography.scales.h1.tablet,
                'h1-desktop': tokens.typography.scales.h1.desktop,
                'h2-mobile': tokens.typography.scales.h2.mobile,
                'h2-tablet': tokens.typography.scales.h2.tablet,
                'h2-desktop': tokens.typography.scales.h2.desktop,
                'h3-mobile': tokens.typography.scales.h3.mobile,
                'h3-tablet': tokens.typography.scales.h3.tablet,
                'h3-desktop': tokens.typography.scales.h3.desktop,
                'xs-mobile': tokens.typography.scales.xs.mobile,
                'xs-tablet': tokens.typography.scales.xs.tablet,
                'xs-desktop': tokens.typography.scales.xs.desktop,
                'micro-mobile': tokens.typography.scales.micro.mobile,
                'micro-tablet': tokens.typography.scales.micro.tablet,
                'micro-desktop': tokens.typography.scales.micro.desktop,
            },
            lineHeight: tokens.typography.lineHeight,
            letterSpacing: tokens.typography.letterSpacing,

            height: {
                chart: tokens.component.chart.height,
                'chart-lg': tokens.component.chart.heightLg,
                'chart-sm': tokens.component.chart.heightSm,
                'gallery-row': tokens.component.gallery.rowHeight.desktop,
                'gallery-row-mobile': tokens.component.gallery.rowHeight.mobile,
            },
            maxWidth: {
                container: tokens.spacing.container,
            },
            minHeight: {
                touch: tokens.spacing.touch,
                'touch-comfort': tokens.spacing.touchComfort,
                '1/2-dvh': '50dvh',
                dvh: '100dvh',
                chart: tokens.component.chart.height,
                'chart-lg': tokens.component.chart.heightLg,
                'chart-sm': tokens.component.chart.heightSm,
            },
            minWidth: {
                touch: tokens.spacing.touch,
                'chart-tooltip': tokens.component.chart.tooltipWidth,
            },
            opacity: tokens.effects.opacity,
            scale: tokens.effects.scale,
            aspectRatio: {
                photo: '3 / 2',
            },
            boxShadow: {
                hero: tokens.boxShadow.hero,
                floating: 'var(--shadow-floating)',
                'floating-inverse': 'var(--shadow-floating-inverse)',
                'card-hover': 'var(--shadow-card-hover)',
                glow: tokens.boxShadow.glow,
                'glow-strong': tokens.boxShadow.glowStrong,
                'glow-subtle': tokens.boxShadow.glowSubtle,
            },
            backgroundImage: {
                'gradient-champagne': tokens.gradients.champagne,
                'gradient-champagne-v': tokens.gradients.champagneVertical,
                'gradient-overlay': tokens.gradients.overlay,
                'gradient-overlay-compact': tokens.gradients.overlayCompact,
                'gradient-overlay-light': tokens.gradients.overlayLight,
                'gradient-overlay-top': tokens.gradients.overlayTop,
                'gradient-deep-space': tokens.gradients.deepSpace,
                'gradient-shimmer': tokens.gradients.shimmer,
                'radial-glow': tokens.gradients.radialGlow,
            },
            screens: tokens.screens,
            zIndex: tokens.zIndex,
            keyframes: tokens.animations.keyframes,
            animation: tokens.animations.utilities,
            component: tokens.component,
            typography: (theme) => ({
                // POURQUOI : le plugin lit la palette oklch de Tailwind 4 ; on rétablit les gris de la v3.
                slate: { css: legacyProseColors('slate') },
                DEFAULT: {
                    css: {
                        ...legacyProseColors('gray'),
                        a: {
                            color: 'inherit',
                            textDecoration: 'underline',
                            textUnderlineOffset: '4px',
                            textDecorationThickness: '1px',
                            textDecorationColor: `color-mix(in srgb, currentColor 40%, transparent)`,
                            transitionProperty: 'color, text-decoration-color',
                            transitionDuration: theme('transitionDuration.base'),
                            '&:hover': {
                                color: theme('colors.mp.accent'),
                                textDecorationColor: theme('colors.mp.accent'),
                            },
                        },
                    },
                },
            }),
        },
    },
};
