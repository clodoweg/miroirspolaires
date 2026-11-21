/**
 * État des versions web des images locales (rappel de l'admin)
 *
 * Responsabilité : compter les images locales qui n'ont pas encore de versions web sur R2, c'est-à-dire
 * absentes de `src/data/web-images.json`. Sans elles, le site sert ces images par le worker, qui
 * renvoie l'original entier au-delà de 500 Ko. Le manifeste est relu sur le disque à chaque appel,
 * pour refléter le passage de `generate-web-images.mjs --upload` sans redémarrer le serveur.
 */

import { promises as fs } from 'node:fs';
import { WEB_IMAGE_SCOPES, getDisplayWidth, listWebImageSources } from './web-image-sources.mjs';
import { planWebImageWidths } from '@/utils/webImages.mjs';

export type WebImageScope = keyof typeof WEB_IMAGE_SCOPES;

export interface WebImagesStatus {
    /** Images sources locales trouvées. */
    total: number;
    /** Images sans versions web (hors sources de moins de 400 px, que le script ignore). */
    pending: number;
    /** Détail de `total` par dossier. */
    totalByScope: Record<WebImageScope, number>;
    /** Détail de `pending` par dossier. */
    pendingByScope: Record<WebImageScope, number>;
    /** Quelques clés en attente, pour l'affichage. */
    pendingSamples: string[];
}

const MAX_SAMPLES = 5;

/**
 * Calcule l'état des versions web.
 *
 * @param assetsRoot - Chemin absolu de `src/assets/`.
 * @param manifestPath - Chemin absolu de `src/data/web-images.json`.
 * @returns Le nombre d'images sans versions web, au total et par dossier.
 */
export async function getWebImagesStatus(assetsRoot: string, manifestPath: string): Promise<WebImagesStatus> {
    let manifest: Record<string, number[]> = {};
    try {
        manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    } catch {
        // POURQUOI : manifeste absent ou illisible, toutes les images sont donc à traiter.
    }

    const scopes = Object.keys(WEB_IMAGE_SCOPES) as WebImageScope[];
    const sources = listWebImageSources(assetsRoot, scopes);
    const pendingByScope = Object.fromEntries(scopes.map((scope) => [scope, 0])) as Record<WebImageScope, number>;
    const totalByScope = { ...pendingByScope };
    const pendingSamples: string[] = [];

    for (const source of sources) {
        totalByScope[source.scope as WebImageScope]++;
        if (Array.isArray(manifest[source.key]) && manifest[source.key].length > 0) continue;
        // POURQUOI : une source plus étroite que 400 px n'aura jamais de version web ; la compter
        // laisserait le rappel affiché pour toujours. On ne lit les dimensions que des absentes.
        if (planWebImageWidths(await getDisplayWidth(source.path)).length === 0) continue;
        pendingByScope[source.scope as WebImageScope]++;
        if (pendingSamples.length < MAX_SAMPLES) pendingSamples.push(source.key);
    }

    const pending = Object.values(pendingByScope).reduce((sum, count) => sum + count, 0);
    return { total: sources.length, pending, totalByScope, pendingByScope, pendingSamples };
}
