/**
 * UI Constants & Icon Mappings
 *
 * Centralizes icon keys, country ISO codes, and season/category mappings
 * used by MetadataItem and StatsMetadata components.
 */

/**
 * Attributes to suppress browser and password manager autofill (1Password, Bitwarden, LastPass, Dashlane, etc.)
 */
export const NO_AUTOFILL_PROPS = {
    autoComplete: 'off',
    'data-1p-ignore': 'true',
    'data-lpignore': 'true',
    'data-bwignore': 'true',
    'data-dashlane-ignore': 'true',
    'data-form-type': 'other',
    'aria-autocomplete': 'none' as const,
};

export const COUNTRY_ISO: Record<string, string> = {
    Norvège: 'no',
    Islande: 'is',
    Groenland: 'gl',
    Finlande: 'fi',
    Suède: 'se',
    Écosse: 'gb-sct',
    Irlande: 'ie',
    Népal: 'np',
    Danemark: 'dk',
};

/**
 * Returns the flag CDN URL for a given French country name.
 * @param country - Country name in French (e.g. "Norvège")
 * @returns Flag SVG URL or null if country is not mapped
 */
export const getFlagUrl = (country: string) => {
    const iso = COUNTRY_ISO[country];
    if (!iso) return null;
    return `https://flagcdn.com/${iso}.svg`;
};

export const SEASON_ICONS: Record<string, string> = {
    Hiver: 'snowflake',
    Printemps: 'leaf',
    Été: 'sun',
    Automne: 'wind',
};

export const STAT_ICONS: Record<string, string> = {
    Pays: 'globe',
    Saisons: 'sun', // representative
    Annees: 'calendar',
    Constellations: 'star',
    Photos: 'camera',
    Observations: 'hourglass',
    Lieu: 'pin',
};

/**
 * Returns the icon key for a country (always "globe").
 * @param _country - Country name
 * @returns Lucide icon key
 */
export const getCountryIcon = (_country: string) => 'globe';

/**
 * Returns the icon key for a season.
 * @param season - Season name in French (e.g. "Hiver")
 * @returns Lucide icon key
 */
export const getSeasonIcon = (season: string) => SEASON_ICONS[season] || 'calendar';

export const CATEGORY_ICONS: Record<string, string> = {
    "Publications d'astronomie": 'telescope',
    'Récits de voyage': 'mountain',
    Blog: 'file-text',
    Tech: 'cpu',
};

/**
 * Returns the icon key for a blog category.
 * @param category - Category name in French
 * @returns Lucide icon key
 */
export const getCategoryIcon = (category: string) => CATEGORY_ICONS[category] || 'tag';

/**
 * Number of above-the-fold images that should `loading="eager"` to
 * preserve LCP. Lowered from 12 → 6 after measuring /voyages on 4G:
 * 12 concurrent fetches drowned the LCP image bandwidth, pinning LCP
 * at ~6 s. 6 is enough to cover a 2-column mobile grid above the fold
 * (~3 rows) while leaving headroom for the priority image.
 * Override via .env PUBLIC_EAGER_LOAD_COUNT.
 */
export const EAGER_LOAD_COUNT = Number(import.meta.env.PUBLIC_EAGER_LOAD_COUNT) || 6;

/**
 * Number of gallery cards rendered with the full <picture><source><img>
 * markup before switching to lightweight placeholders that hydrate via
 * IntersectionObserver. Above this threshold the per-card HTML drops from
 * ~9 KB to ~2 KB — on a 180-photo listing that's ~1 MB less to parse on
 * first paint. The placeholder still carries every data-* attribute the
 * filter bar reads, so search/filter stays instant. Override via
 * PUBLIC_GALLERY_FULL_RENDER_COUNT.
 */
export const GALLERY_FULL_RENDER_COUNT = Number(import.meta.env.PUBLIC_GALLERY_FULL_RENDER_COUNT) || 12;
