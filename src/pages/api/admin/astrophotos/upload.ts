import type { APIRoute } from 'astro';
import { requireAdmin, jsonResponse } from '@/lib/admin/shared';
import { uploadRaw } from '@/lib/admin/astrophotos';

export const prerender = false;

const MAX_BYTES = 100 * 1024 * 1024;

export const POST: APIRoute = async ({ request, locals }) => {
    const blocked = requireAdmin(locals);
    if (blocked) return blocked;
    const form = await request.formData().catch(() => null);
    if (!form) return jsonResponse({ error: 'Expected multipart/form-data' }, 400);
    const id = String(form.get('id') ?? '').trim();
    const year = String(form.get('year') ?? '').trim();
    const file = form.get('file');
    if (!(file instanceof File)) return jsonResponse({ error: 'Missing file' }, 400);
    if (!/^\d+$/.test(id)) return jsonResponse({ error: 'Invalid id' }, 400);
    if (!/^\d{4}$/.test(year)) return jsonResponse({ error: 'Invalid year' }, 400);
    if (file.size > MAX_BYTES) return jsonResponse({ error: `File exceeds ${MAX_BYTES} bytes` }, 413);
    if (!file.type.startsWith('image/')) return jsonResponse({ error: `Unsupported type ${file.type}` }, 415);
    const buf = new Uint8Array(await file.arrayBuffer());
    const result = await uploadRaw(id, year, buf);
    return jsonResponse({ ok: true, ...result });
};
