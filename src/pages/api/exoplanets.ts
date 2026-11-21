import type { APIRoute } from 'astro';
import { db } from '../../lib/db';
import { internalErrorResponse } from '../../lib/api/http';

export const GET: APIRoute = async () => {
    try {
        const result = await db.execute(`
            SELECT id, name, common_name as commonName, star_name as starName, v_mag as vMag,
                   ra, dec, period, epoch, duration, depth, mass, radius, distance,
                   spectral_type as spectralType, star_radius as starRadius, constellation, is_candidate as isCandidate
            FROM exoplanets
            ORDER BY name ASC
        `);

        const exoplanets = result.rows.map((row) => ({
            id: row.id as string,
            name: row.name as string,
            commonName: (row.commonName as string) || (row.name as string),
            starName: row.starName as string,
            vMag: row.vMag !== null ? Number(row.vMag) : 0,
            ra: Number(row.ra),
            dec: Number(row.dec),
            period: Number(row.period),
            epoch: Number(row.epoch),
            duration: row.duration !== null ? Number(row.duration) : 0,
            depth: row.depth !== null ? Number(row.depth) : 0,
            mass: row.mass !== null ? Number(row.mass) : 0,
            radius: row.radius !== null ? Number(row.radius) : 0,
            distance: row.distance !== null ? Number(row.distance) : 0,
            spectralType: (row.spectralType as string) || 'N/A',
            starRadius: row.starRadius !== null ? Number(row.starRadius) : 1.0,
            constellation: (row.constellation as string) || '',
            isCandidate: row.isCandidate === 1,
        }));

        return new Response(JSON.stringify(exoplanets), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=86400', // Cache 24h
            },
        });
    } catch (error) {
        return internalErrorResponse('exoplanets', error);
    }
};
