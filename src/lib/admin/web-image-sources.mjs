/**
 * Images sources des versions web (blog, voyages, mini/ d'astrophotos)
 *
 * Responsabilité : lister, sur le disque local, les images pour lesquelles
 * `scripts/build/generate-web-images.mjs` produit des versions web. Partagé par ce script et par
 * la route admin `/api/admin/web-images/status`, pour que le rappel de l'admin compte exactement
 * ce que le script traite.
 */

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { normalizeAssetKey } from '../../utils/webImages.mjs';

/** Dossiers traités, relatifs à `src/assets/`, par nom d'option `--only`. */
export const WEB_IMAGE_SCOPES = {
    astro: 'astrophotographies/mini',
    blog: 'blog',
    voyages: 'voyages',
};

const SOURCE_EXTENSION = /\.(jpe?g|png)$/i;

/**
 * Liste récursivement les images sources d'un dossier, hors miniatures `-thumb.*` et dossiers
 * ou fichiers cachés (`.admin-trash/`).
 *
 * @param {string} directory - Dossier absolu.
 * @returns {string[]} Chemins absolus des images.
 */
export function listSourceImages(directory) {
    if (!fs.existsSync(directory)) return [];
    const files = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.name.startsWith('.')) continue;
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) files.push(...listSourceImages(fullPath));
        else if (SOURCE_EXTENSION.test(entry.name) && !/-thumb\./i.test(entry.name)) files.push(fullPath);
    }
    return files;
}

/**
 * Images sources d'un ou plusieurs dossiers, avec leur clé R2.
 *
 * @param {string} assetsRoot - Chemin absolu de `src/assets/`.
 * @param {string[]} scopes - Noms de `WEB_IMAGE_SCOPES` à parcourir.
 * @returns {{ scope: string, key: string, path: string }[]} Les images, clé en forme NFC.
 */
export function listWebImageSources(assetsRoot, scopes) {
    return scopes.flatMap((scope) =>
        listSourceImages(path.join(assetsRoot, WEB_IMAGE_SCOPES[scope])).map((filePath) => ({
            scope,
            key: normalizeAssetKey(path.relative(assetsRoot, filePath).split(path.sep).join('/')),
            path: filePath,
        })),
    );
}

/**
 * Largeur affichée d'une image, orientation EXIF comprise.
 *
 * @param {string} filePath - Image source.
 * @returns {Promise<number>} La largeur en pixels.
 */
export async function getDisplayWidth(filePath) {
    const { width = 0, height = 0, orientation = 1 } = await sharp(filePath).metadata();
    return orientation >= 5 ? height : width;
}
