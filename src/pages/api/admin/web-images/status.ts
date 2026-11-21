/**
 * Route admin : état des versions web des images
 *
 * Responsabilité : renvoyer le nombre d'images locales sans versions web sur R2 (voir
 * `src/lib/admin/web-images-status.ts`), pour le rappel affiché dans l'admin.
 */
import type { APIRoute } from 'astro';
import path from 'node:path';
import { requireAdmin, jsonResponse } from '@/lib/admin/shared';
import { getWebImagesStatus } from '@/lib/admin/web-images-status';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
    const blocked = requireAdmin(locals);
    if (blocked) return blocked;
    try {
        const root = process.cwd();
        const status = await getWebImagesStatus(
            path.join(root, 'src/assets'),
            path.join(root, 'src/data/web-images.json'),
        );
        return jsonResponse(status);
    } catch (error) {
        console.error('[admin] web-images/status:', error);
        return jsonResponse({ error: 'Impossible de calculer l’état des versions web.' }, 500);
    }
};
