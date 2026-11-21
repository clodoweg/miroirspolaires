import type { APIRoute } from 'astro';
import { requireAdmin, jsonResponse, validateSlug, validateYear } from '@/lib/admin/shared';
import { readVoyage, writeVoyage, deleteVoyage, type VoyageFrontmatter } from '@/lib/admin/voyages-files';
import { toWriteErrorResponse } from '@/lib/admin/stores/content-writer';

export const prerender = false;

export const GET: APIRoute = async ({ params, locals }) => {
    const blocked = requireAdmin(locals);
    if (blocked) return blocked;
    const { year, slug } = params as { year: string; slug: string };
    if (!validateYear(year) || !validateSlug(slug)) return jsonResponse({ error: 'Invalid params' }, 400);
    const v = await readVoyage(year, slug);
    if (!v) return jsonResponse({ error: 'Not found' }, 404);
    return jsonResponse(v);
};

export const PUT: APIRoute = async ({ params, request, locals }) => {
    const blocked = requireAdmin(locals);
    if (blocked) return blocked;
    const { year, slug } = params as { year: string; slug: string };
    if (!validateYear(year) || !validateSlug(slug)) return jsonResponse({ error: 'Invalid params' }, 400);
    const body = (await request.json().catch(() => null)) as {
        frontmatter?: VoyageFrontmatter;
        body?: string;
        revision?: unknown;
    } | null;
    if (!body?.frontmatter || typeof body.body !== 'string') {
        return jsonResponse({ error: 'Missing frontmatter or body' }, 400);
    }
    const expectedRevision = typeof body.revision === 'string' ? body.revision : undefined;
    try {
        const { revision } = await writeVoyage(year, slug, body.frontmatter, body.body, { expectedRevision });
        return jsonResponse({ ok: true, revision });
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
        await deleteVoyage(year, slug, deleteAssets);
    } catch (error) {
        return toWriteErrorResponse(error);
    }
    return jsonResponse({ ok: true });
};
