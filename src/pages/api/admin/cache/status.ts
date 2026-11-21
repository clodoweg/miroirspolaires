/**
 * @file src/pages/api/admin/cache/status.ts
 * @description Point d'accès API pour diagnostiquer en temps réel la configuration
 * et la santé du Cloudflare Image Worker CDN.
 *
 * Responsabilité :
 * - Vérifier la présence des variables d'environnement nécessaires au CDN.
 * - Effectuer un test de connectivité (Health Check) en mesurant la latence.
 * - Fournir la structure de la politique de cache en vigueur pour l'affichage Admin.
 *
 * Exemples de réponse JSON :
 *   {
 *     "configured": true,
 *     "workerUrl": "https://images.miroirspolaires.fr",
 *     "purgeKeyConfigured": true,
 *     "r2Configured": true,
 *     "online": true,
 *     "pingStatus": 400,
 *     "pingStatusText": "Bad Request",
 *     "pingTime": 42,
 *     "errorMessage": null,
 *     "cachePolicy": { ... }
 *   }
 */

import type { APIRoute } from 'astro';
import { requireAdmin, jsonResponse } from '@/lib/admin/shared';
import { IMAGE_CONFIG } from '@/config/imageConfig.mjs';
// POURQUOI : mêmes constantes que le worker, pour que l'admin n'affiche jamais une politique périmée.
import { MAX_RESIZE_BYTES, MAX_RESIZE_PIXELS } from '../../../../../workers/image-resizer/src/core';

export const prerender = false;

interface CachePolicy {
    widths: number[];
    format: string;
    cpuLimitMs: number;
    sizeLimitKb: number;
    megapixelLimit: number;
    cachingMaxAge: string;
}

interface CacheStatusPayload {
    configured: boolean;
    workerUrl: string;
    purgeKeyConfigured: boolean;
    r2Configured: boolean;
    online: boolean;
    pingStatus: number;
    pingStatusText: string;
    pingTime: number;
    errorMessage: string | null;
    cachePolicy: CachePolicy;
}

/**
 * Gestionnaire de requête GET pour inspecter le statut du cache CDN.
 *
 * @returns {Promise<Response>} Réponse HTTP contenant l'état du diagnostic au format JSON.
 */
export const GET: APIRoute = async ({ locals }) => {
    // Sécurité : Bloquer en production si le mode requireAdmin est activé
    const blocked = requireAdmin(locals);
    if (blocked) return blocked;

    const workerUrl = process.env.IMAGE_WORKER_URL || '';
    const purgeKey = process.env.IMAGE_WORKER_PURGE_KEY || '';

    const r2Configured = !!(
        process.env.R2_ACCOUNT_ID &&
        process.env.R2_ACCESS_KEY_ID &&
        process.env.R2_SECRET_ACCESS_KEY
    );

    const payload: CacheStatusPayload = {
        configured: !!workerUrl,
        workerUrl,
        purgeKeyConfigured: !!purgeKey,
        r2Configured,
        online: false,
        pingStatus: 0,
        pingStatusText: '',
        pingTime: 0,
        errorMessage: null,
        cachePolicy: {
            widths: IMAGE_CONFIG.WIDTHS,
            format: 'jpeg (f_jpeg ; Photon ne produit que du WebP sans perte, trop lourd)',
            cpuLimitMs: 10, // Limite stricte du plan Cloudflare Workers Free
            sizeLimitKb: MAX_RESIZE_BYTES / 1024, // Original servi tel quel au-delà
            megapixelLimit: MAX_RESIZE_PIXELS / 1_000_000, // Original servi tel quel au-delà
            cachingMaxAge: 'public, max-age=31536000, immutable (1 an, Cache API du worker)',
        },
    };

    if (workerUrl) {
        try {
            const start = Date.now();

            // POURQUOI: Faire une requête directe sur la racine du Worker sans chemin d'image.
            // Le Worker valide l'existence de la clé d'image, et s'il est actif, il renvoie
            // instantanément un code HTTP 400 "Image path missing" (voir workers/image-resizer/src/index.ts L101-103).
            // Si le Worker est hors ligne ou introuvable, nous intercepterons une erreur réseau ou un timeout.
            const pingRes = await fetch(workerUrl, {
                method: 'GET',
                headers: {
                    'User-Agent': 'Miroirs Polaires Admin Diagnostiqueur',
                },
                // Timeout de 4 secondes pour éviter que l'API d'administration reste bloquée en attente
                signal: AbortSignal.timeout(4000),
            });

            payload.pingTime = Date.now() - start;
            payload.pingStatus = pingRes.status;
            payload.pingStatusText = pingRes.statusText;

            // Le Worker répond (n'importe quel statut, en particulier 400, indique qu'il est pleinement opérationnel)
            payload.online = true;
        } catch (err: any) {
            payload.errorMessage = err.message || String(err);
            payload.online = false;
        }
    }

    return jsonResponse(payload);
};
