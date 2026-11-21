/**
 * Types for the deep-sky object resolver.
 * Aggregates data from Sesame, SIMBAD, Wikipedia and hips2fits.
 */

export interface ResolvedCoords {
    /** Right ascension, decimal degrees ICRS J2000 */
    ra: number;
    /** Declination, decimal degrees ICRS J2000 */
    dec: number;
}

export interface SimbadData {
    /** SIMBAD canonical main identifier (e.g. "M  31") */
    mainId: string;
    /** Coordinates resolved by SIMBAD itself, if available */
    coords?: ResolvedCoords;
    /** Object type code (e.g. "G", "PN", "OpC") */
    otype?: string;
    /** Human readable object type */
    otypeText?: string;
    /** Spectral type if any */
    spType?: string;
    /** Morphological type for galaxies */
    morphType?: string;
    /** Parallax in milliarcseconds */
    plxMas?: number;
    /** Heliocentric redshift */
    redshift?: number;
    /** Radial velocity km/s */
    radvelKms?: number;
    /** Major axis in arcminutes */
    dimMajArcmin?: number;
    /** Minor axis in arcminutes */
    dimMinArcmin?: number;
    /** Position angle in degrees */
    dimAngleDeg?: number;
    /** Cross-identifications (catalogue aliases) */
    aliases: string[];
    /** Photometric magnitudes by filter band */
    fluxes: Record<string, number>;
}

export interface WikipediaSummary {
    /** Page title used for the lookup */
    title: string;
    /** Source language: 'fr' or 'en' */
    lang: 'fr' | 'en';
    /** Plain-text extract */
    extract: string;
    /** Canonical Wikipedia URL */
    url: string;
    /** Lead image URL if any */
    imageUrl?: string;
}

export interface SkyImage {
    /** Internal id used for selection state */
    id: string;
    /** Display label, FR */
    label: string;
    /** Short description */
    description?: string;
    /** Source survey HiPS id */
    hipsId: string;
    /** Full-resolution JPG URL (used for the main image). */
    url: string;
    /** Low-resolution JPG URL used for the small selector thumbnails so
     *  the page doesn't pull six 800-pixel cutouts above the fold. */
    thumbUrl: string;
    /** Field of view in degrees */
    fovDeg: number;
}

export interface NedSummary {
    preferredName: string;
    coords?: ResolvedCoords;
    redshift?: number;
    redshiftUncertainty?: number;
    objType?: string;
    redshiftRef?: string;
}

export interface CatalogEntrySummary {
    catalog: string;
    catalogId: string;
    fields: { label: string; value: string }[];
    sourceUrl?: string;
}

export interface OwnPhotoLink {
    slug: string;
    title: string;
    href: string;
    imagePath: string;
    year: number;
    /** Pre-built thumbnail URL (R2 or image worker) when env vars are set */
    thumbnailUrl?: string;
}

export interface ResolvedObject {
    /** Original user input */
    query: string;
    /** Canonical name to display */
    canonicalName: string;
    /** Coordinates ICRS J2000, decimal degrees */
    coords: ResolvedCoords;
    /** SIMBAD-derived scientific data */
    simbad?: SimbadData;
    /** NED-derived data, when extragalactic */
    ned?: NedSummary;
    /** Catalogue-specific rows (Sh2, LBN, NGC2000…) */
    catalogEntries?: CatalogEntrySummary[];
    /** Wikipedia summary (FR preferred) */
    wikipedia?: WikipediaSummary;
    /** Pre-built sky image cutouts across surveys */
    images: SkyImage[];
    /** Field of view used for default thumbnails (degrees) */
    defaultFovDeg: number;
    /** Owner astrophotographies that target this object (most recent first) */
    ownPhotos?: OwnPhotoLink[];
    /** Aggregated catalogue identifiers, deduped */
    aliases: string[];
    /** Non-fatal errors per-source */
    warnings?: string[];
}
