/**
 * Import des fichiers du dépôt astrobin et bilan de complétude des astrophotos
 *
 * Responsabilité : calculer les fichiers à copier depuis le dépôt voisin `astrobin` vers
 * `src/assets/astrophotographies/`, et lister les photos du CSV auxquelles il manque quelque chose.
 * Utilisé par `scripts/pipeline/update-photos.mjs`.
 *
 * Ce module n'est pas une CLI et n'écrit rien sur le disque.
 */

import fs from 'node:fs';
import path from 'node:path';
import { slugify } from '../../src/utils/normalize.ts';

const YEAR_DIRECTORY = /^\d{4}$/;
const PHOTO_FILE = /^(\d+)_/;
// POURQUOI : marge pour les systèmes de fichiers qui arrondissent les dates de modification.
const MTIME_TOLERANCE_MS = 2000;

/**
 * Année d'une ligne du CSV, telle que le site la calcule.
 *
 * @param {Record<string, string>} row - Ligne du CSV.
 * @returns {string} Les 4 premiers caractères de `Uploaded`.
 */
export function photoYear(row) {
    return String(row.Uploaded ?? '').slice(0, 4);
}

/**
 * Indique si un fichier doit être recopié : absent, de taille différente ou plus récent à la source.
 *
 * @param {string} sourcePath - Fichier source, qui existe.
 * @param {string} targetPath - Fichier cible, éventuellement absent.
 * @returns {boolean} `true` si la copie est nécessaire.
 */
export function needsCopy(sourcePath, targetPath) {
    if (!fs.existsSync(targetPath)) return true;
    const source = fs.statSync(sourcePath);
    const target = fs.statSync(targetPath);
    return source.size !== target.size || source.mtimeMs - target.mtimeMs > MTIME_TOLERANCE_MS;
}

/**
 * Calcule les images, annotations et skyplots à copier.
 *
 * POURQUOI : le dépôt astrobin garde les fichiers de l'ancienne année quand une photo change d'année
 * dans le CSV. Seuls les fichiers de l'année du CSV sont donc retenus, pour ne pas les réintroduire.
 *
 * @param {string} sourceRoot - Dossier `astrophotographies/` du dépôt astrobin.
 * @param {string} targetRoot - Dossier `src/assets/astrophotographies/`.
 * @param {Record<string, string>[]} rows - Lignes du CSV.
 * @returns {{ copies: { source: string, target: string }[], ignoredCount: number }} Les copies à faire
 *   et le nombre de fichiers écartés (ID absent du CSV ou année différente).
 */
export function planAstrobinImport(sourceRoot, targetRoot, rows) {
    const yearById = new Map(rows.map((row) => [String(row.ID), photoYear(row)]));
    const copies = [];
    let ignoredCount = 0;

    for (const prefix of ['', 'annotations', 'skyplots']) {
        const prefixRoot = path.join(sourceRoot, prefix);
        if (!fs.existsSync(prefixRoot)) continue;
        for (const year of fs.readdirSync(prefixRoot).filter((name) => YEAR_DIRECTORY.test(name))) {
            for (const fileName of fs.readdirSync(path.join(prefixRoot, year))) {
                const id = fileName.match(PHOTO_FILE)?.[1];
                if (!id) continue;
                if (yearById.get(id) !== year) {
                    ignoredCount++;
                    continue;
                }
                const source = path.join(prefixRoot, year, fileName);
                const target = path.join(targetRoot, prefix, year, fileName);
                if (needsCopy(source, target)) copies.push({ source, target });
            }
        }
    }
    return { copies, ignoredCount };
}

/**
 * Liste ce qu'il manque à chaque photo du CSV.
 *
 * @param {Record<string, string>[]} rows - Lignes du CSV.
 * @param {string} astroRoot - Dossier `src/assets/astrophotographies/`.
 * @param {Record<string, string>} altData - Contenu de `src/data/alt.json`.
 * @param {Record<string, string>} seoData - Contenu de `src/data/seo.json`.
 * @returns {{ id: string, title: string, missing: string[] }[]} Les photos incomplètes.
 */
export function findIncompletePhotos(rows, astroRoot, altData, seoData) {
    return rows.flatMap((row) => {
        const id = String(row.ID ?? '');
        const title = String(row.Title ?? '');
        const year = photoYear(row);
        const checks = {
            raw: fs.existsSync(path.join(astroRoot, year, `${id}_raw.jpg`)),
            mini: fs.existsSync(path.join(astroRoot, 'mini', year, `${id}_raw.jpg`)),
            annotation: fs.existsSync(path.join(astroRoot, 'annotations', year, `${id}_annotation.svg`)),
            alt: Boolean(altData[`/assets/astrophotographies/${year}/${id}_raw.jpg`]),
            seo: Boolean(seoData[`astrophotographies/${slugify(title)}-${id}`]),
        };
        const missing = Object.keys(checks).filter((name) => !checks[name]);
        return missing.length > 0 ? [{ id, title, missing }] : [];
    });
}
