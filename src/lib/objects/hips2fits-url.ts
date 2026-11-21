/**
 * Build a CDS hips2fits cutout URL for a given (RA, Dec) and field of view.
 * Client-safe (used by catalogue/recommendation thumbnails as well as the
 * object explorer mini-cards).
 *
 * @see https://alasky.cds.unistra.fr/hips-image-services/hips2fits
 */

import { getActiveRoutes } from '@/config/upstream-routes';

// POURQUOI : hips2fits n'a pas de miroir, et ses vignettes de listes se comptent par milliers. Les renvoyer vers
// SkyView enverrait autant de requêtes de plusieurs secondes à la NASA : on montre donc un visuel neutre.
// Une URL de données ne peut pas lire les tokens du thème, d'où un gris fixe lisible dans les deux thèmes.
export const SKY_THUMBNAIL_PLACEHOLDER =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23202530'/%3E%3Cpath d='M50 34v12M50 54v12M34 50h12M54 50h12' stroke='%238a93a6' stroke-width='3'/%3E%3C/svg%3E";

interface Options {
    ra: number;
    dec: number;
    /** On-sky size to base the FOV on, in arcminutes (the source object's largest axis). */
    sizeArcmin?: number;
    /** Output bitmap size in pixels (square). Defaults to 100. */
    sizePx?: number;
    /** HiPS layer id. Defaults to DSS2 colour. */
    hips?: string;
    /**
     * Accepte le repli SkyView (DSS2 en gris) quand hips2fits n'est plus en tête.
     * À réserver aux aperçus chargés un par un, à la demande (fiche dépliée), jamais aux listes.
     */
    allowSkyView?: boolean;
}

/**
 * Construit une URL SkyView (NASA) pour un relevé DSS2 en niveaux de gris.
 *
 * @param baseUrl - URL de `runquery.pl`, issue du registre.
 * @param ra - Ascension droite en degrés.
 * @param dec - Déclinaison en degrés.
 * @param fovDeg - Champ en degrés.
 * @param pixels - Taille de l'image carrée en pixels.
 * @returns L'URL de l'image JPEG.
 */
export function skyViewUrl(baseUrl: string, ra: number, dec: number, fovDeg: number, pixels: number): string {
    const params = new URLSearchParams({
        Position: `${ra.toFixed(6)},${dec.toFixed(6)}`,
        survey: 'DSS2 Red',
        pixels: String(pixels),
        size: fovDeg.toFixed(4),
        projection: 'Tan',
        return: 'jpeg',
    });
    return `${baseUrl}?${params.toString()}`;
}

export function hips2fitsUrl({
    ra,
    dec,
    sizeArcmin,
    sizePx = 100,
    hips = 'CDS/P/DSS2/color',
    allowSkyView = false,
}: Options): string {
    const activeRoute = getActiveRoutes('hips2fits')[0];
    const fovDeg = Math.min(Math.max(((sizeArcmin ?? 6) * 2.5) / 60, 0.1), 2);
    if (allowSkyView && activeRoute?.protocol === 'skyview') {
        return skyViewUrl(activeRoute.baseUrl, ra, dec, fovDeg, sizePx);
    }
    if (activeRoute?.protocol !== 'hips2fits') return SKY_THUMBNAIL_PLACEHOLDER;

    const params = new URLSearchParams({
        hips,
        ra: ra.toFixed(5),
        dec: dec.toFixed(5),
        fov: fovDeg.toFixed(4),
        width: String(sizePx),
        height: String(sizePx),
        projection: 'TAN',
        format: 'jpg',
    });
    return `${activeRoute.baseUrl}?${params.toString()}`;
}
