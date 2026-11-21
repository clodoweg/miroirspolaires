import type { APIRoute } from 'astro';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
    requireAdmin,
    fileExists,
    jsonResponse,
    MIME_BY_EXT,
    validateSlug,
    validateYear,
    validateFilename,
} from '@/lib/admin/shared';
import { assetFilePath, deleteImage, publicImagePath } from '@/lib/admin/blog-files';
import { isLocalAdmin } from '@/lib/admin/auth/access';
import { deleteRemoteImage, setRemoteCover, toImageErrorResponse } from '@/lib/admin/remote-images';

export const prerender = false;

export const GET: APIRoute = async ({ params, locals }) => {
    const blocked = requireAdmin(locals);
    if (blocked) return blocked;
    const { year, slug, filename } = params as { year: string; slug: string; filename: string };
    if (!validateYear(year) || !validateSlug(slug) || !validateFilename(filename)) {
        return new Response('Bad request', { status: 400 });
    }
    const file = assetFilePath(year, slug, filename);
    if (!(await fileExists(file))) {
        const r2Base = import.meta.env.PUBLIC_R2_URL || process.env.PUBLIC_R2_URL;
        if (r2Base) {
            return Response.redirect(`${r2Base.replace(/\/$/, '')}/blog/${year}/${slug}/${filename}`, 302);
        }
        return new Response('Not found', { status: 404 });
    }
    const data = await fs.readFile(file);
    const ext = path.extname(filename).toLowerCase();
    return new Response(data, {
        status: 200,
        headers: {
            'Content-Type': MIME_BY_EXT[ext] ?? 'application/octet-stream',
            'Cache-Control': 'no-store',
        },
    });
};

export const PUT: APIRoute = async ({ params, locals }) => {
    const blocked = requireAdmin(locals);
    if (blocked) return blocked;
    const { year, slug, filename } = params as { year: string; slug: string; filename: string };
    if (!validateYear(year) || !validateSlug(slug) || !validateFilename(filename)) {
        return new Response('Bad request', { status: 400 });
    }
    if (!isLocalAdmin(locals)) {
        try {
            const { cover, thumb } = await setRemoteCover('blog', year, slug, filename);
            return jsonResponse({
                ok: true,
                cover: publicImagePath(year, slug, cover),
                thumb: publicImagePath(year, slug, thumb),
            });
        } catch (error) {
            return toImageErrorResponse(error);
        }
    }

    try {
        const sourceFile = assetFilePath(year, slug, filename);
        if (!(await fileExists(sourceFile))) {
            return new Response('Source image not found', { status: 404 });
        }

        const ext = path.extname(filename);
        const base = path.basename(filename, ext);
        const thumbFilename = `${base}-thumb.jpg`;
        const thumbFile = assetFilePath(year, slug, thumbFilename);

        // POURQUOI : On compresse l'image pour obtenir sa miniature (max 800px, q60 mozjpeg)
        // consommée spécifiquement par les cartes du listing /blog et /blog/[year].
        const buf = await fs.readFile(sourceFile);
        const { compressImage } = await import('@/lib/admin/image-process');
        const { thumb } = await compressImage(buf, filename);

        if (!thumb) {
            return jsonResponse({ error: 'Thumbnail generation not supported for this file type' }, 400);
        }

        await fs.writeFile(thumbFile, thumb.buffer);

        // POURQUOI : Seule l'image de couverture active doit posséder une miniature.
        // On supprime donc tout autre fichier *-thumb dans le dossier de l'article pour
        // éviter d'accumuler des miniatures orphelines et préserver le quota de stockage / sync R2.
        const dir = path.dirname(thumbFile);
        if (await fileExists(dir)) {
            const files = await fs.readdir(dir);
            for (const f of files) {
                if (f.toLowerCase().includes('-thumb') && f !== thumbFilename) {
                    try {
                        await fs.unlink(path.join(dir, f));
                    } catch {
                        /* suppression au mieux */
                    }
                }
            }
        }

        return jsonResponse({
            ok: true,
            cover: publicImagePath(year, slug, filename),
            thumb: publicImagePath(year, slug, thumbFilename),
        });
    } catch (e) {
        return jsonResponse({ error: (e as Error).message ?? String(e) }, 500);
    }
};

export const DELETE: APIRoute = async ({ params, locals }) => {
    const blocked = requireAdmin(locals);
    if (blocked) return blocked;
    const { year, slug, filename } = params as { year: string; slug: string; filename: string };
    if (!validateYear(year) || !validateSlug(slug) || !validateFilename(filename)) {
        return new Response('Bad request', { status: 400 });
    }
    if (!isLocalAdmin(locals)) {
        try {
            await deleteRemoteImage('blog', year, slug, filename);
        } catch (error) {
            return toImageErrorResponse(error);
        }
        return jsonResponse({ ok: true });
    }
    await deleteImage(year, slug, filename);
    return jsonResponse({ ok: true });
};
