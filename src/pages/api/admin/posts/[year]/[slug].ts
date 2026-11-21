import type { APIRoute } from 'astro';
import { requireAdmin, jsonResponse, validateSlug, validateYear } from '@/lib/admin/shared';
import { readPost, writePost, deletePost, type PostFrontmatter } from '@/lib/admin/blog-files';
import { toWriteErrorResponse } from '@/lib/admin/stores/content-writer';

export const prerender = false;

export const GET: APIRoute = async ({ params, locals }) => {
    const blocked = requireAdmin(locals);
    if (blocked) return blocked;
    const { year, slug } = params as { year: string; slug: string };
    if (!validateYear(year) || !validateSlug(slug)) return jsonResponse({ error: 'Invalid params' }, 400);
    const post = await readPost(year, slug);
    if (!post) return jsonResponse({ error: 'Not found' }, 404);
    return jsonResponse(post);
};

export const PUT: APIRoute = async ({ params, request, locals }) => {
    const blocked = requireAdmin(locals);
    if (blocked) return blocked;
    const { year, slug } = params as { year: string; slug: string };
    if (!validateYear(year) || !validateSlug(slug)) return jsonResponse({ error: 'Invalid params' }, 400);
    const body = (await request.json().catch(() => null)) as {
        frontmatter?: PostFrontmatter;
        body?: string;
        revision?: unknown;
    } | null;
    if (!body?.frontmatter || typeof body.body !== 'string') {
        return jsonResponse({ error: 'Missing frontmatter or body' }, 400);
    }
    const expectedRevision = typeof body.revision === 'string' ? body.revision : undefined;
    try {
        const result = await writePost(year, slug, body.frontmatter, body.body, { expectedRevision });
        return jsonResponse({
            ok: true,
            frontmatter: result.frontmatter,
            body: result.body,
            revision: result.revision,
        });
    } catch (error) {
        return toWriteErrorResponse(error);
    }
};

export const DELETE: APIRoute = async ({ params, url, locals }) => {
    const blocked = requireAdmin(locals);
    if (blocked) return blocked;
    const { year, slug } = params as { year: string; slug: string };
    if (!validateYear(year) || !validateSlug(slug)) return jsonResponse({ error: 'Invalid params' }, 400);
    const deleteAssets = url.searchParams.get('assets') === '1';
    try {
        await deletePost(year, slug, deleteAssets);
    } catch (error) {
        return toWriteErrorResponse(error);
    }
    return jsonResponse({ ok: true });
};
