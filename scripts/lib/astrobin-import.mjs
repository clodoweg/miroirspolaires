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
        const files = photoFileKeys(row);
        const checks = {
            ...Object.fromEntries(
                Object.entries(files).map(([name, key]) => [name, fs.existsSync(path.join(astroRoot, key))]),
            ),
            ...photoTextChecks(row, altData, seoData),
        };
        return incompleteEntry(row, checks);
    });
}

/**
 * Comme `findIncompletePhotos`, mais les fichiers sont vérifiés par une fonction (R2 en CI, où le
 * disque local est vide).
 *
 * @param {Record<string, string>[]} rows - Lignes du CSV.
 * @param {(key: string) => Promise<boolean>} fileExists - Reçoit une clé relative à `astrophotographies/`.
 * @param {Record<string, string>} altData - Contenu de `src/data/alt.json`.
 * @param {Record<string, string>} seoData - Contenu de `src/data/seo.json`.
 * @returns {Promise<{ id: string, title: string, missing: string[] }[]>} Les photos incomplètes, dans
 *   l'ordre du CSV.
 */
export async function findIncompletePhotosWith(rows, fileExists, altData, seoData) {
    const entries = await Promise.all(
        rows.map(async (row) => {
            const fileChecks = await Promise.all(
                Object.entries(photoFileKeys(row)).map(async ([name, key]) => [name, await fileExists(key)]),
            );
            return incompleteEntry(row, {
                ...Object.fromEntries(fileChecks),
                ...photoTextChecks(row, altData, seoData),
            });
        }),
    );
    return entries.flat();
}

/**
 * Clés, relatives à `astrophotographies/`, des fichiers attendus pour une photo.
 *
 * @param {Record<string, string>} row - Ligne du CSV.
 * @returns {{ raw: string, mini: string, annotation: string }} Les clés.
 */
function photoFileKeys(row) {
    const id = String(row.ID ?? '');
    const year = photoYear(row);
    return {
        raw: `${year}/${id}_raw.jpg`,
        mini: `mini/${year}/${id}_raw.jpg`,
        annotation: `annotations/${year}/${id}_annotation.svg`,
    };
}

/**
 * Présence de l'alt et de la description SEO d'une photo.
 *
 * @param {Record<string, string>} row - Ligne du CSV.
 * @param {Record<string, string>} altData - Contenu de `src/data/alt.json`.
 * @param {Record<string, string>} seoData - Contenu de `src/data/seo.json`.
 * @returns {{ alt: boolean, seo: boolean }} Les deux contrôles.
 */
function photoTextChecks(row, altData, seoData) {
    const id = String(row.ID ?? '');
    return {
        alt: Boolean(altData[`/assets/astrophotographies/${photoYear(row)}/${id}_raw.jpg`]),
        seo: Boolean(seoData[`astrophotographies/${slugify(String(row.Title ?? ''))}-${id}`]),
    };
}

/**
 * Entrée du bilan pour une photo.
 *
 * @param {Record<string, string>} row - Ligne du CSV.
 * @param {Record<string, boolean>} checks - Résultat de chaque contrôle.
 * @returns {{ id: string, title: string, missing: string[] }[]} Une entrée si un contrôle échoue, sinon aucune.
 */
function incompleteEntry(row, checks) {
    const missing = Object.keys(checks).filter((name) => !checks[name]);
    return missing.length > 0 ? [{ id: String(row.ID ?? ''), title: String(row.Title ?? ''), missing }] : [];
}

/**
 * Clés de `alt.json` à renommer pour les photos dont l'année a changé dans le CSV.
 *
 * POURQUOI : en local, `migrate-asset-years.mjs` déplace les fichiers et renomme ces clés. En CI, le
 * disque est vide : il ne voit aucun fichier et ne renomme rien. Les fichiers de la nouvelle année sont
 * téléchargés par le scrape ; il reste à faire suivre les alts, d'après l'ancien et le nouveau CSV.
 *
 * @param {Record<string, string>[]} previousRows - Lignes du CSV avant import.
 * @param {Record<string, string>[]} rows - Lignes du CSV importé.
 * @param {Record<string, string>} altData - Contenu de `src/data/alt.json`.
 * @returns {[string, string][]} Les renommages `[ancienne clé, nouvelle clé]`. Une clé déjà présente sous
 *   la nouvelle année n'est pas écrasée.
 */
export function planAltYearMigration(previousRows, rows, altData) {
    const previousYearById = new Map(previousRows.map((row) => [String(row.ID), photoYear(row)]));
    const renames = [];
    for (const row of rows) {
        const id = String(row.ID ?? '');
        const year = photoYear(row);
        const previousYear = previousYearById.get(id);
        if (!id || !previousYear || previousYear === year || !YEAR_DIRECTORY.test(year)) continue;
        const prefixes = [
            [`/assets/astrophotographies/${previousYear}/${id}_`, `/assets/astrophotographies/${year}/${id}_`],
            [
                `/assets/astrophotographies/skyplots/${previousYear}/${id}_`,
                `/assets/astrophotographies/skyplots/${year}/${id}_`,
            ],
        ];
        for (const key of Object.keys(altData)) {
            const match = prefixes.find(([oldPrefix]) => key.startsWith(oldPrefix));
            if (!match) continue;
            const newKey = match[1] + key.slice(match[0].length);
            if (!(newKey in altData)) renames.push([key, newKey]);
        }
    }
    return renames;
}
