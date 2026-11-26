/**
 * Purge du cache CDN Cloudflare devant le domaine public de R2 (`PUBLIC_R2_URL`)
 *
 * Responsabilité : vider le cache Cloudflare des fichiers servis directement par R2 (sources, `-thumb.jpg`,
 * versions web `web/…-w<largeur>.jpg`) quand ils sont remplacés sous la même clé. Le cache du worker
 * (`worker-cache.mjs`) ne couvre que les URL du worker ; sans cette purge, le domaine public de R2 continue de
 * servir l'ancienne version jusqu'à expiration.
 *
 * Utilisé par l'admin (`src/lib/admin/image-cache-purge.ts`), `scripts/pipeline/update-photos.mjs --ci` et
 * `scripts/build/generate-web-images.mjs --purge`.
 *
 * Effet distant : `POST https://api.cloudflare.com/client/v4/zones/<zone>/purge_cache` (30 URL par appel,
 * limite de l'API). Variables : CLOUDFLARE_ZONE_ID, CLOUDFLARE_API_TOKEN (permission « Zone › Cache Purge »
 * seulement), PUBLIC_R2_URL. Sans elles, rien n'est purgé et l'appelant le signale.
 *
 * Ce module n'est pas une CLI.
 */

import { WEB_IMAGE_WIDTHS, webImageKey } from '../../src/utils/webImages.mjs';

/** Nombre maximal d'URL par appel à l'API de purge (offre gratuite). */
export const CLOUDFLARE_PURGE_BATCH_SIZE = 30;

const CLOUDFLARE_API = 'https://api.cloudflare.com/client/v4';

/**
 * Lit la configuration de la purge CDN.
 *
 * @param {Record<string, string | undefined>} [env] - Variables d'environnement (défaut : `process.env`).
 * @returns {{ zoneId: string, apiToken: string, publicBase: string } | null} La configuration, ou `null` si
 *   une variable manque.
 */
export function readCdnPurgeConfig(env = process.env) {
    const zoneId = env.CLOUDFLARE_ZONE_ID?.trim();
    const apiToken = env.CLOUDFLARE_API_TOKEN?.trim();
    const publicBase = (env.PUBLIC_R2_URL || '').trim().replace(/\/+$/, '');
    // POURQUOI : l'identifiant de zone entre dans l'URL de l'API ; on refuse tout ce qui n'est pas hexadécimal.
    if (!zoneId || !/^[a-f0-9]{32}$/i.test(zoneId) || !apiToken || !publicBase.startsWith('https://')) return null;
    return { zoneId, apiToken, publicBase };
}

/**
 * URL publiques R2 à purger pour des clés remplacées.
 *
 * @param {string} publicBase - PUBLIC_R2_URL, sans `/` final.
 * @param {string[]} keys - Clés R2 (`blog/2026/slug/photo.jpg`, `web/…`).
 * @param {{ withDerivatives?: boolean }} [options] - Ajoute la miniature `-thumb.jpg` et les versions web de
 *   chaque source (quand elles sont régénérées sous les mêmes clés).
 * @returns {string[]} Les URL, sans doublon.
 */
export function publicUrlsForKeys(publicBase, keys, options = {}) {
    const urlKeys = new Set();
    for (const key of keys) {
        urlKeys.add(key);
        if (!options.withDerivatives || key.startsWith('web/')) continue;
        if (!/-thumb\.jpg$/i.test(key)) urlKeys.add(key.replace(/\.[^./]+$/, '-thumb.jpg'));
        for (const width of WEB_IMAGE_WIDTHS) urlKeys.add(webImageKey(key, width));
    }
    return [...urlKeys].map((key) => `${publicBase}/${encodeURI(key)}`);
}

/**
 * Purge des URL du cache Cloudflare, par lots de 30.
 *
 * WARNING: sécurité. Le jeton ne doit jamais apparaître dans un journal ni dans une réponse.
 *
 * @param {string[]} urls - URL complètes.
 * @param {{ zoneId: string, apiToken: string, fetchImpl?: typeof fetch, error?: (line: string) => void }} options
 *   - Configuration, `fetch` et sortie d'erreur injectables (tests).
 * @returns {Promise<number>} Le nombre d'URL dont la purge a échoué.
 */
export async function purgeCdnUrls(urls, options) {
    const { zoneId, apiToken, fetchImpl = fetch, error = console.error } = options;
    let failedCount = 0;
    for (let start = 0; start < urls.length; start += CLOUDFLARE_PURGE_BATCH_SIZE) {
        const batch = urls.slice(start, start + CLOUDFLARE_PURGE_BATCH_SIZE);
        try {
            const response = await fetchImpl(`${CLOUDFLARE_API}/zones/${zoneId}/purge_cache`, {
                method: 'POST',
                headers: { authorization: `Bearer ${apiToken}`, 'content-type': 'application/json' },
                body: JSON.stringify({ files: batch }),
                signal: AbortSignal.timeout(15_000),
            });
            const body = await response.json().catch(() => ({}));
            if (!response.ok || body.success === false) {
                const reason = body.errors?.[0]?.message ?? `HTTP ${response.status}`;
                error(`❌ Purge CDN refusée (${reason}) pour ${batch.length} URL.`);
                failedCount += batch.length;
            }
        } catch (networkError) {
            error(`❌ Purge CDN impossible : ${networkError.message}`);
            failedCount += batch.length;
        }
    }
    return failedCount;
}

/**
 * Purge le cache CDN de clés R2 remplacées, si la configuration est présente.
 *
 * @param {string[]} keys - Clés R2 remplacées.
 * @param {{ withDerivatives?: boolean, env?: Record<string, string | undefined>, fetchImpl?: typeof fetch,
 *   error?: (line: string) => void }} [options] - Voir `publicUrlsForKeys` et `purgeCdnUrls`.
 * @returns {Promise<{ urlCount: number, failedCount: number, skippedReason?: 'not-configured' }>} Le bilan.
 */
export async function purgeCdnKeys(keys, options = {}) {
    if (keys.length === 0) return { urlCount: 0, failedCount: 0 };
    const config = readCdnPurgeConfig(options.env);
    if (!config) return { urlCount: 0, failedCount: 0, skippedReason: 'not-configured' };
    const urls = publicUrlsForKeys(config.publicBase, keys, { withDerivatives: options.withDerivatives });
    const failedCount = await purgeCdnUrls(urls, {
        zoneId: config.zoneId,
        apiToken: config.apiToken,
        fetchImpl: options.fetchImpl,
        error: options.error,
    });
    return { urlCount: urls.length, failedCount };
}
