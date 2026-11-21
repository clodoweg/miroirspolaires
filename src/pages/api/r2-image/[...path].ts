/**
 * Same-Origin Proxy pour les photosphères 360° (Cloudflare R2)
 *
 * POURQUOI : Les visualiseurs WebGL (Pannellum) utilisent XMLHttpRequest / fetch pour télécharger
 * les photosphères 360°. Les requêtes cross-origin vers pub-r2 sont bloquées par les navigateurs
 * mobiles (CORS). Cet endpoint same-origin (appelé par `src/scripts/photo-sphere.ts`) sert les
 * images du blog et des voyages avec un cache long.
 *
 * WARNING: seuls les chemins `blog|voyages/<année>/<slug>/<fichier image>` sont acceptés, pour que
 * la route ne devienne ni un proxy ouvert vers R2 ni, en dev, un lecteur de fichiers arbitraires.
 */
import type { APIRoute } from 'astro';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileExists, safeResolve } from '@/lib/admin/shared';
import { UPSTREAM_TIMEOUT_MS } from '@/lib/api/http';

export const prerender = false;

const MIME: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
};

const ALLOWED_PATH = /^(?:assets\/)?((?:blog|voyages)\/\d{4}\/[a-z0-9-]+\/[A-Za-z0-9_.-]+\.(?:jpe?g|png|webp|avif))$/i;

/**
 * Valide et normalise le chemin demandé.
 *
 * @param rawPath - Segment `[...path]` de la route.
 * @returns La clé R2 (`blog/2026/slug/fichier.jpg`), ou `null` si le chemin n'est pas autorisé.
 */
function toAllowedAssetKey(rawPath: string | undefined): string | null {
    if (!rawPath || rawPath.includes('..') || rawPath.includes('\\')) return null;
    const match = rawPath.match(ALLOWED_PATH);
    return match ? match[1] : null;
}

export const GET: APIRoute = async ({ params }) => {
    const assetKey = toAllowedAssetKey(params.path);
    if (!assetKey) {
        return new Response('Not Found', { status: 404 });
    }
    const contentType = MIME[path.extname(assetKey).toLowerCase()];

    // 1. En environnement local (DEV), si le fichier existe sur le disque, le servir directement
    if (import.meta.env.DEV) {
        const assetsRoot = path.join(process.cwd(), 'src', 'assets');
        const localFile = safeResolve(assetsRoot, assetKey);
        if (await fileExists(localFile)) {
            const stream = Readable.toWeb(createReadStream(localFile)) as ReadableStream<Uint8Array>;
            return new Response(stream, {
                status: 200,
                headers: { 'Content-Type': contentType, 'Cache-Control': 'no-cache' },
            });
        }
    }

    // 2. En production (ou si absent en local), streamer depuis Cloudflare R2
    const r2Base = (process.env.PUBLIC_R2_URL || 'https://pub-r2.miroirspolaires.fr').replace(/\/$/, '');

    try {
        // POURQUOI : délai sur l'obtention des en-têtes seulement ; un AbortSignal.timeout couperait
        // aussi la lecture du flux d'une grosse photosphère.
        const controller = new AbortController();
        const headersTimeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS.lookup);
        const remoteResponse = await fetch(`${r2Base}/${assetKey}`, { signal: controller.signal }).finally(() =>
            clearTimeout(headersTimeout),
        );
        if (!remoteResponse.ok || !remoteResponse.body) {
            return new Response('Not Found', { status: remoteResponse.status === 404 ? 404 : 502 });
        }

        // POURQUOI : on relaie le flux au lieu de bufferiser le fichier (photosphères de plusieurs Mo).
        const headers = new Headers({
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=31536000, s-maxage=31536000, immutable',
            'X-Content-Type-Options': 'nosniff',
        });
        // POURQUOI : fetch décompresse un éventuel encodage ; la longueur amont ne vaut alors plus rien.
        const contentLength = remoteResponse.headers.get('Content-Length');
        if (contentLength && !remoteResponse.headers.has('Content-Encoding'))
            headers.set('Content-Length', contentLength);
        return new Response(remoteResponse.body, { status: 200, headers });
    } catch (error) {
        console.error('[r2-image] Erreur fetch R2 :', error);
        return new Response('Error loading remote asset', { status: 502 });
    }
};
