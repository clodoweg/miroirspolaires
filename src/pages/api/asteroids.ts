import type { APIRoute } from 'astro';
import { db } from '../../lib/db';
import { internalErrorResponse } from '../../lib/api/http';

export const GET: APIRoute = async () => {
    try {
        const result = await db.execute(`
            SELECT id, name, h, g, epoch, m, omega, node, inclination, e, n, a, ref
            FROM asteroids
            ORDER BY name ASC
        `);

        const asteroids = result.rows.map((row, index) => ({
            id: row.id as string,
            uniqueId: `${row.id}-${row.name}`.replace(/\s+/g, '_') + `_${index}`,
            name: row.name as string,
            h: Number(row.h),
            g: Number(row.g),
            epoch: row.epoch as string,
            m: Number(row.m),
            omega: Number(row.omega),
            node: Number(row.node),
            inclination: Number(row.inclination),
            e: Number(row.e),
            n: Number(row.n),
            a: Number(row.a),
            ref: (row.ref as string) || '',
        }));

        return new Response(JSON.stringify(asteroids), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=86400', // Cache 24h
            },
        });
    } catch (error) {
        return internalErrorResponse('asteroids', error);
    }
};
