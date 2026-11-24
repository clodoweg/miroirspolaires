/**
 * Purge du cache du worker d'images Cloudflare
 *
 * Responsabilité : vider les entrées du cache du worker pour une URL, ou pour une image et toutes ses
 * variantes (`IMAGE_CONFIG.CACHED_VARIANTS`, en f_jpeg). Utilisé par `scripts/r2/purge-cache.mjs` (tout
 * un dossier local) et par `scripts/pipeline/update-photos.mjs --ci` (les seules images remplacées).
 *
 * Effet distant : requêtes GET avec `x-purge` vers IMAGE_WORKER_URL. Aucune écriture R2.
 *
 * Ce module n'est pas une CLI.
 */

import { IMAGE_CONFIG } from '../../src/config/imageConfig.mjs';

const RETRIES = 3;
const PAUSE_BETWEEN_REQUESTS_MS = 200;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Purge une URL du cache du worker, avec jusqu'à 3 tentatives sur 503 ou erreur réseau.
 *
 * @param {string} url - URL exacte servie par le worker.
 * @param {string} purgeKey - IMAGE_WORKER_PURGE_KEY.
 * @param {{ log?: (line: string) => void, error?: (line: string) => void, fetchImpl?: typeof fetch,
 *   pauseMs?: (attempt: number) => number }} [options] - Sorties, fetch et pause injectables (tests).
 * @returns {Promise<boolean>} `true` si la purge a réussi (200 ou 404).
 */
export async function purgeWorkerUrl(url, purgeKey, options = {}) {
    const { log = console.log, error = console.error, fetchImpl = fetch, pauseMs = (i) => 1000 * (i + 1) } = options;
    for (let attempt = 0; attempt < RETRIES; attempt++) {
        try {
            // POURQUOI : GET et non HEAD. Le worker fait `cache.delete(request)` sans `ignoreMethod` :
            // une requête HEAD ne correspond pas à l'entrée mise en cache par un GET et ne purge rien.
            const response = await fetchImpl(url, {
                method: 'GET',
                headers: { 'x-purge': '1', 'x-purge-key': purgeKey },
            });
            await response.arrayBuffer().catch(() => {});
            if (response.ok || response.status === 404) {
                log(`✅ Purge réussie (${response.status}): ${url}`);
                return true;
            }
            if (response.status === 503 && attempt < RETRIES - 1) {
                log(`⚠️  Erreur 503 (Retry ${attempt + 1}/${RETRIES}): ${url}`);
                await sleep(pauseMs(attempt));
                continue;
            }
            error(`❌ Échec purge (${response.status}): ${url}`);
            return false;
        } catch (networkError) {
            error(`❌ Erreur réseau pour ${url}: ${networkError.message}`);
            if (attempt < RETRIES - 1) await sleep(pauseMs(attempt));
        }
    }
    return false;
}

/**
 * URL du worker à purger pour une image : l'URL nue et chaque variante mise en cache par le site.
 *
 * @param {string} workerUrl - IMAGE_WORKER_URL, sans `/` final.
 * @param {string} key - Clé de l'image, relative à `src/assets/` (ex. `astrophotographies/2026/1_raw.jpg`).
 * @returns {string[]} Les URL.
 */
export function workerUrlsForKey(workerUrl, key) {
    const base = workerUrl.replace(/\/$/, '');
    return [
        `${base}/${key}`,
        ...IMAGE_CONFIG.CACHED_VARIANTS.map(([width, quality]) => `${base}/w_${width},q_${quality},f_jpeg/${key}`),
    ];
}

/**
 * Purge plusieurs images et toutes leurs variantes, une requête à la fois.
 *
 * @param {string[]} keys - Clés relatives à `src/assets/`.
 * @param {{ workerUrl: string, purgeKey: string, log?: (line: string) => void,
 *   error?: (line: string) => void, fetchImpl?: typeof fetch, pauseBetweenMs?: number }} options - Configuration.
 * @returns {Promise<number>} Le nombre d'URL dont la purge a échoué.
 */
export async function purgeImageKeys(keys, options) {
    const { workerUrl, purgeKey, pauseBetweenMs = PAUSE_BETWEEN_REQUESTS_MS, ...purgeOptions } = options;
    let failedCount = 0;
    for (const key of keys) {
        for (const url of workerUrlsForKey(workerUrl, key)) {
            if (!(await purgeWorkerUrl(url, purgeKey, purgeOptions))) failedCount++;
            await sleep(pauseBetweenMs);
        }
    }
    return failedCount;
}
