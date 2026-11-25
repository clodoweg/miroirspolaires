/**
 * Purge du cache du worker d'images pour des images remplacées depuis l'admin.
 *
 * Responsabilité : quand une image est renvoyée sous le même nom (même URL), vider les entrées du worker pour
 * cette image et toutes ses variantes (`purgeImageKeys`, partagé avec `update-photos.mjs --ci`), sinon le site
 * continue de servir l'ancienne version.
 *
 * POURQUOI rien de plus : les versions web (`web/…`) sont servies directement par R2 ; celles d'une image remplacée
 * se régénèrent à l'envoi à distance, et en local avec `generate-web-images.mjs --prefix … --force --purge`.
 *
 * Effet distant : requêtes vers IMAGE_WORKER_URL avec IMAGE_WORKER_PURGE_KEY. Sans ces variables, rien n'est
 * purgé et le résultat le dit.
 */
import { purgeImageKeys } from '../../../scripts/lib/worker-cache.mjs';

export interface CachePurgeResult {
    /** Clés traitées. */
    keys: string[];
    /** Nombre d'URL dont la purge a échoué. */
    failedCount: number;
    /** Purge impossible : variables du worker absentes. */
    skippedReason?: 'not-configured';
}

/**
 * Purge le cache du worker pour des images remplacées.
 *
 * @param keys - Clés relatives à `src/assets/` (`blog/2026/article/photo.jpg`).
 * @param options.fetchImpl - `fetch` injectable (tests).
 * @returns Le bilan de la purge.
 */
export async function purgeReplacedImages(
    keys: string[],
    options: { fetchImpl?: typeof fetch; pauseBetweenMs?: number } = {},
): Promise<CachePurgeResult> {
    if (keys.length === 0) return { keys, failedCount: 0 };
    const workerUrl = process.env.IMAGE_WORKER_URL;
    const purgeKey = process.env.IMAGE_WORKER_PURGE_KEY;
    if (!workerUrl || !purgeKey) return { keys, failedCount: 0, skippedReason: 'not-configured' };
    const failedCount = await purgeImageKeys(keys, {
        workerUrl,
        purgeKey,
        log: () => {},
        error: (line: string) => console.error('[admin] purge du worker :', line),
        ...options,
    });
    return { keys, failedCount };
}
