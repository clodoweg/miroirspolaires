/**
 * POST /api/admin/uploads/finalize : traite une image déposée sur R2 par `POST /api/admin/uploads`
 * (compression, versions web, dimensions) et l'enregistre dans le dossier de l'entrée.
 *
 * Corps JSON : `{ section: 'blog' | 'voyages', year, slug, uploadKey, filename, is360? }`.
 * Réponse : `{ ok: true, saved: [image] }`, au même format que l'envoi local de la section
 * (`path` pour le blog, `rel` pour les voyages).
 */
import type { APIRoute } from 'astro';
import { publicImagePath } from '@/lib/admin/blog-files';
import { finalizeImageUpload, parseImageSection, toImageErrorResponse } from '@/lib/admin/remote-images';
import { requireAdmin, jsonResponse } from '@/lib/admin/shared';
import { relImagePath } from '@/lib/admin/voyages-files';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
    const blocked = requireAdmin(locals);
    if (blocked) return blocked;
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const section = parseImageSection(body?.section);
    if (!body || !section || typeof body.uploadKey !== 'string' || typeof body.filename !== 'string') {
        return jsonResponse({ error: 'Missing section, uploadKey or filename' }, 400);
    }
    const year = String(body.year ?? '');
    const slug = String(body.slug ?? '');
    try {
        const image = await finalizeImageUpload(section, year, slug, {
            uploadKey: body.uploadKey,
            filename: body.filename,
            is360: body.is360 === true,
        });
        const location =
            section === 'blog'
                ? { path: publicImagePath(year, slug, image.name) }
                : { rel: relImagePath(year, slug, image.name) };
        return jsonResponse({
            ok: true,
            saved: [
                {
                    name: image.name,
                    ...location,
                    originalBytes: image.originalBytes,
                    compressedBytes: image.compressedBytes,
                    is360: image.is360,
                },
            ],
        });
    } catch (error) {
        return toImageErrorResponse(error);
    }
};
