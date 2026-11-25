import type { APIRoute } from 'astro';
import path from 'node:path';
import { requireAdmin, jsonResponse, validateSlug, validateYear } from '@/lib/admin/shared';
import { syncDirToR2 } from '@/lib/admin/r2-sync';
import { purgeReplacedImages } from '@/lib/admin/image-cache-purge';

export const prerender = false;

export const POST: APIRoute = async ({ params, locals }) => {
    const blocked = requireAdmin(locals);
    if (blocked) return blocked;
    const { year, slug } = params as { year: string; slug: string };
    if (!validateYear(year) || !validateSlug(slug)) return jsonResponse({ error: 'Invalid params' }, 400);
    const localDir = path.join(process.cwd(), 'src/assets/voyages', year, slug);
    const prefix = `voyages/${year}/${slug}/`;
    try {
        const result = await syncDirToR2(localDir, prefix);
        // POURQUOI : une image renvoyée sous le même nom garde son URL ; sans purge, le worker sert l'ancienne.
        const cachePurge = await purgeReplacedImages(result.replaced.map((name) => `${prefix}${name}`));
        return jsonResponse({ ...result, cachePurge });
    } catch (e) {
        return jsonResponse({ error: (e as Error).message ?? String(e) }, 500);
    }
};
