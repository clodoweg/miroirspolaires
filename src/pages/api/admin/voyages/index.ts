import type { APIRoute } from 'astro';
import { requireAdmin, jsonResponse, validateSlug, validateYear } from '@/lib/admin/shared';
import { listVoyages, writeVoyage, type VoyageFrontmatter } from '@/lib/admin/voyages-files';
import { contentRelativePath } from '@/lib/admin/content-files';
import { getContentReader } from '@/lib/admin/stores/content-reader';
import { toWriteErrorResponse } from '@/lib/admin/stores/content-writer';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
    const blocked = requireAdmin(locals);
    if (blocked) return blocked;
    return jsonResponse(await listVoyages());
};

export const POST: APIRoute = async ({ request, locals }) => {
    const blocked = requireAdmin(locals);
    if (blocked) return blocked;
    const body = (await request.json().catch(() => null)) as {
        year?: string;
        slug?: string;
        frontmatter?: VoyageFrontmatter;
        body?: string;
    } | null;
    if (!body?.year || !body?.slug || !body?.frontmatter || typeof body.body !== 'string') {
        return jsonResponse({ error: 'Missing year, slug, frontmatter, or body' }, 400);
    }
    if (!validateYear(body.year)) return jsonResponse({ error: 'Invalid year' }, 400);
    if (!validateSlug(body.slug)) return jsonResponse({ error: 'Invalid slug' }, 400);
    if ((await getContentReader().readText(contentRelativePath('voyages', body.year, body.slug))) !== null) {
        return jsonResponse({ error: 'Voyage already exists' }, 409);
    }
    let result;
    try {
        result = await writeVoyage(body.year, body.slug, body.frontmatter, body.body, { isNew: true });
    } catch (error) {
        return toWriteErrorResponse(error);
    }
    return jsonResponse({ ok: true, year: body.year, slug: body.slug, revision: result.revision });
};
