import type { APIRoute } from 'astro';
import { requireAdmin, jsonResponse, validateSlug, validateYear } from '@/lib/admin/shared';
import { listImages, saveImage, relImagePath } from '@/lib/admin/voyages-files';
import { compressImage } from '@/lib/admin/image-process';
import { isLocalAdmin } from '@/lib/admin/auth/access';
import { listRemoteImages, toImageErrorResponse } from '@/lib/admin/remote-images';

export const prerender = false;

const MAX_BYTES = 150 * 1024 * 1024;
const ALLOWED = /^image\/(png|jpe?g|webp|gif|avif|svg\+xml)$/i;

export const GET: APIRoute = async ({ params, locals }) => {
    const blocked = requireAdmin(locals);
    if (blocked) return blocked;
    const { year, slug } = params as { year: string; slug: string };
    if (!validateYear(year) || !validateSlug(slug)) return jsonResponse({ error: 'Invalid params' }, 400);
    // POURQUOI : sur l'admin distant, les images n'existent que sur R2.
    if (!isLocalAdmin(locals)) {
        try {
            const remoteImages = await listRemoteImages('voyages', year, slug);
            return jsonResponse(
                remoteImages.map((i) => ({ name: i.name, size: i.size, rel: relImagePath(year, slug, i.name) })),
            );
        } catch (error) {
            return toImageErrorResponse(error);
        }
    }
    return jsonResponse(await listImages(year, slug));
};

export const POST: APIRoute = async ({ params, request, locals }) => {
    const blocked = requireAdmin(locals);
    if (blocked) return blocked;
    const { year, slug } = params as { year: string; slug: string };
    if (!validateYear(year) || !validateSlug(slug)) return jsonResponse({ error: 'Invalid params' }, 400);
    const form = await request.formData().catch(() => null);
    if (!form) return jsonResponse({ error: 'Expected multipart/form-data' }, 400);
    const files = form.getAll('files').filter((f): f is File => f instanceof File);
    if (files.length === 0) return jsonResponse({ error: 'No files' }, 400);
    const saved: {
        name: string;
        rel: string;
        originalBytes: number;
        compressedBytes: number;
        thumb?: { name: string; compressedBytes: number };
    }[] = [];
    for (const file of files) {
        if (file.size > MAX_BYTES) return jsonResponse({ error: `${file.name} exceeds ${MAX_BYTES} bytes` }, 413);
        if (!ALLOWED.test(file.type))
            return jsonResponse({ error: `${file.name}: unsupported type ${file.type}` }, 415);
        const buf = Buffer.from(await file.arrayBuffer());
        const { full } = await compressImage(buf, file.name);
        const name = await saveImage(year, slug, full.filename, full.buffer, true);

        // POURQUOI : Pour les voyages, les miniatures individuelles ne sont plus nécessaires à l'upload
        // car seule la couverture de l'album nécessite une miniature (générée lors du clic sur 'cover').
        saved.push({
            name,
            rel: relImagePath(year, slug, name),
            originalBytes: full.originalBytes,
            compressedBytes: full.compressedBytes,
        });
    }
    return jsonResponse({ ok: true, saved });
};
