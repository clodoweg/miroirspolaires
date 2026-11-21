/**
 * Magnitudes limites d'un instrument, telles que calculées par les visualiseurs d'objets
 *
 * Responsabilité : formules partagées par les pages comètes, astéroïdes et étoiles variables
 * (et par `api/variable-stars.ts`).
 *
 * WARNING: `CatalogueViewer` et `RecommendationsViewer` utilisent une autre formule visuelle
 * (2,7 + 5·log10 D). L'écart de 1,3 mag est connu (audit 2026-10) : les unifier changerait les
 * verdicts affichés, décision laissée à l'auteur du site.
 */

/**
 * Magnitude limite visuelle d'un instrument.
 *
 * @param apertureMm - Diamètre de l'ouverture en millimètres.
 * @returns La magnitude limite visuelle (9 + 5·log10(D/10)).
 */
export function getLimitMagnitude(apertureMm: number): number {
    return 9 + 5 * Math.log10(apertureMm / 10);
}

/**
 * Magnitude limite photographique, corrigée par l'échantillonnage.
 *
 * @param apertureMm - Diamètre de l'ouverture en millimètres.
 * @param pixelSizeUm - Taille des pixels du capteur en micromètres.
 * @param effectiveFocalMm - Focale effective en millimètres.
 * @returns La magnitude limite photographique.
 */
export function getLimitMagnitudePhoto(apertureMm: number, pixelSizeUm: number, effectiveFocalMm: number): number {
    const limitVisual = getLimitMagnitude(apertureMm);
    // Échelle de plaque en arcsec/px (formule de Dawson, approx. angle petit)
    const plateScale = (206.265 * pixelSizeUm) / Math.max(1, effectiveFocalMm);
    // Correction photométrique : petit θ → meilleur rapport signal/bruit
    const photoCorrection = 5.0 - 2.5 * Math.log10(Math.max(0.05, plateScale));
    return limitVisual + photoCorrection;
}
