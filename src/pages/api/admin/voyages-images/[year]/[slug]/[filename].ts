import type { APIRoute } from 'astro';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
    requireAdmin,
    validateSlug,
    validateYear,
    validateFilename,
    fileExists,
    jsonResponse,
    MIME_BY_EXT,
} from '@/lib/admin/shared';
import { assetFilePath, deleteImage, readVoyage, writeVoyage, relImagePath } from '@/lib/admin/voyages-files';
import { isLocalAdmin } from '@/lib/admin/auth/access';
import { GitHubApiError } from '@/lib/admin/github/app-client';
import { deleteRemoteImage, setRemoteCover, toImageErrorResponse } from '@/lib/admin/remote-images';
import { ContentConflictError, toWriteErrorResponse } from '@/lib/admin/stores/content-writer';

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
            return Response.redirect(`${r2Base.replace(/\/$/, '')}/voyages/${year}/${slug}/${filename}`, 302);
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
            await setRemoteCover('voyages', year, slug, filename);
        } catch (error) {
            return toImageErrorResponse(error);
        }
        return jsonResponse({ ok: true });
    }

    try {
        const sourceFile = assetFilePath(year, slug, filename);
        if (!(await fileExists(sourceFile))) {
            return new Response('Source image not found', { status: 404 });
        }

        const destFile = assetFilePath(year, slug, 'cover.jpg');
        const destThumbFile = assetFilePath(year, slug, 'cover-thumb.jpg');
        // POURQUOI : lire la source AVANT de supprimer l'ancienne couverture ; re-choisir
        // `cover.jpg` comme couverture supprimait sinon la source elle-même.
        const buf = await fs.readFile(sourceFile);

        // Delete old cover and cover-thumb if they exist
        if (await fileExists(destFile)) {
            await fs.unlink(destFile);
        }
        if (await fileExists(destThumbFile)) {
            await fs.unlink(destThumbFile);
        }

        await fs.writeFile(destFile, buf);

        // Generate cover-thumb.jpg
        const { compressImage } = await import('@/lib/admin/image-process');
        const { thumb } = await compressImage(buf, 'cover.jpg');
        if (thumb) {
            await fs.writeFile(destThumbFile, thumb.buffer);
        }

        // POURQUOI : Afin de garder le dossier propre et de s'assurer qu'aucune autre miniature obsolète
        // ne reste sur le disque, nous supprimons tous les autres fichiers contenant '-thumb' dans le dossier de l'album.
        const dir = path.dirname(destThumbFile);
        if (await fileExists(dir)) {
            const files = await fs.readdir(dir);
            for (const f of files) {
                if (f.toLowerCase().includes('-thumb') && f !== 'cover-thumb.jpg') {
                    try {
                        await fs.unlink(path.join(dir, f));
                    } catch {
                        /* best-effort */
                    }
                }
            }
        }

        // Force Vite to re-evaluate glob in imageService.ts
        const now = new Date();
        const filesToTouch = ['src/utils/imageService.ts', 'src/pages/voyages/[...slug].astro'];
        await Promise.all(
            filesToTouch.map(async (f) => {
                try {
                    await fs.utimes(path.join(process.cwd(), f), now, now);
                } catch {
                    /* best-effort */
                }
            }),
        );

        return jsonResponse({ ok: true });
    } catch (e) {
        console.error('[api] voyages-images PUT (couverture):', e);
        return jsonResponse({ error: 'Impossible de définir la couverture' }, 500);
    }
};

export const DELETE: APIRoute = async ({ params, locals }) => {
    const blocked = requireAdmin(locals);
    if (blocked) return blocked;
    const { year, slug, filename } = params as { year: string; slug: string; filename: string };
    if (!validateYear(year) || !validateSlug(slug) || !validateFilename(filename)) {
        return new Response('Bad request', { status: 400 });
    }
    // POURQUOI : à distance, supprimer d'abord l'image sur R2, puis committer le markdown nettoyé : le
    // commit recalcule les manifestes d'images d'après R2 et retire donc aussi l'entrée de l'image.
    if (!isLocalAdmin(locals)) {
        try {
            await deleteRemoteImage('voyages', year, slug, filename);
            const remoteVoyage = await readVoyage(year, slug);
            if (remoteVoyage) {
                const rel = relImagePath(year, slug, filename);
                const {
                    revision: _revision,
                    dirYear: _dirYear,
                    slug: _slug,
                    body: voyageBody,
                    ...frontmatter
                } = remoteVoyage;
                await writeVoyage(
                    year,
                    slug,
                    {
                        ...frontmatter,
                        gallery: remoteVoyage.gallery.filter((g) => g !== rel),
                        image: remoteVoyage.image === rel ? '' : remoteVoyage.image,
                    },
                    voyageBody,
                );
            }
        } catch (error) {
            if (error instanceof ContentConflictError || error instanceof GitHubApiError)
                return toWriteErrorResponse(error);
            return toImageErrorResponse(error);
        }
        return jsonResponse({ ok: true });
    }
    // Prune the markdown FIRST so Astro never sees a moment where the .md references
    // an asset that no longer exists on disk (which would surface as ImageNotFound in dev).
    const voyage = await readVoyage(year, slug);
    let mdPruned = false;
    if (voyage) {
        const rel = relImagePath(year, slug, filename);
        const nextGallery = voyage.gallery.filter((g) => g !== rel);
        const nextImage = voyage.image === rel ? '' : voyage.image;
        if (nextGallery.length !== voyage.gallery.length || nextImage !== voyage.image) {
            await writeVoyage(
                year,
                slug,
                {
                    title: voyage.title,
                    date: voyage.date,
                    description: voyage.description,
                    image: nextImage,
                    gallery: nextGallery,
                    country: voyage.country,
                    season: voyage.season,
                    year: voyage.year,
                    // POURQUOI : sans ce champ, supprimer une image publiait un voyage en brouillon.
                    draft: voyage.draft,
                },
                voyage.body,
            );
            mdPruned = true;
        }
    }

    await deleteImage(year, slug, filename);

    // Also delete the thumbnail if it exists (always `-thumb.jpg`, see compressImage()).
    const base = path.basename(filename, path.extname(filename));
    const thumbFilename = `${base}-thumb.jpg`;
    const thumbFile = assetFilePath(year, slug, thumbFilename);
    if (await fileExists(thumbFile)) {
        await deleteImage(year, slug, thumbFilename);
    }

    // Force Vite to re-evaluate `import.meta.glob('/src/assets/**/...', { eager: true })`
    // in imageService.ts so its compiled ES imports drop the moved file. Also touch the
    // route module so the page's transform cache is invalidated.
    const now = new Date();
    const filesToTouch = ['src/utils/imageService.ts', 'src/pages/voyages/[...slug].astro'];
    await Promise.all(
        filesToTouch.map(async (f) => {
            try {
                await fs.utimes(path.join(process.cwd(), f), now, now);
            } catch {
                /* best-effort */
            }
        }),
    );

    return jsonResponse({ ok: true, mdPruned });
};
