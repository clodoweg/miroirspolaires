// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const files = vi.hoisted(() => ({
    readVoyage: vi.fn(),
    writeVoyage: vi.fn(),
    deleteImage: vi.fn(),
    assetFilePath: vi.fn((year: string, slug: string, name: string) => `/assets/voyages/${year}/${slug}/${name}`),
    relImagePath: vi.fn((year: string, slug: string, name: string) => `/assets/voyages/${year}/${slug}/${name}`),
}));
const shared = vi.hoisted(() => ({ fileExists: vi.fn() }));

vi.mock('@/lib/admin/voyages-files', () => files);
vi.mock('@/lib/admin/shared', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/admin/shared')>()),
    requireAdmin: () => null,
    fileExists: shared.fileExists,
}));
vi.mock('node:fs', () => ({ promises: { utimes: vi.fn() } }));

import { DELETE } from './[filename]';

function callDelete(filename: string) {
    const params = { year: '2025', slug: 'troms', filename };
    return DELETE({ params } as unknown as Parameters<typeof DELETE>[0]);
}

describe('DELETE /api/admin/voyages-images/[year]/[slug]/[filename]', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        shared.fileExists.mockResolvedValue(true);
        files.readVoyage.mockResolvedValue({
            title: 'Troms',
            date: '2025-02-01',
            description: 'd',
            image: '/assets/voyages/2025/troms/img-1.jpg',
            gallery: ['/assets/voyages/2025/troms/img-1.jpg', '/assets/voyages/2025/troms/img-2.png'],
            draft: true,
            body: 'Corps',
        });
    });

    it('garde le statut brouillon en réécrivant le voyage', async () => {
        const response = await callDelete('img-2.png');
        expect(response.status).toBe(200);
        const [, , frontmatter] = files.writeVoyage.mock.calls[0];
        expect(frontmatter.draft).toBe(true);
        expect(frontmatter.gallery).toEqual(['/assets/voyages/2025/troms/img-1.jpg']);
    });

    it('supprime la miniature en -thumb.jpg, même pour une source PNG', async () => {
        await callDelete('img-2.png');
        const deleted = files.deleteImage.mock.calls.map(([, , name]) => name);
        expect(deleted).toEqual(['img-2.png', 'img-2-thumb.jpg']);
    });

    it('refuse un nom de fichier invalide', async () => {
        const response = await callDelete('../.env');
        expect(response.status).toBe(400);
        expect(files.deleteImage).not.toHaveBeenCalled();
    });
});
