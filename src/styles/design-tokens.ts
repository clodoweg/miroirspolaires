/**
 * =============================================================================
 * MIROIRS POLAIRES - DESIGN TOKENS (SSOT)
 * =============================================================================
 *
 * Ce fichier est la SOURCE DE VÉRITÉ UNIQUE (Single Source of Truth) pour
 * l'ensemble du système de design.
 *
 * Il est consommé par :
 * 1. tailwind.config.mjs - Pour la génération des classes utilitaires CSS.
 * 2. src/lib/theme.ts - Pour l'accès JS (Graphiques, Styles dynamiques).
 *
 * TOUTES les valeurs de design (couleurs, espacements, transitions) doivent être
 * définies ici en priorité.
 * =============================================================================
 */

export const themeTokens = {
    light: {
        colors: {
            bg: {
                primary: '#F8F9FA', // Albâtre doux / Soft Alabaster
                secondary: '#FFFFFF', // Blanc pur / Pure White
                uiBlack: '#FFFFFF', // Surface claire pour navbar, footer et menus
                glass: 'rgba(255, 255, 255, 0.85)',
                glassSolid: '#FFFFFF',
                glassHover: 'rgba(241, 245, 249, 0.95)',
                surface: 'rgba(0, 0, 0, 0.04)',
            },
            text: {
                heading: '#0F172A', // Anthracite profond (Slate 900)
                primary: '#0F172A',
                secondary: '#334155', // Gris ardoise lisible (Slate 700)
                body: '#334155',
                muted: '#64748B', // Gris neutre (Slate 500)
                link: '#334155',
                linkHover: '#9A6A15', // Ambre bronze céleste
            },
            border: {
                subtle: 'rgba(0, 0, 0, 0.08)',
                hover: 'rgba(0, 0, 0, 0.18)',
                light: 'rgba(0, 0, 0, 0.12)',
                accent: 'rgba(154, 106, 21, 0.35)',
                brand: '#9A6A15',
            },
            accent: {
                primary: '#9A6A15', // Ambre bronze céleste (WCAG AA 4.8:1 sur fond clair)
                brand: '#9A6A15',
                light: 'rgba(154, 106, 21, 0.12)',
                hover: 'rgba(154, 106, 21, 0.08)',
                border: 'rgba(154, 106, 21, 0.3)',
                red: '#DC2626', // Astro Red lisible sur fond clair
            },
            deepSpace: '#FFFFFF',
            icePaper: '#F1F5F9',
        },
        shadows: {
            floating: '0 4px 20px -5px rgba(15, 23, 42, 0.08)',
            floatingInverse: '0 -4px 20px -5px rgba(15, 23, 42, 0.08)',
            cardHover: '0 20px 30px -10px rgba(15, 23, 42, 0.12)',
        },
        grainOpacity: '0.02',
    },
    dark: {
        colors: {
            bg: {
                primary: '#141414', // Deep Navy / Espace profond
                secondary: '#0A0A0A', // Near Black
                uiBlack: '#050505', // Pure Black
                glass: 'rgba(21, 26, 37, 0.8)',
                glassSolid: '#141414',
                glassHover: 'rgba(30, 37, 53, 0.8)',
                surface: 'rgba(255, 255, 255, 0.03)',
            },
            text: {
                heading: '#EBEBE6', // Blanc cassé
                primary: '#EBEBE6',
                secondary: '#D1D5DB', // Gris argent
                body: '#D1D5DB',
                muted: '#8A8A85', // Gris neutre
                link: '#D1D5DB',
                linkHover: '#D4B483', // Champagne Gold
            },
            border: {
                subtle: 'rgba(255, 255, 255, 0.05)',
                hover: 'rgba(255, 255, 255, 0.15)',
                light: 'rgba(255, 255, 255, 0.2)',
                accent: 'rgba(212, 180, 131, 0.3)',
                brand: '#D4B483',
            },
            accent: {
                primary: '#D4B483', // Champagne Gold
                brand: '#D4B483',
                light: 'rgba(212, 180, 131, 0.2)',
                hover: 'rgba(212, 180, 131, 0.1)',
                border: 'rgba(212, 180, 131, 0.3)',
                red: '#EF4444', // Astro Red
            },
            deepSpace: '#050505',
            icePaper: '#F0F4F8',
        },
        shadows: {
            floating: '0 4px 20px -5px rgba(0, 0, 0, 0.5)',
            floatingInverse: '0 -4px 20px -5px rgba(0, 0, 0, 0.5)',
            cardHover: '0 20px 30px -10px rgba(0, 0, 0, 0.7)',
        },
        grainOpacity: '0.03',
    },
};

