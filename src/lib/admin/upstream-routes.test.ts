// @vitest-environment node
/**
 * Tests de la gestion des routes amont pour l'admin : validation, écriture du fichier et sonde des routes.
 */

import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveServiceRoutes, UPSTREAM_SERVICE_IDS, type UpstreamRoute } from '@/config/upstream-routes';
import {
    buildServiceStates,
    parsePriorityInput,
    probeUpstreamRoute,
    readPriorityFile,
    writePriorityFile,
} from './upstream-routes';
import { createFsContentReader } from './stores/content-reader';
import { createFsContentWriter } from './stores/content-writer';

const fixture = (name: string) => readFileSync(`src/test/fixtures/vizier-asu/${name}.tsv`, 'utf-8');

let rootDirectory: string;
const fetchMock = vi.fn();

function routeOf(serviceId: Parameters<typeof resolveServiceRoutes>[0], routeId: string): UpstreamRoute {
    const route = resolveServiceRoutes(serviceId).find((candidate) => candidate.id === routeId);
    if (!route) throw new Error(`Route inconnue : ${routeId}`);
    return route;
}

beforeEach(() => {
    rootDirectory = mkdtempSync(path.join(tmpdir(), 'upstream-'));
    mkdirSync(path.join(rootDirectory, 'src/data'), { recursive: true });
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
    rmSync(rootDirectory, { recursive: true, force: true });
    vi.unstubAllGlobals();
});

describe('parsePriorityInput', () => {
    it('accepte un choix connu et dédoublonne', () => {
        expect(parsePriorityInput({ simbad: { order: ['idia', 'idia', 'cds'], disabled: ['cds'] } })).toEqual({
            simbad: { order: ['idia', 'cds'], disabled: ['cds'] },
        });
    });

    it.each([
        ['null', null],
        ['tableau', []],
        ['service inconnu', { autre: { order: [], disabled: [] } }],
        ['route inconnue', { simbad: { order: ['evil'], disabled: [] } }],
        ['liste absente', { simbad: { order: ['cds'] } }],
        ['id non textuel', { simbad: { order: [1], disabled: [] } }],
        ['service nul', { simbad: null }],
    ])('refuse : %s', (_label, input) => {
        expect(parsePriorityInput(input)).toBeNull();
    });
});

describe('fichier de priorité', () => {
    it('écrit le choix daté, puis le relit', async () => {
        const written = await writePriorityFile(createFsContentWriter(rootDirectory), {
            simbad: { order: ['idia'], disabled: [] },
        });
        expect(written.updatedAt).toMatch(/^\d{4}-/);
        expect(await readPriorityFile(createFsContentReader(rootDirectory))).toEqual(written);
    });

    it('applique le choix à l’état affiché', () => {
        const states = buildServiceStates({
            updatedAt: null,
            services: { simbad: { order: ['idia'], disabled: ['cds'] } },
        });
        expect(states.map((state) => state.id)).toEqual(UPSTREAM_SERVICE_IDS);
        const simbadRoutes = states[0].routes;
        expect(simbadRoutes[0].id).toBe('idia');
        expect(simbadRoutes.find((route) => route.id === 'cds')?.enabled).toBe(false);
    });
});

