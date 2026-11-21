import { describe, it, expect, vi, beforeEach } from 'vitest';

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('../../lib/db', () => ({ db: { execute } }));

import { GET as getAsteroids } from './asteroids';
import { GET as getComets } from './comets';
import { GET as getExoplanets } from './exoplanets';

const routes = [
    ['asteroids', getAsteroids],
    ['comets', getComets],
    ['exoplanets', getExoplanets],
] as const;

describe('routes prérendues asteroids / comets / exoplanets', () => {
    beforeEach(() => {
        execute.mockReset();
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it.each(routes)('%s : renvoie un tableau JSON mis en cache 24 h', async (_name, GET) => {
        execute.mockResolvedValue({ rows: [] });
        const response = await GET({} as Parameters<typeof GET>[0]);
        expect(response.status).toBe(200);
        expect(response.headers.get('Cache-Control')).toContain('max-age=86400');
        expect(Array.isArray(await response.json())).toBe(true);
    });

    it.each(routes)('%s : ne recopie pas le message de libSQL', async (_name, GET) => {
        execute.mockRejectedValue(new Error('LIBSQL_ERROR: no such table secret_table'));
        const response = await GET({} as Parameters<typeof GET>[0]);
        expect(response.status).toBe(500);
        expect(JSON.stringify(await response.json())).not.toContain('secret_table');
    });

    it('asteroids : construit un identifiant unique et remplace une référence absente', async () => {
        execute.mockResolvedValue({
            rows: [
                { id: '1', name: 'Ceres Ferdinandea', h: '3.3', g: '0.12', epoch: 'K25', a: '2.77', ref: null },
                { id: '2', name: 'Pallas', h: 4.1, ref: 'MPC' },
            ],
        });
        const body = await (await getAsteroids({} as Parameters<typeof getAsteroids>[0])).json();
        expect(body[0]).toMatchObject({ uniqueId: '1-Ceres_Ferdinandea_0', h: 3.3, a: 2.77, ref: '' });
        expect(body[1]).toMatchObject({ uniqueId: '2-Pallas_1', ref: 'MPC' });
    });

    it('comets : convertit les magnitudes absentes en null JSON et garde les présentes', async () => {
        execute.mockResolvedValue({
            rows: [
                {
                    id: 'C/2023 A3',
                    name: 'Tsuchinshan ATLAS',
                    pYear: 2024,
                    q: '0.39',
                    mag: null,
                    slope: null,
                    ref: null,
                },
                { id: '1P', name: 'Halley', pYear: 1986, mag: '5.5', slope: '4', ref: 'JPL' },
            ],
        });
        const body = await (await getComets({} as Parameters<typeof getComets>[0])).json();
        expect(body[0]).toMatchObject({
            uniqueId: 'C/2023_A3-Tsuchinshan_ATLAS_0',
            q: 0.39,
            mag: null,
            slope: null,
            ref: '',
        });
        expect(body[1]).toMatchObject({ mag: 5.5, slope: 4, ref: 'JPL' });
    });

    it('exoplanets : applique les valeurs par défaut des colonnes nulles', async () => {
        execute.mockResolvedValue({
            rows: [
                {
                    id: 'a',
                    name: 'Kepler-1 b',
                    commonName: null,
                    vMag: null,
                    duration: null,
                    depth: null,
                    mass: null,
                    radius: null,
                    distance: null,
                    spectralType: null,
                    starRadius: null,
                    constellation: null,
                    isCandidate: 1,
                },
                {
                    id: 'b',
                    name: 'HD 209458 b',
                    commonName: 'Osiris',
                    vMag: '7.6',
                    duration: 3,
                    depth: 1.5,
                    mass: 0.7,
                    radius: 1.4,
                    distance: 48,
                    spectralType: 'G0V',
                    starRadius: 1.2,
                    constellation: 'Peg',
                    isCandidate: 0,
                },
            ],
        });
        const body = await (await getExoplanets({} as Parameters<typeof getExoplanets>[0])).json();
        expect(body[0]).toMatchObject({
            commonName: 'Kepler-1 b',
            vMag: 0,
            duration: 0,
            depth: 0,
            mass: 0,
            radius: 0,
            distance: 0,
            spectralType: 'N/A',
            starRadius: 1,
            constellation: '',
            isCandidate: true,
        });
        expect(body[1]).toMatchObject({
            commonName: 'Osiris',
            vMag: 7.6,
            mass: 0.7,
            spectralType: 'G0V',
            starRadius: 1.2,
            constellation: 'Peg',
            isCandidate: false,
        });
    });
});
