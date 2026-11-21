/**
 * @file src/pages/api/admin/preview.ts
 * @description Reçoit le brouillon d'un article depuis l'éditeur et renvoie l'URL de son aperçu réel
 * (`/admin/apercu?id=…`). Le brouillon n'est gardé qu'en mémoire, rien n'est écrit sur le disque.
 */
import type { APIRoute } from 'astro';
import { parsePreviewDraft, savePreviewDraft } from '@/lib/admin/article-preview';
import { requireAdmin, jsonResponse } from '@/lib/admin/shared';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
    const blocked = requireAdmin(locals);
    if (blocked) return blocked;

    let payload: unknown;
    try {
        payload = await request.json();
    } catch {
        return jsonResponse({ error: 'JSON invalide.' }, 400);
    }
    const draft = parsePreviewDraft(payload);
    if (typeof draft === 'string') return jsonResponse({ error: draft }, 400);
    const id = savePreviewDraft(draft);
    return jsonResponse({ id, url: `/admin/apercu?id=${id}` });
};
