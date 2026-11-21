// @vitest-environment node
/**
 * Tests de la route `/api/admin/upstream` : garde de dev, lecture, validation et écriture.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { readPriorityFile, writePriorityFile } = vi.hoisted(() => ({
    readPriorityFile: vi.fn(),
    writePriorityFile: vi.fn(),
}));

vi.mock('@/lib/admin/upstream-routes', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/admin/upstream-routes')>()),
    readPriorityFile,
    writePriorityFile,
}));

import { GET, PUT } from './index';

const callGet = () => GET({} as Parameters<typeof GET>[0]);
const callPut = (body: unknown) =>
    PUT({
        request: new Request('http://localhost/api/admin/upstream', { method: 'PUT', body: JSON.stringify(body) }),
    } as Parameters<typeof PUT>[0]);

describe('/api/admin/upstream', () => {
    beforeEach(() => {
        vi.stubEnv('DEV', true);
        readPriorityFile.mockResolvedValue({ updatedAt: null, services: {} });
        writePriorityFile.mockImplementation(async (_root, services) => ({ updatedAt: '2026-11-05', services }));
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.clearAllMocks();
    });

    it('répond 404 hors du mode dev, sans rien écrire', async () => {
        vi.stubEnv('DEV', false);
        expect((await callGet()).status).toBe(404);
        expect((await callPut({ services: {} })).status).toBe(404);
        expect(writePriorityFile).not.toHaveBeenCalled();
    });

    it('GET : renvoie les services avec leurs routes', async () => {
        const body = await (await callGet()).json();
        expect(body.services[0].id).toBe('simbad');
        expect(body.services[0].routes[0].id).toBe('cds');
    });

    it('PUT : enregistre un choix valide et renvoie le nouvel état', async () => {
        const response = await callPut({ services: { simbad: { order: ['idia', 'harvard', 'cds'], disabled: [] } } });
        expect(response.status).toBe(200);
        expect((await response.json()).services[0].routes[0].id).toBe('idia');
        expect(writePriorityFile).toHaveBeenCalledOnce();
    });

    it.each([[{}], [{ services: { simbad: { order: ['evil'], disabled: [] } } }], [{ services: { x: {} } }]])(
        'PUT : refuse %j',
        async (body) => {
            expect((await callPut(body)).status).toBe(400);
            expect(writePriorityFile).not.toHaveBeenCalled();
        },
    );
});
