import type { APIRoute } from 'astro';
import { requireAdmin, jsonResponse } from '@/lib/admin/shared';
import { SCRIPTS } from '@/lib/admin/scripts';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
    const blocked = requireAdmin(locals);
    if (blocked) return blocked;
    return jsonResponse(
        SCRIPTS.map(({ command, args, ...rest }) => ({
            ...rest,
            commandPreview: [command, ...args].join(' '),
        })),
    );
};
