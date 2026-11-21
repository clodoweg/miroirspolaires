// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';

const r2 = vi.hoisted(() => ({ syncDirToR2: vi.fn() }));
vi.mock('@/lib/admin/r2-sync', () => r2);

import { POST } from './sync';

function sync(year: string, slug: string) {
    return POST({ params: { year, slug } } as unknown as Parameters<typeof POST>[0]);
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('DEV', true);
});

afterEach(() => vi.unstubAllEnvs());

describe('POST /api/admin/images/[year]/[slug]/sync', () => {
    it('synchronise le dossier de l’article vers son préfixe R2', async () => {
        r2.syncDirToR2.mockResolvedValue({ uploaded: ['a.jpg'] });
        const response = await sync('2026', 'tromso');
        expect(await response.json()).toEqual({ uploaded: ['a.jpg'] });
        expect(r2.syncDirToR2).toHaveBeenCalledWith(
            path.join(process.cwd(), 'src/assets/blog', '2026', 'tromso'),
            'blog/2026/tromso/',
        );
    });

    it('renvoie 500 avec le message en cas d’erreur', async () => {
        r2.syncDirToR2.mockRejectedValue(new Error('R2 indisponible'));
        const response = await sync('2026', 'tromso');
        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: 'R2 indisponible' });
    });

    it('renvoie 400 pour des paramètres invalides et 404 hors dev', async () => {
        expect((await sync('2026', '../..')).status).toBe(400);
        vi.stubEnv('DEV', false);
        expect((await sync('2026', 'tromso')).status).toBe(404);
        expect(r2.syncDirToR2).not.toHaveBeenCalled();
    });
});
