import type { APIRoute } from 'astro';
import { requireAdmin, jsonResponse } from '@/lib/admin/shared';
import { getContentReader } from '@/lib/admin/stores/content-reader';

export const prerender = false;

const REPORT_PATH = 'src/data/lighthouse-results.json';

export const GET: APIRoute = async ({ locals }) => {
    const blocked = requireAdmin(locals);
    if (blocked) return blocked;

    try {
        const content = await getContentReader().readText(REPORT_PATH);
        if (content === null) return jsonResponse({ error: 'No report found', results: [] }, 404);
        return jsonResponse(JSON.parse(content));
    } catch (e) {
        return jsonResponse(
            {
                error: 'Failed to read report: ' + String(e),
                results: [],
            },
            500,
        );
    }
};
