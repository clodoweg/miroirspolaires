import type { APIRoute } from 'astro';
import { isAcceptedArticleImage, requireAdmin, jsonResponse, validateSlug, validateYear } from '@/lib/admin/shared';
import { listImages, saveImage, mark360Image, publicImagePath } from '@/lib/admin/blog-files';
import { compressImage } from '@/lib/admin/image-process';
import { isLocalAdmin } from '@/lib/admin/auth/access';
import { listRemoteImages, toImageErrorResponse } from '@/lib/admin/remote-images';

export const prerender = false;

// POURQUOI : 150 Mo permet d'uploader directement les panoramas sphériques géants
// assemblés issus de boîtiers reflex sans rejet HTTP 413.
const MAX_BYTES = 150 * 1024 * 1024;

export const GET: APIRoute = async ({ params, locals }) => {
    const blocked = requireAdmin(locals);
    if (blocked) return blocked;
    const { year, slug } = params as { year: string; slug: string };
    if (!validateYear(year) || !validateSlug(slug)) return jsonResponse({ error: 'Invalid params' }, 400);
    // POURQUOI : sur l'admin distant, les images n'existent que sur R2.
    if (!isLocalAdmin(locals)) {
        try {
            const remoteImages = await listRemoteImages('blog', year, slug);
            return jsonResponse(remoteImages.map((i) => ({ ...i, path: publicImagePath(year, slug, i.name) })));
        } catch (error) {
            return toImageErrorResponse(error);
        }
    }
    const images = await listImages(year, slug);
    return jsonResponse(images.map((i) => ({ ...i, path: publicImagePath(year, slug, i.name) })));
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
    const is360 = form.get('is360') === 'true' || form.get('is360') === '1';

    const saved: { name: string; path: string; originalBytes: number; compressedBytes: number; is360?: boolean }[] = [];
    for (const file of files) {
        if (file.size > MAX_BYTES) return jsonResponse({ error: `${file.name} exceeds ${MAX_BYTES} bytes` }, 413);
        if (!isAcceptedArticleImage(file.name, file.type))
            return jsonResponse({ error: `${file.name}: unsupported type ${file.type}` }, 415);
        const buf = Buffer.from(await file.arrayBuffer());

        // POURQUOI : Pour une image 360°, nous convertissons automatiquement à la taille idéale
        // de 6000x3000 px max avec une qualité JPEG 90 (mozjpeg) tout en préservant les métadonnées.
        // Les fichiers plus petits (ex: drone DJI 4048x2024) sont conservés sans agrandissement artificiel.
        // L'écrasement (overwrite: true) remplace directement l'ancienne version sous le même nom.
        const compressOpts = is360 ? { maxSize: 6000, quality: 90 } : {};
        const { full } = await compressImage(buf, file.name, compressOpts);
        const name = await saveImage(year, slug, full.filename, full.buffer, true);

        if (is360) {
            await mark360Image(year, slug, name);
        }

        saved.push({
            name,
            path: publicImagePath(year, slug, name),
            originalBytes: full.originalBytes,
            compressedBytes: full.compressedBytes,
            is360,
        });
    }
    return jsonResponse({ ok: true, saved });
};
