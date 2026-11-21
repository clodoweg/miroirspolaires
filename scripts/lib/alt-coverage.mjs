/**
 * Textes alternatifs des astrophotos sans modèle de langage
 *
 * Responsabilité : construire l'alt d'une astrophoto depuis le CSV. Utilisé par
 * `scripts/pipeline/update-photos.mjs`.
 *
 * Ce module n'est pas une CLI et n'écrit rien sur le disque.
 */

import { getConstellationName } from '../../src/lib/constellations.ts';
import { findReusableAlt, isValidAlt } from './alt-reuse.mjs';

/**
 * Construit l'alt d'une astrophoto à partir de ses données.
 *
 * POURQUOI : ni le type du CSV, parfois approximatif, ni une description de l'image ne sont repris : le
 * titre et la constellation sont sûrs.
 *
 * @param {Record<string, string>} row - Ligne du CSV.
 * @returns {string} L'alt.
 */
export function buildAstroAlt(row) {
    const title = String(row.Title ?? '').trim();
    const constellation = getConstellationName(String(row.Constellation ?? '').trim());
    if (!constellation || constellation === 'Unknown') return `${title}, astrophotographie.`;
    return `${title}, astrophotographie (constellation : ${constellation}).`;
}

/**
 * Calcule les alts à ajouter pour les photos du CSV : l'alt déjà écrit sous une autre année en priorité,
 * sinon celui construit depuis le CSV. Un alt existant n'est jamais remplacé.
 *
 * @param {Record<string, string>[]} rows - Lignes du CSV.
 * @param {Record<string, unknown>} altData - Contenu de `alt.json`.
 * @returns {Record<string, string>} Les alts à ajouter, par clé.
 */
export function planAstroAlts(rows, altData) {
    const additions = {};
    for (const row of rows) {
        const year = String(row.Uploaded ?? '').slice(0, 4);
        const key = `/assets/astrophotographies/${year}/${row.ID}_raw.jpg`;
        if (isValidAlt(altData[key])) continue;
        additions[key] = findReusableAlt(key, altData) ?? buildAstroAlt(row);
    }
    return additions;
}