export const tokens = {
    colors: themeTokens.light.colors,

    spacing: {
        headerOffset: '100px',
        navbar: '56px',
        navbarMobile: '64px', // New
        breadcrumb: '44px',
        floatingMenu: '60px',
        container: '1400px',

        // Touch targets (Apple HIG / Material Design)
        touch: '48px', // Minimum touch target
        touchComfort: '56px', // Zone confort recommandée
        touchIcon: '44px', // Icons seuls

        // Safe areas
        safeTop: 'env(safe-area-inset-top)',
        safeBottom: 'env(safe-area-inset-bottom)',
        safeLeft: 'env(safe-area-inset-left)',
        safeRight: 'env(safe-area-inset-right)',
    },

    borderRadius: {
        none: '0',
        sm: '0.25rem', // 4px
        md: '0.5rem', // 8px
        lg: '1rem', // 16px
        xl: '1.5rem', // 24px
        '2xl': '2rem', // 32px
        full: '9999px',
    },

    transitions: {
        micro: '100ms',
        fast: '150ms',
        base: '200ms',
        slow: '300ms',
        slower: '400ms',
        slowest: '600ms',
        extended: '1500ms',
        counter: '2000ms',

        // Easings
        ease: 'cubic-bezier(0.16, 1, 0.3, 1)', // Standard
        easeOut: 'cubic-bezier(0.33, 1, 0.68, 1)', // Decelerate
        easeIn: 'cubic-bezier(0.32, 0, 0.67, 0)', // Accelerate
        easeInOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
        easeOutBack: 'cubic-bezier(0.34, 1.56, 0.64, 1)', // Overshoot
        spring: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)', // Bounce
    },

    // ============================================
    // TYPOGRAPHY SCALES (Mobile → Tablet → Desktop)
    // ============================================

    typography: {
        fonts: {
            sans: ['Inter', 'sans-serif'],
            serif: ['"Playfair Display"', 'serif'],
            mono: ['"JetBrains Mono"', 'monospace'],
        },
        scales: {
            hero: {
                mobile: '3.25rem', // 52px
                tablet: '4rem', // 64px
                desktop: '5.5rem', // 88px
            },
            h1: {
                mobile: '2rem', // 32px
                tablet: '2.5rem', // 40px
                desktop: '3.75rem', // 60px
            },
            h2: {
                mobile: '1.5rem', // 24px
                tablet: '2rem', // 32px
                desktop: '2.5rem', // 40px
            },
            h3: {
                mobile: '1.35rem', // 21.6px
                tablet: '1.75rem', // 28px
                desktop: '2rem', // 32px
            },
            body: {
                mobile: '1rem', // 16px
                tablet: '1rem', // 16px
                desktop: '1.125rem', // 18px
            },
            small: {
                mobile: '0.875rem', // 14px
                tablet: '0.875rem', // 14px
                desktop: '0.875rem', // 14px
            },
            xs: {
                mobile: '0.75rem', // 12px
                tablet: '0.75rem', // 12px
                desktop: '0.75rem', // 12px
            },
            micro: {
                mobile: '0.65rem', // 10.4px
                tablet: '0.65rem', // 10.4px
                desktop: '0.65rem', // 10.4px
            },
        },
        lineHeight: {
            tight: '1.1',
            snug: '1.25',
            normal: '1.5',
            relaxed: '1.75',
        },
        letterSpacing: {
            tight: '-0.02em',
            normal: '0',
            wide: '0.05em',
            wider: '0.1em',
            /** Uppercase section labels (h2 panneau, kicker, CTA pill). */
            uppercase: '0.2em',
        },
    },

    effects: {
        scale: {
            '103': '1.03',
            hover: '1.01', // 1.01
            'card-hover': '1.05', // 1.05
        },
        opacity: {
            grain: '0.02',
        },
    },

    animations: {
        keyframes: {
            blob: {
                '0%': { transform: 'translate(0px, 0px) scale(1)' },
                '33%': { transform: 'translate(30px, -50px) scale(1.1)' },
                '66%': { transform: 'translate(-20px, 20px) scale(0.9)' },
                '100%': { transform: 'translate(0px, 0px) scale(1)' },
            },
            heroFadeIn: {
                from: { opacity: '0', transform: 'translateY(20px)' },
                to: { opacity: '1', transform: 'translateY(0)' },
            },
            arrowBounceLeft: {
                '0%, 100%': { transform: 'translateX(0)' },
                '50%': { transform: 'translateX(-4px)' },
            },
            arrowBounceRight: {
                '0%, 100%': { transform: 'translateX(0)' },
                '50%': { transform: 'translateX(4px)' },
            },
        },
        utilities: {
            blob: 'blob 15s infinite',
            heroFadeIn: 'heroFadeIn 800ms ease-out forwards',
            'arrow-bounce-left': 'arrowBounceLeft 0.6s ease infinite',
            'arrow-bounce-right': 'arrowBounceRight 0.6s ease infinite',
        },
    },

    // ============================================
    // GRADIENTS
    // ============================================
    gradients: {
        champagne: 'linear-gradient(135deg, #9A6A15 0%, #B45309 100%)',
        champagneVertical: 'linear-gradient(180deg, #9A6A15 0%, #B45309 100%)',
        overlay: 'linear-gradient(180deg, transparent 0%, rgba(15,23,42,0.5) 50%, rgba(15,23,42,0.95) 100%)',
        overlayCompact:
            'linear-gradient(180deg, transparent 0%, transparent 60%, rgba(15,23,42,0.6) 75%, rgba(15,23,42,0.95) 100%)',
        overlayLight: 'linear-gradient(180deg, transparent 0%, rgba(15,23,42,0.3) 50%, rgba(15,23,42,0.7) 100%)',
        overlayTop: 'linear-gradient(0deg, transparent 0%, rgba(15,23,42,0.8) 100%)',
        deepSpace: 'linear-gradient(180deg, #FFFFFF 0%, #F8F9FA 100%)',
        shimmer: 'linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.04) 50%, transparent 100%)',
        radialGlow: 'radial-gradient(circle at center, rgba(154,106,21,0.08) 0%, transparent 70%)',
    },

    shadows: {
        sm: '0 1px 2px rgba(15, 23, 42, 0.05)',
        md: '0 4px 6px -1px rgba(15, 23, 42, 0.08), 0 2px 4px -2px rgba(15, 23, 42, 0.04)',
        lg: '0 10px 15px -3px rgba(15, 23, 42, 0.08), 0 4px 6px -4px rgba(15, 23, 42, 0.03)',
        xl: '0 20px 25px -5px rgba(15, 23, 42, 0.08), 0 8px 10px -6px rgba(15, 23, 42, 0.03)',
        hero: '0 4px 20px rgba(0, 0, 0, 0.6), 0 2px 10px rgba(0, 0, 0, 0.4)',
        floating: '0 4px 20px -5px rgba(15, 23, 42, 0.08)',
        'floating-inverse': '0 -4px 20px -5px rgba(15, 23, 42, 0.08)',
        cardHover: '0 20px 30px -10px rgba(15, 23, 42, 0.12)',
        glow: '0 0 20px rgba(154, 106, 21, 0.25)',
        glowStrong: '0 0 35px rgba(154, 106, 21, 0.4)',
        glowSubtle: '0 0 10px rgba(154, 106, 21, 0.15)',
    },

    // ============================================
    // Z-INDEX
    // ============================================
    zIndex: {
        behind: '-1',
        base: '0',
        dropdown: '10',
        sticky: '20',
        fixed: '30',
        grain: '50', // New: for grain overlay
        floating: '100', // Floats above content
        navbar: '9999', // Always on top
        popover: '60',
        'filter-bar': '60', // Alias for popover level/sticky bars
        charts: '51',
        tooltip: '70',
        modalBackdrop: '9000',
        modal: '9001',
    },

    charts: {
        observatories: {
            Atria: '#f43f5e',
            'Sadr Chili': '#f43f5e',
            'Sadr Espagne': '#f59e0b',
            'Sadr Provence': '#6366f1',
            Home: '#0ea5e9',
        } as Record<string, string>,
        locations: {
            Chili: '#f97316',
            Espagne: '#eab308',
            Provence: '#a855f7',
            'Ile de France': '#3b82f6',
            Ardèche: '#22c55e',
            Drôme: '#a855f7',
        } as Record<string, string>,
        palette: [
            '#f43f5e',
            '#f59e0b',
            '#10b981',
            '#3b82f6',
            '#6366f1',
            '#8b5cf6',
            '#ec4899',
            '#fb7185',
            '#fcd34d',
            '#34d399',
            '#60a5fa',
            '#818cf8',
            '#a78bfa',
            '#f472b6',
        ],
        cursor: 'rgba(0, 0, 0, 0.06)',
    },

    component: {
        gallery: {
            rowHeight: {
                mobile: '150px',
                desktop: '200px',
            },
            gap: '0.5rem', // 8px
        },
        chart: {
            height: '400px',
            heightLg: '500px',
            heightSm: '200px',
            tooltipWidth: '140px',
        },
        blog: {
            imageMaxHeight: '600px',
        },
        navbar: {
            height: '56px', // Spacer height
            iconSize: '28px',
            logoHeight: '40px',
            buttonSize: '35px',
        },
        mobileMenu: {
            height: '60px',
            fontSize: '10px',
        },
    },

    boxShadow: {
        // Élévation
        sm: '0 1px 2px rgba(0, 0, 0, 0.5)',
        md: '0 4px 6px rgba(0, 0, 0, 0.5)',
        lg: '0 10px 15px rgba(0, 0, 0, 0.5)',
        xl: '0 20px 25px rgba(0, 0, 0, 0.5)',

        hero: '0 4px 20px rgba(0, 0, 0, 0.8), 0 2px 10px rgba(0, 0, 0, 0.6)',
        floating: '0 4px 20px -5px rgba(0, 0, 0, 0.5)',
        'floating-inverse': '0 -4px 20px -5px rgba(0, 0, 0, 0.5)',
        cardHover: '0 20px 40px -10px rgba(0, 0, 0, 0.5)',

        // Glows (Champagne)
        glow: '0 0 20px rgba(212, 180, 131, 0.3)',
        glowStrong: '0 0 40px rgba(212, 180, 131, 0.5)',
        glowSubtle: '0 0 10px rgba(212, 180, 131, 0.2)',
    },

    screens: {
        xs: '625px',
        sm: '640px',
        md: '768px',
        nav: '900px',
        lg: '1024px',
        xl: '1280px',
        '2xl': '1536px',
    },
} as const;
