import type { APIRoute } from 'astro';
import { db } from '../../lib/db';
import { internalErrorResponse } from '../../lib/api/http';

export const GET: APIRoute = async () => {
    try {
        const result = await db.execute(`
            SELECT id, name, p_year as pYear, p_month as pMonth, p_day as pDay,
                   q, e, omega, node, inclination, epoch_str as epochStr, mag, slope, ref
            FROM comets
            ORDER BY name ASC
        `);

        const comets = result.rows.map((row, index) => ({
            id: row.id as string,
            uniqueId: `${row.id}-${row.name}`.replace(/\s+/g, '_') + `_${index}`,
            name: row.name as string,
            pYear: Number(row.pYear),
            pMonth: Number(row.pMonth),
            pDay: Number(row.pDay),
            q: Number(row.q),
            e: Number(row.e),
            omega: Number(row.omega),
            node: Number(row.node),
            inclination: Number(row.inclination),
            epochStr: row.epochStr as string,
            mag: row.mag !== null ? Number(row.mag) : NaN,
            slope: row.slope !== null ? Number(row.slope) : NaN,
            ref: (row.ref as string) || '',
        }));

        return new Response(JSON.stringify(comets), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=86400', // Cache 24h
            },
        });
    } catch (error) {
        return internalErrorResponse('comets', error);
    }
};
