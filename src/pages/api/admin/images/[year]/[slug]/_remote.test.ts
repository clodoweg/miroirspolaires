// @vitest-environment node
/**
 * Routes d'images du blog et des voyages sur l'admin distant : elles passent par remote-images.ts (R2).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const images = vi.hoisted(() => ({
    listRemoteImages: vi.fn(),
    setRemoteCover: vi.fn(),
    deleteRemoteImage: vi.fn(),
}));
const voyages = vi.hoisted(() => ({ readVoyage: vi.fn(), writeVoyage: vi.fn() }));

vi.mock('@/lib/admin/remote-images', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/admin/remote-images')>()),
    ...images,
}));
vi.mock('@/lib/admin/voyages-files', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/admin/voyages-files')>()),
    ...voyages,
}));

import { R2NotConfiguredError } from '@/lib/admin/remote-images';
import { ContentConflictError } from '@/lib/admin/stores/content-writer';
import { GET as blogList } from './index';
import { PUT as blogCover, DELETE as blogDelete } from './[filename]';
import { GET as voyageList } from '../../../voyages-images/[year]/[slug]/index';
import { PUT as voyageCover, DELETE as voyageDelete } from '../../../voyages-images/[year]/[slug]/[filename]';

type Context = Parameters<typeof blogList>[0];

const REMOTE = { adminAccess: { mode: 'remote' as const, session: { userId: 1, login: 'a', expiresAt: 0 } } };

function context(params: Record<string, string>) {
    return { params, locals: REMOTE, request: new Request('http://localhost/x') } as unknown as Context;
}

const ENTRY = { name: 'a.jpg', size: 3, mtimeMs: 0, capturedAt: '', dayKey: '', timeStr: '', is360: false };

beforeEach(() => vi.clearAllMocks());

describe('admin distant : images du blog', () => {
    it('liste depuis R2 avec le chemin public', async () => {
        images.listRemoteImages.mockResolvedValue([ENTRY]);
        const response = await blogList(context({ year: '2026', slug: 'aurores' }));
        expect(await response.json()).toEqual([{ ...ENTRY, path: '/assets/blog/2026/aurores/a.jpg' }]);
        expect(images.listRemoteImages).toHaveBeenCalledWith('blog', '2026', 'aurores');
    });

    it('répond 503 si R2 manque', async () => {
        images.listRemoteImages.mockRejectedValue(new R2NotConfiguredError());
        expect((await blogList(context({ year: '2026', slug: 'aurores' }))).status).toBe(503);
    });

    it('définit la couverture et supprime sur R2', async () => {
        images.setRemoteCover.mockResolvedValue({ cover: 'a.jpg', thumb: 'a-thumb.jpg' });
        const params = { year: '2026', slug: 'aurores', filename: 'a.jpg' };
        expect(await (await blogCover(context(params))).json()).toEqual({
            ok: true,
            cover: '/assets/blog/2026/aurores/a.jpg',
            thumb: '/assets/blog/2026/aurores/a-thumb.jpg',
        });
        expect(await (await blogDelete(context(params))).json()).toEqual({ ok: true });
        expect(images.deleteRemoteImage).toHaveBeenCalledWith('blog', '2026', 'aurores', 'a.jpg');
        images.setRemoteCover.mockRejectedValueOnce(new R2NotConfiguredError());
        expect((await blogCover(context(params))).status).toBe(503);
        images.deleteRemoteImage.mockRejectedValueOnce(new R2NotConfiguredError());
        expect((await blogDelete(context(params))).status).toBe(503);
    });
});

describe('admin distant : images des voyages', () => {
    const params = { year: '2025', slug: 'troms', filename: 'a.jpg' };
    const rel = '../../../assets/voyages/2025/troms/a.jpg';

    it('liste depuis R2 avec le chemin relatif', async () => {
        images.listRemoteImages.mockResolvedValue([ENTRY]);
        expect(await (await voyageList(context({ year: '2025', slug: 'troms' }))).json()).toEqual([
            { name: 'a.jpg', size: 3, rel },
        ]);
        images.listRemoteImages.mockRejectedValue(new R2NotConfiguredError());
        expect((await voyageList(context({ year: '2025', slug: 'troms' }))).status).toBe(503);
    });

    it('définit la couverture', async () => {
        images.setRemoteCover.mockResolvedValue({ cover: 'cover.jpg', thumb: 'cover-thumb.jpg' });
        expect(await (await voyageCover(context(params))).json()).toEqual({ ok: true });
        expect(images.setRemoteCover).toHaveBeenCalledWith('voyages', '2025', 'troms', 'a.jpg');
        images.setRemoteCover.mockRejectedValueOnce(new R2NotConfiguredError());
        expect((await voyageCover(context(params))).status).toBe(503);
    });

    it('supprime sur R2 puis retire l’image du markdown par commit', async () => {
        voyages.readVoyage.mockResolvedValue({
            dirYear: '2025',
            slug: 'troms',
            revision: 'r',
            title: 'Troms',
            description: '',
            image: rel,
            gallery: [rel, 'autre.jpg'],
            draft: true,
            body: 'Récit',
        });
        expect((await voyageDelete(context(params))).status).toBe(200);
        expect(images.deleteRemoteImage).toHaveBeenCalledWith('voyages', '2025', 'troms', 'a.jpg');
        expect(voyages.writeVoyage).toHaveBeenCalledWith(
            '2025',
            'troms',
            { title: 'Troms', description: '', image: '', gallery: ['autre.jpg'], draft: true },
            'Récit',
        );
        expect(images.deleteRemoteImage.mock.invocationCallOrder[0]).toBeLessThan(
            voyages.writeVoyage.mock.invocationCallOrder[0],
        );
    });

    it('supprime sans commit si le voyage n’existe pas et traduit les erreurs', async () => {
        voyages.readVoyage.mockResolvedValue(null);
        expect((await voyageDelete(context(params))).status).toBe(200);
        expect(voyages.writeVoyage).not.toHaveBeenCalled();
        voyages.readVoyage.mockRejectedValueOnce(new ContentConflictError('x'));
        expect((await voyageDelete(context(params))).status).toBe(409);
        images.deleteRemoteImage.mockRejectedValueOnce(new R2NotConfiguredError());
        expect((await voyageDelete(context(params))).status).toBe(503);
    });
});
