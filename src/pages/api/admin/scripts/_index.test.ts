import { describe, it, expect, vi, afterEach } from 'vitest';
import { GET } from './index';
import { SCRIPTS } from '@/lib/admin/scripts';

function callGet() {
    return GET({} as unknown as Parameters<typeof GET>[0]);
}

describe('GET /api/admin/scripts', () => {
    afterEach(() => vi.unstubAllEnvs());

    it('renvoie 404 hors du mode développement', async () => {
        vi.stubEnv('DEV', false);
        expect((await callGet()).status).toBe(404);
    });

    it('expose chaque script avec un aperçu de commande, sans command ni args', async () => {
        vi.stubEnv('DEV', true);
        const response = await callGet();
        const body: Record<string, unknown>[] = await response.json();
        expect(response.status).toBe(200);
        expect(body).toHaveLength(SCRIPTS.length);
        const syncR2 = body.find((script) => script.id === 'sync-r2');
        expect(syncR2).toMatchObject({ commandPreview: 'node scripts/r2/upload_local_to_r2.js', writes: true });
        for (const script of body) {
            expect(script).not.toHaveProperty('command');
            expect(script).not.toHaveProperty('args');
        }
    });
});
