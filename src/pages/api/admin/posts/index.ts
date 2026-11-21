import type { APIRoute } from 'astro';
import { requireAdmin, jsonResponse, validateSlug, validateYear } from '@/lib/admin/shared';
import { isLocalAdmin } from '@/lib/admin/auth/access';
import { contentRelativePath } from '@/lib/admin/content-files';
import { getContentReader } from '@/lib/admin/stores/content-reader';
import { toWriteErrorResponse } from '@/lib/admin/stores/content-writer';
import { listPosts, writePost, renamePostAssets, type PostFrontmatter } from '@/lib/admin/blog-files';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
    const blocked = requireAdmin(locals);
    if (blocked) return blocked;
    const posts = await listPosts();
    return jsonResponse(posts);
};

export const POST: APIRoute = async ({ request, locals }) => {
    const blocked = requireAdmin(locals);
    if (blocked) return blocked;
    const body = (await request.json().catch(() => null)) as {
        year?: string;
        slug?: string;
        oldYear?: string;
        oldSlug?: string;
        frontmatter?: PostFrontmatter;
        body?: string;
    } | null;
    if (!body?.year || !body?.slug || !body?.frontmatter || typeof body.body !== 'string') {
        return jsonResponse({ error: 'Missing year, slug, frontmatter, or body' }, 400);
    }
    if (!validateYear(body.year)) return jsonResponse({ error: 'Invalid year' }, 400);
    if (!validateSlug(body.slug)) return jsonResponse({ error: 'Invalid slug' }, 400);

    // POURQUOI : contrôler le doublon AVANT de déplacer les images, sinon une création refusée
    // (409) déplaçait quand même les assets du brouillon.
    if ((await getContentReader().readText(contentRelativePath('blog', body.year, body.slug))) !== null) {
        return jsonResponse({ error: 'Post already exists' }, 409);
    }

    // Renommer les assets physiques si le slug ou l'année a été modifiée avant la première sauvegarde.
    // POURQUOI local seulement : à distance, les images ne passent pas encore par l'admin (phase 3).
    if (
        isLocalAdmin(locals) &&
        body.oldYear &&
        body.oldSlug &&
        validateYear(body.oldYear) &&
        validateSlug(body.oldSlug)
    ) {
        await renamePostAssets(body.oldYear, body.oldSlug, body.year, body.slug);
    }
    let result;
    try {
        result = await writePost(body.year, body.slug, body.frontmatter, body.body, { isNew: true });
    } catch (error) {
        return toWriteErrorResponse(error);
    }
    return jsonResponse({
        ok: true,
        year: body.year,
        slug: body.slug,
        frontmatter: result.frontmatter,
        body: result.body,
        revision: result.revision,
    });
};
