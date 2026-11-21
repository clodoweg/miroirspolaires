import { describe, it, expect, vi, beforeEach } from 'vitest';

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('../../lib/db', () => ({ db: { execute } }));

import { GET } from './variable-stars';

type ExecuteCall = { sql: string; args: unknown[] } | string;

function starRow(overrides: Record<string, unknown> = {}) {
    return {
        id: 'v1',
        name: 'V0012 Cyg',
        starName: null,
        constellation: 'Cyg',
        ra: 300,
        dec: 40,
        vMagMin: 9,
        vMagMax: 11,
        period: 300,
        epoch: 2450000,
        type: 'M',
        spectralType: null,
        distance: null,
        details: null,
        ...overrides,
    };
}

function callRoute(query: string) {
    const url = new URL(`https://www.miroirspolaires.fr/api/variable-stars${query}`);
    return GET({ url, request: new Request(url) } as Parameters<typeof GET>[0]);
}

function dataQuery(): { sql: string; args: unknown[] } {
    const call = execute.mock.calls
        .map(([argument]) => argument as ExecuteCall)
        .find((argument) => typeof argument === 'object' && argument.sql.includes('FROM variable_stars'));
    if (!call || typeof call === 'string') throw new Error('requête de données absente');
    return call;
}

describe('GET /api/variable-stars', () => {
    beforeEach(() => {
        execute.mockReset();
        execute.mockImplementation(async (argument: ExecuteCall) => {
            if (typeof argument === 'string') return { rows: [{ value: '4833587' }] };
            return { rows: [starRow()] };
        });
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('pagine par défaut avec LIMIT 50 OFFSET 0 et le total en métadonnées', async () => {
        const response = await callRoute('');
        const body = await response.json();
        expect(response.status).toBe(200);
        expect(dataQuery().sql).toMatch(/LIMIT 50 OFFSET 0/);
        expect(body).toMatchObject({ total: 4833587, page: 1, limit: 50, isExact: true });
        expect(body.stars[0]).toMatchObject({ name: 'V0012 Cyg', type: 'mira', spectralType: 'N/A' });
    });

    it.each([
        ['limit négatif (illimité en SQLite)', '?limit=-1', /LIMIT 1 OFFSET 0/],
        ['limit énorme', '?limit=1000000', /LIMIT 100 OFFSET 0/],
        ['page non numérique (OFFSET NaN)', '?page=abc', /LIMIT 50 OFFSET 0/],
        ['dernière page autorisée', '?page=1000&limit=100', /LIMIT 100 OFFSET 99900/],
    ])('borne %s', async (_label, query, expected) => {
        const response = await callRoute(query);
        expect(response.status).toBe(200);
        expect(dataQuery().sql).toMatch(expected);
    });

    it('renvoie une liste vide, sans requête, au-delà de la dernière page autorisée', async () => {
        const response = await callRoute('?page=99999999&limit=100');
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ stars: [], isExact: false });
        expect(execute).not.toHaveBeenCalled();
    });

    it('borne le lot SQL du filtre d’observabilité même avec page négative', async () => {
        await callRoute('?filterVisibleCeSoir=true&lat=45&lon=5&page=-1');
        expect(dataQuery().sql).toMatch(/LIMIT 250\b/);
    });

    it('cherche le préfixe par intervalle NOCASE (jokers littéraux) et tronque la saisie', async () => {
        await callRoute(`?search=${encodeURIComponent('%_x' + 'y'.repeat(200))}`);
        const { sql, args } = dataQuery();
        expect(sql).toContain('name COLLATE NOCASE >= ? AND name COLLATE NOCASE < ?');
        expect(sql).not.toContain('LIKE');
        const [lower, upper] = args as string[];
        expect(lower.startsWith('%_x')).toBe(true);
        expect(lower.length).toBe(64);
        expect(upper).toBe(`${lower}${String.fromCodePoint(0x10ffff)}`);
    });

    it('cible l’index de constellation quand la recherche est un nom de constellation', async () => {
        await callRoute('?search=cygne');
        const { sql, args } = dataQuery();
        expect(sql).toContain('constellation IN (?)');
        expect(args).toEqual(['Cyg']);
    });

    it('ignore une colonne de tri inconnue (pas d’injection SQL)', async () => {
        await callRoute('?sortCol=name;DROP TABLE variable_stars&sortDir=desc');
        expect(dataQuery().sql).not.toContain('DROP');
    });

    it('ignore des magnitudes et une latitude hors bornes', async () => {
        await callRoute('?minMag=abc&maxMag=1e9&lat=999');
        const { sql } = dataQuery();
        expect(sql).not.toContain('v_mag_min >=');
        expect(sql).not.toContain('v_mag_max <=');
        expect(sql).not.toContain('dec >');
    });

    it('refuse une date invalide', async () => {
        const response = await callRoute('?date=jamais');
        expect(response.status).toBe(400);
        expect(execute).not.toHaveBeenCalled();
    });

    it('renvoie un 500 générique sans le message de libSQL', async () => {
        execute.mockRejectedValue(new Error('SQLITE_ERROR near "secret_column"'));
        const response = await callRoute('');
        expect(response.status).toBe(500);
        expect(JSON.stringify(await response.json())).not.toContain('secret_column');
    });

    it.each([
        ['EA', 'eclipsing'],
        ['UG', 'cataclysmique'],
        ['ZAND', 'cataclysmique'],
        ['DCEP', 'cepheid'],
        ['RRAB', 'cepheid'],
        ['M', 'mira'],
        ['SR', 'semiregular'],
        [null, 'semiregular'],
    ])('normalise le type %s en %s', async (rawType, expected) => {
        execute.mockResolvedValue({ rows: [starRow({ type: rawType })] });
        const body = await (await callRoute('?type=all')).json();
        expect(body.stars[0].type).toBe(expected);
    });

    it('convertit les colonnes nulles en valeurs par défaut et garde les valeurs présentes', async () => {
        execute.mockResolvedValue({
            rows: [
                starRow({ vMagMin: null, vMagMax: null, period: null, epoch: null, constellation: null }),
                starRow({ starName: 'Mira', spectralType: 'M7', distance: 92, details: 'Prototype' }),
            ],
        });
        const body = await (await callRoute('')).json();
        expect(body.stars[0]).toMatchObject({
            vMagMin: 0,
            vMagMax: 0,
            period: 0,
            epoch: 0,
            constellation: '',
            starName: 'V0012 Cyg',
        });
        expect(body.stars[1]).toMatchObject({
            starName: 'Mira',
            spectralType: 'M7',
            distance: 92,
            details: 'Prototype',
        });
    });

    it.each([
        ['eclipsing', "type IN ('eclipsing', 'eclipse', 'EA', 'EB', 'EW')"],
        ['cataclysmic', "type IN ('cataclysmique', 'cataclysmic', 'UG', 'N', 'ZAND')"],
        ['cepheid', "type IN ('cepheid', 'rr_lyrae', 'DCEP', 'RR')"],
        ['mira', "type IN ('mira', 'M')"],
        ['semiregular', "type IN ('semiregular', 'SR', 'L')"],
    ])('filtre la famille de types %s', async (type, clause) => {
        await callRoute(`?type=${type}`);
        expect(dataQuery().sql).toContain(clause);
    });

    it('filtre un type exact inconnu par paramètre lié et renvoie un total non exact', async () => {
        const body = await (await callRoute('?type=BY&constellation=Ori')).json();
        const { sql, args } = dataQuery();
        expect(sql).toContain('type = ?');
        expect(sql).toContain('constellation = ?');
        expect(args).toEqual(['BY', 'Ori']);
        expect(sql).not.toContain('ORDER BY');
        expect(body).toMatchObject({ total: -1, isExact: false });
        expect(execute).toHaveBeenCalledTimes(1);
    });

    it.each([
        ['mira', 'mira'],
        ['semi', 'semiregular'],
        ['Semi-régulière', 'semiregular'],
        ['binaire', 'eclipsing'],
        ['Binaire à éclipses', 'eclipsing'],
        ['rr lyrae', 'cepheid'],
        ['cephei', 'cepheid'],
        ['catacl', 'cataclysmique'],
    ])('cible l’index de type pour la recherche « %s »', async (search, type) => {
        await callRoute(`?search=${encodeURIComponent(search)}`);
        const { sql, args } = dataQuery();
        expect(sql).toContain('type = ?');
        expect(args).toEqual([type]);
    });

    it.each(['RR', 'RR And', 'RR Lyr', 'V1500 Cyg', 'Delta Cephei', 'R Leo'])(
        'cherche « %s » par nom, sans le prendre pour un type',
        async (search) => {
            await callRoute(`?search=${encodeURIComponent(search)}`);
            const { sql, args } = dataQuery();
            expect(sql).not.toContain('type = ?');
            expect(sql).toContain('name COLLATE NOCASE >= ?');
            expect(args[0]).toBe(search);
        },
    );

    it('ajoute les bornes de magnitude, d’amplitude et de déclinaison', async () => {
        await callRoute('?minMag=8&maxMag=12&minAmplitude=1.5&lat=45');
        const { sql, args } = dataQuery();
        expect(sql).toContain('v_mag_min >= ?');
        expect(sql).toContain('v_mag_max <= ?');
        expect(sql).toContain('(v_mag_max - v_mag_min) >= ?');
        expect(sql).toContain('dec > ?');
        expect(args).toEqual([8, 12, 1.5, -45]);
    });

    it('ignore une amplitude hors bornes', async () => {
        await callRoute('?minAmplitude=999');
        expect(dataQuery().sql).not.toContain('v_mag_max - v_mag_min');
    });

    it('trie la requête SQL sur une colonne autorisée sans filtre', async () => {
        await callRoute('?sortCol=distance&sortDir=desc');
        expect(dataQuery().sql).toContain('ORDER BY distance DESC');
    });

    it('garde le total par défaut si la métadonnée est absente ou illisible', async () => {
        execute.mockImplementation(async (argument: ExecuteCall) => {
            if (typeof argument === 'string') return { rows: [] };
            return { rows: [starRow()] };
        });
        expect((await (await callRoute('')).json()).total).toBe(4833587);

        execute.mockImplementation(async (argument: ExecuteCall) => {
            if (typeof argument === 'string') throw new Error('no such table');
            return { rows: [starRow()] };
        });
        const body = await (await callRoute('')).json();
        expect(body).toMatchObject({ total: 4833587, isExact: true });
    });

    describe('filtres d’observabilité', () => {
        const NIGHT = encodeURIComponent('2026-01-15T22:00:00Z');

        function rows() {
            return [
                starRow({ id: 'b', name: 'B Polaire', dec: 88, vMagMin: 8, vMagMax: 9, period: 10 }),
                starRow({ id: 'a', name: 'A Polaire', dec: 87, vMagMin: 7, vMagMax: 10, period: 30 }),
                starRow({ id: 'trop-faible', name: 'C Faible', dec: 86, vMagMin: 25, vMagMax: 26 }),
                starRow({ id: 'australe', name: 'D Australe', dec: -85 }),
            ];
        }

        beforeEach(() => {
            execute.mockImplementation(async () => ({ rows: rows() }));
        });

        it('ne garde que les étoiles assez hautes et accessibles à l’instrument', async () => {
            const body = await (
                await callRoute(`?filterObservable=true&lat=45&lon=5&aperture=100&date=${NIGHT}`)
            ).json();
            const { sql, args } = dataQuery();
            expect(sql).toContain('dec >= ?');
            expect(sql).toContain('v_mag_max > 0 AND v_mag_max <= ?');
            expect(sql).toContain('ORDER BY v_mag_max ASC');
            expect(args).toEqual([-15, 105, 24]);
            expect(body.stars.map((star: { name: string }) => star.name)).toEqual(['A Polaire', 'B Polaire']);
            expect(body).toMatchObject({ total: 2, isExact: false });
        });

        it('utilise la limite photo fournie et trie en JavaScript sur une colonne numérique', async () => {
            const body = await (
                await callRoute(
                    `?filterObservable=true&lat=45&lon=5&aperture=100&limitMagPhoto=7.5&sortCol=period&sortDir=desc&date=${NIGHT}`,
                )
            ).json();
            expect(dataQuery().args).toEqual([-15, 105, 11.5]);
            expect(dataQuery().sql).toContain('ORDER BY period DESC');
            expect(body.stars.map((star: { id: string }) => star.id)).toEqual(['a']);
        });

        it('se replie sur la limite estimée si limitMagPhoto est invalide', async () => {
            await callRoute(`?filterObservable=true&lat=45&aperture=100&limitMagPhoto=abc&date=${NIGHT}`);
            expect(dataQuery().args).toEqual([-15, 105, 24]);
        });

        it('filtre « visible ce soir » avec un site par défaut et un total exact si la requête est filtrée', async () => {
            const body = await (
                await callRoute(`?filterVisibleCeSoir=true&search=xyz&sortCol=name&sortDir=desc&date=${NIGHT}`)
            ).json();
            const { sql } = dataQuery();
            expect(sql).not.toContain('dec >= ?');
            expect(sql).not.toContain('ORDER BY');
            expect(body.isExact).toBe(true);
            expect(body.total).toBe(body.stars.length);
        });

        it('borne la déclinaison à ±90° autour de la latitude pour « visible ce soir »', async () => {
            const body = await (
                await callRoute(`?filterVisibleCeSoir=true&lat=45&lon=5&aperture=100&date=${NIGHT}`)
            ).json();
            const { args } = dataQuery();
            expect(args).toEqual([-45, 135, 24]);
            expect(body.stars.map((star: { id: string }) => star.id)).not.toContain('australe');
            expect(body.stars.map((star: { name: string }) => star.name)).toEqual([
                'A Polaire',
                'B Polaire',
                'C Faible',
            ]);
        });

        it('n’ajoute pas de borne de magnitude sans instrument', async () => {
            await callRoute(`?filterVisibleCeSoir=true&lat=45&date=${NIGHT}`);
            expect(dataQuery().sql).toContain('v_mag_max > 0 AND v_mag_max <= ?');
            await callRoute(`?filterObservable=true&lat=45&limitMagPhoto=-1&date=${NIGHT}`);
            const calls = execute.mock.calls.map(([argument]) => argument as ExecuteCall);
            const last = calls[calls.length - 1];
            expect(typeof last === 'object' && last.sql.includes('v_mag_max <= ?')).toBe(false);
        });
    });
});
