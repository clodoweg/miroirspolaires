/**
 * @file src/pages/api/admin/seo.ts
 * @description Audit SEO de l'admin (`runSeoAudit`, `src/lib/admin/seo-audit.ts`), lu par `getContentReader()` :
 * disque en local, branche dev sur l'admin distant.
 */

import type { APIRoute } from 'astro';
import { runSeoAudit } from '@/lib/admin/seo-audit';
import { getContentReader } from '@/lib/admin/stores/content-reader';
import { requireAdmin, jsonResponse } from '@/lib/admin/shared';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
    const blocked = requireAdmin(locals);
    if (blocked) return blocked;

    try {
        return jsonResponse(await runSeoAudit(getContentReader()), 200, { 'Cache-Control': 'no-store' });
    } catch (err) {
        return jsonResponse({ error: (err as Error).message }, 500);
    }
};
