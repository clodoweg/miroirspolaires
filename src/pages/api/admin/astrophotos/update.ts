import type { APIRoute } from 'astro';
import { requireAdmin, jsonResponse } from '@/lib/admin/shared';
import { updatePhotoMetadata } from '@/lib/admin/astrophotos';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
    const blocked = requireAdmin(locals);
    if (blocked) return blocked;

    const body = await request.json().catch(() => null);
    if (!body) {
        return jsonResponse({ error: 'Payload JSON attendu' }, 400);
    }

    const { id, year, title, alt, wiki, tech, seo, draft } = body;

    if (!id || !/^\d+$/.test(id)) {
        return jsonResponse({ error: 'ID Astrobin manquant ou invalide' }, 400);
    }
    if (!year || !/^\d{4}$/.test(year)) {
        return jsonResponse({ error: 'Année manquante ou invalide' }, 400);
    }
    if (typeof title !== 'string' || !title.trim()) {
        return jsonResponse({ error: 'Titre manquant' }, 400);
    }

    try {
        await updatePhotoMetadata(id, year, title, { alt, wiki, tech, seo, draft });
        return jsonResponse({ ok: true });
    } catch (e) {
        return jsonResponse({ error: (e as Error).message }, 500);
    }
};
