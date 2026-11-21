/**
 * Image Resizer Worker (Cloudflare Worker)
 *
 * On-demand image resizing via Cloudflare R2, with path-based options
 * (e.g. /w_800,q_80,f_jpeg/path/to/img.jpg), cache-through, strict CORS origin
 * validation and authenticated cache purging. Uses @cf-wasm/photon (WASM).
 * The pure logic (origins, purge key, options, passthrough decisions) lives in `core.ts`.
 */
/// <reference types="@cloudflare/workers-types" />
import { PhotonImage, resize, SamplingFilter } from '@cf-wasm/photon';
import {
    MAX_RESIZE_PIXELS,
    computeTargetSize,
    corsHeaders,
    getPassthroughReason,
    isPurgeAuthorized,
    parseImageRequest,
} from './core';

export interface Env {
    BUCKET: R2Bucket;
    /** Secret requis pour purger le cache (`wrangler secret put PURGE_KEY`). Sans lui, la purge est refusée. */
    PURGE_KEY?: string;
}

const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';

/** Ajoute les en-têtes CORS propres à la requête à une réponse (éventuellement issue du cache). */
function withCors(response: Response, originHeader: string | null): Response {
    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(corsHeaders(originHeader))) headers.set(name, value);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function serveObject(object: R2ObjectBody, cacheControl: string): Response {
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('Cache-Control', cacheControl);
    return new Response(object.body, { headers });
}

/** Cloudflare Worker fetch handler for image resizing requests. */
export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
            return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
        }

        // POURQUOI : les types `webworker` de TypeScript masquent `caches.default` propre à Cloudflare.
        const cache = (caches as unknown as { default: Cache }).default;
        const url = new URL(request.url);
        const originHeader = request.headers.get('Origin');
        // POURQUOI : la clé de cache est l'URL seule ; l'en-tête CORS est ajouté à la sortie,
        // sinon le premier site appelant figerait son origine pour tous les suivants.
        const cacheKey = new Request(url.toString(), { method: 'GET' });

        if (request.headers.has('x-purge')) {
            // WARNING: clé en en-tête uniquement (jamais en query string, qui finit dans les logs),
            // comparée en temps constant, et purge refusée si PURGE_KEY n'est pas configuré.
            if (!(await isPurgeAuthorized(request.headers.get('x-purge-key'), env.PURGE_KEY))) {
                return new Response('Unauthorized purge', { status: 401 });
            }
            await cache.delete(cacheKey);
        }

        const cachedResponse = await cache.match(cacheKey);
        if (cachedResponse) {
            return withCors(cachedResponse, originHeader);
        }

        const { key, options } = parseImageRequest(url);
        if (!key) {
            return new Response('Image path missing', { status: 400 });
        }

        const object = await env.BUCKET.get(key);
        if (!object) {
            return new Response('Image not found', { status: 404 });
        }

        // Check file size to prevent worker resource exhaustion.
        //
        // Cloudflare Workers FREE tier has a hard 10 ms CPU budget per
        // request. Photon WASM (decode → Lanczos3 → encode) consumes
        // roughly 3 ms per MP on warm caches, more on cold. Encoding a
        // 2.8 MP source at q=80 routinely hits ~12-15 ms — which CF
        // terminates mid-execution (observed 2026-05-25 on
        // /blog/2025/sermilik where ~80 % of images flapped between 200
        // and 503 depending on edge load). Sources above 500 KB therefore
        // stream from R2 unmodified (see MAX_RESIZE_BYTES in core.ts).
        if (getPassthroughReason(key, object.size)) {
            return withCors(serveObject(object, IMMUTABLE_CACHE), originHeader);
        }

        const inputBytes = new Uint8Array(await object.arrayBuffer());
        const sourceContentType = object.httpMetadata?.contentType || 'application/octet-stream';

        let image: PhotonImage;
        try {
            image = PhotonImage.new_from_byteslice(inputBytes);
        } catch {
            // Fichier illisible par Photon : on sert l'original sans le figer dans le cache.
            return withCors(
                new Response(inputBytes, {
                    headers: { 'Content-Type': sourceContentType, 'Cache-Control': 'no-store' },
                }),
                originHeader,
            );
        }

        try {
            const originalSize = { width: image.get_width(), height: image.get_height() };
            // Safety check: dimensions cap (1.8 MP, observed 2.1 MP images flapping 503 on the free tier).
            if (originalSize.width * originalSize.height > MAX_RESIZE_PIXELS) {
                return withCors(
                    new Response(inputBytes, {
                        headers: { 'Content-Type': sourceContentType, 'Cache-Control': IMMUTABLE_CACHE },
                    }),
                    originHeader,
                );
            }

            const target = computeTargetSize(originalSize, options);
            if (target) {
                const resized = resize(image, target.width, target.height, SamplingFilter.Lanczos3);
                // POURQUOI : `resize` renvoie une nouvelle image ; sans free(), la source resterait
                // dans le tas WASM de l'isolat à chaque redimensionnement.
                image.free();
                image = resized;
            }

            // WARNING: @cf-wasm/photon only exposes `get_bytes_webp()` *without* a quality
            // parameter — it produces LOSSLESS WebP, consistently larger than the source JPEG
            // (5× bloat measured in the May 2026 perf audit). We therefore always serve JPEG
            // (or PNG on request); `f_webp` in a URL is only a cache key.
            // TODO: Migrer vers Cloudflare Image Resizing ou une version de Photon avec WebP/AVIF avec perte.
            const isPng = options.format === 'png';
            const outputBytes = isPng ? image.get_bytes() : image.get_bytes_jpeg(options.quality);
            const response = new Response(outputBytes as Uint8Array<ArrayBuffer>, {
                headers: { 'Content-Type': isPng ? 'image/png' : 'image/jpeg', 'Cache-Control': IMMUTABLE_CACHE },
            });

            ctx.waitUntil(cache.put(cacheKey, response.clone()));
            return withCors(response, originHeader);
        } catch (error) {
            // Resizing/encoding threw — serve the original bytes but DO NOT cache, so that the
            // next request retries instead of freezing the fallback into the CDN.
            console.error('Resizing failed, falling back to original:', error);
            return withCors(
                new Response(inputBytes, {
                    headers: { 'Content-Type': sourceContentType, 'Cache-Control': 'no-store' },
                }),
                originHeader,
            );
        } finally {
            try {
                image.free();
            } catch (freeError) {
                console.error('Error freeing image:', freeError);
            }
        }
    },
};