describe('probeUpstreamRoute', () => {
    const textResponse = (body: string, headers: Record<string, string> = {}) =>
        new Response(body, { status: 200, headers });

    it('TAP : vérifie la présence d’une ligne', async () => {
        fetchMock.mockResolvedValue(textResponse(JSON.stringify({ data: [['M 1']] })));
        const result = await probeUpstreamRoute(rootDirectory, 'simbad', routeOf('simbad', 'harvard'));
        expect(result.status).toBe('ok');
        expect(new URL(fetchMock.mock.calls[0][0]).origin).toBe('https://simbad.harvard.edu');
    });

    it('TAP : signale une réponse sans donnée', async () => {
        fetchMock.mockResolvedValue(textResponse(JSON.stringify({ data: [] })));
        const result = await probeUpstreamRoute(rootDirectory, 'vizier', routeOf('vizier', 'cds-tap'));
        expect(result.status).toBe('invalid-response');
    });

    it('ASU : lit une réponse réelle', async () => {
        fetchMock.mockResolvedValue(textResponse(fixture('sh2-exact')));
        const result = await probeUpstreamRoute(rootDirectory, 'vizier', routeOf('vizier', 'nao-asu'));
        expect(result.status).toBe('ok');
    });

    it('ASU : traite une table sans la colonne attendue comme invalide', async () => {
        fetchMock.mockResolvedValue(textResponse(fixture('unknown-table')));
        const result = await probeUpstreamRoute(rootDirectory, 'vizier', routeOf('vizier', 'nao-asu'));
        expect(result.status).toBe('invalid-response');
        expect(result.detail).toContain('colonnes absentes');
    });

    it('Sesame : exige des coordonnées', async () => {
        fetchMock.mockResolvedValueOnce(textResponse('%J 10.6 +41.2'));
        expect((await probeUpstreamRoute(rootDirectory, 'sesame', routeOf('sesame', 'cds'))).status).toBe('ok');
        fetchMock.mockResolvedValueOnce(textResponse('rien'));
        expect((await probeUpstreamRoute(rootDirectory, 'sesame', routeOf('sesame', 'cds'))).status).toBe(
            'invalid-response',
        );
    });

    it.each([
        ['hips2fits', 'cds'],
        ['hips2fits', 'skyview'],
    ] as const)('%s/%s : exige une image', async (serviceId, routeId) => {
        fetchMock.mockResolvedValueOnce(textResponse('x', { 'content-type': 'image/jpeg' }));
        expect((await probeUpstreamRoute(rootDirectory, serviceId, routeOf(serviceId, routeId))).status).toBe('ok');
        fetchMock.mockResolvedValueOnce(textResponse('<html>', { 'content-type': 'text/html' }));
        expect((await probeUpstreamRoute(rootDirectory, serviceId, routeOf(serviceId, routeId))).status).toBe(
            'invalid-response',
        );
    });

    it('HiPS : lit le fichier properties', async () => {
        fetchMock.mockResolvedValue(textResponse('hips_order = 9'));
        const result = await probeUpstreamRoute(rootDirectory, 'hipsSky', routeOf('hipsSky', 'esa'));
        expect(result.status).toBe('ok');
        expect(fetchMock.mock.calls[0][0]).toBe('https://skies.esac.esa.int/DSSColor/properties');
    });

    it('script distant : vérifie le contenu', async () => {
        fetchMock.mockResolvedValue(textResponse('var aladin = 1'));
        const result = await probeUpstreamRoute(rootDirectory, 'aladinScript', routeOf('aladinScript', 'cds'));
        expect(result.status).toBe('ok');
    });

    it('script auto-hébergé : vérifie le fichier sans appel réseau', async () => {
        const route = routeOf('aladinScript', 'self-hosted');
        expect((await probeUpstreamRoute(rootDirectory, 'aladinScript', route)).status).toBe('invalid-response');
        const filePath = path.join(rootDirectory, 'public', route.baseUrl);
        mkdirSync(path.dirname(filePath), { recursive: true });
        writeFileSync(filePath, 'x');
        expect((await probeUpstreamRoute(rootDirectory, 'aladinScript', route)).status).toBe('ok');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('distingue erreur HTTP, expiration et panne réseau', async () => {
        const route = routeOf('simbad', 'cds');
        fetchMock.mockResolvedValueOnce(new Response('', { status: 503 }));
        expect(await probeUpstreamRoute(rootDirectory, 'simbad', route)).toMatchObject({
            status: 'http-error',
            httpStatus: 503,
        });
        fetchMock.mockRejectedValueOnce(Object.assign(new Error('délai'), { name: 'TimeoutError' }));
        expect((await probeUpstreamRoute(rootDirectory, 'simbad', route)).status).toBe('timeout');
        fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
        expect((await probeUpstreamRoute(rootDirectory, 'simbad', route)).status).toBe('network-error');
    });
});
