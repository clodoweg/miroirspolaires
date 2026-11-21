/**
 * GET /api/admin/upstream : état des routes amont.
 * PUT /api/admin/upstream : enregistre la priorité dans `src/data/upstream-priority.json`.
 *
 * WARNING: le fichier n'atteint la production qu'une fois committé et déployé.
 */

import type { APIRoute } from 'astro';
import { requireAdmin, jsonResponse } from '@/lib/admin/shared';
import { getContentReader } from '@/lib/admin/stores/content-reader';
import { getContentWriter, toWriteErrorResponse } from '@/lib/admin/stores/content-writer';
import {
    buildServiceStates,
    parsePriorityInput,
    readPriorityFile,
    writePriorityFile,
} from '@/lib/admin/upstream-routes';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
    const blocked = requireAdmin(locals);
    if (blocked) return blocked;

    const priorityFile = await readPriorityFile(getContentReader());
    return jsonResponse({ updatedAt: priorityFile.updatedAt, services: buildServiceStates(priorityFile) });
};

export const PUT: APIRoute = async ({ request, locals }) => {
    const blocked = requireAdmin(locals);
    if (blocked) return blocked;

    const body = (await request.json().catch(() => null)) as { services?: unknown } | null;
    const services = parsePriorityInput(body?.services);
    if (!services) return jsonResponse({ error: 'Service ou route inconnus.' }, 400);

    let priorityFile;
    try {
        priorityFile = await writePriorityFile(getContentWriter(), services);
    } catch (error) {
        return toWriteErrorResponse(error);
    }
    return jsonResponse({ updatedAt: priorityFile.updatedAt, services: buildServiceStates(priorityFile) });
};
