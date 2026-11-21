/**
 * POST /api/admin/uploads : prépare l'envoi direct d'une image vers R2 (URL PUT présignée).
 *
 * Corps JSON : `{ section: 'blog' | 'voyages', year, slug, filename, contentType, size }`.
 * Réponse : `{ uploadUrl, uploadKey }`, à suivre d'un PUT du fichier sur `uploadUrl` puis de
 * `POST /api/admin/uploads/finalize`. Voir `src/lib/admin/remote-images.ts`.
 */
import type { APIRoute } from 'astro';
import { createImageUpload, parseImageSection, toImageErrorResponse } from '@/lib/admin/remote-images';
import { requireAdmin, jsonResponse } from '@/lib/admin/shared';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
    const blocked = requireAdmin(locals);
    if (blocked) return blocked;
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const section = parseImageSection(body?.section);
    if (!body || !section || typeof body.filename !== 'string' || typeof body.contentType !== 'string') {
        return jsonResponse({ error: 'Missing section, filename or contentType' }, 400);
    }
    try {
        return jsonResponse(
            await createImageUpload(section, String(body.year ?? ''), String(body.slug ?? ''), {
                filename: body.filename,
                contentType: body.contentType,
                size: Number(body.size),
            }),
        );
    } catch (error) {
        return toImageErrorResponse(error);
    }
};
