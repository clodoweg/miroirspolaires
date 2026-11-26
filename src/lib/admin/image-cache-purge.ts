/**
 * Purge des caches pour des images remplacées depuis l'admin.
 *
 * Responsabilité : quand une image est renvoyée sous le même nom (même URL), vider
 *  - le cache du worker pour cette image et toutes ses variantes (`purgeImageKeys`, partagé avec
 *    `update-photos.mjs --ci`) ;
 *  - le cache CDN Cloudflare du domaine public de R2 pour l'image, sa miniature et ses versions web
 *    (`purgeCdnKeys`, `scripts/lib/cdn-cache.mjs`), qui servent ces fichiers sans passer par le worker.
 * Sinon le site continue de servir l'ancienne version.
 *
 * Effet distant : requêtes vers IMAGE_WORKER_URL (IMAGE_WORKER_PURGE_KEY) et vers l'API Cloudflare
 * (CLOUDFLARE_ZONE_ID, CLOUDFLARE_API_TOKEN, PUBLIC_R2_URL). Chaque purge est facultative : sans ses variables,
 * elle est sautée et le résultat le dit.
 */
import { purgeCdnKeys } from '../../../scripts/lib/cdn-cache.mjs';
import { purgeImageKeys } from '../../../scripts/lib/worker-cache.mjs';

export interface CachePurgeResult {
    /** Clés traitées. */
    keys: string[];
    /** Nombre d'URL dont la purge a échoué. */
    failedCount: number;
    /** Purge impossible : variables du worker absentes. */
    skippedReason?: 'not-configured';
    /** Purge du CDN de R2 (sources, miniatures et versions web servies directement). */
    cdn?: { urlCount: number; failedCount: number; skippedReason?: 'not-configured' };
}

/**
 * Purge le cache du worker et celui du CDN de R2 pour des images remplacées.
 *
 * @param keys - Clés relatives à `src/assets/` (`blog/2026/article/photo.jpg`).
 * @param options.fetchImpl - `fetch` injectable (tests).
 * @returns Le bilan de la purge (`failedCount` et `skippedReason` : worker ; `cdn` : Cloudflare).
 */
export async function purgeReplacedImages(
    keys: string[],
    options: { fetchImpl?: typeof fetch; pauseBetweenMs?: number } = {},
): Promise<CachePurgeResult> {
    if (keys.length === 0) return { keys, failedCount: 0 };
    const cdn = await purgeCdnKeys(keys, {
        withDerivatives: true,
        fetchImpl: options.fetchImpl,
        error: (line: string) => console.error('[admin] purge du CDN :', line),
    });
    const workerUrl = process.env.IMAGE_WORKER_URL;
    const purgeKey = process.env.IMAGE_WORKER_PURGE_KEY;
    if (!workerUrl || !purgeKey) return { keys, failedCount: 0, skippedReason: 'not-configured', cdn };
    const failedCount = await purgeImageKeys(keys, {
        workerUrl,
        purgeKey,
        log: () => {},
        error: (line: string) => console.error('[admin] purge du worker :', line),
        ...options,
    });
    return { keys, failedCount, cdn };
}
