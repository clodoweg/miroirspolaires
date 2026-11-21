/**
 * POST /api/admin/upstream/probe : teste une route du registre, désignée par ses ids.
 *
 * WARNING: le corps ne porte jamais d'URL. Seules les routes du registre sont appelées.
 */

import type { APIRoute } from 'astro';
import { UPSTREAM_SERVICES, type UpstreamServiceId } from '@/config/upstream-routes';
import { requireAdmin, jsonResponse } from '@/lib/admin/shared';
import { probeUpstreamRoute } from '@/lib/admin/upstream-routes';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
    const blocked = requireAdmin(locals);
    if (blocked) return blocked;

    const body = (await request.json().catch(() => null)) as { serviceId?: string; routeId?: string } | null;
    const service = Object.hasOwn(UPSTREAM_SERVICES, body?.serviceId ?? '')
        ? UPSTREAM_SERVICES[body?.serviceId as UpstreamServiceId]
        : undefined;
    const route = service?.routes.find((candidate) => candidate.id === body?.routeId);
    if (!service || !route) return jsonResponse({ error: 'Route inconnue.' }, 404);

    return jsonResponse(await probeUpstreamRoute(process.cwd(), service.id, route));
};
