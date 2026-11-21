import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { photos } from '@/lib/photos';
import { getHomepageData } from './homepage';
import { getCollection } from 'astro:content';

describe('Homepage Data Processing', () => {
    beforeEach(() => {
        vi.mocked(getCollection).mockImplementation(async (collection: string) => {
            if (collection === 'voyages') {
                return [
                    { id: 'voyage-1', data: { title: 'Voyage 1', year: 2023, country: 'France', image: '/v1.jpg' } },
                ] as any;
            }
            if (collection === 'blog') {
                return [
                    {
                        id: 'post-1',
                        data: {
                            title: 'Post 1',
                            date: '01/01/2023',
                            categories: ['Astro'],
                            image: '/p1.jpg',
                            description: 'desc',
                        },
                    },
                ] as any;
            }
            if (collection === 'videos') {
                return [{ id: 'video-1', data: { title: 'Video 1', duration: '10:00', image: '/v1.jpg' } }] as any;
            }
            return [];
        });
    });
    it('aggregates data correctly from collections', async () => {
        const data = await getHomepageData({});

        expect(data.astroHeaderStats).toBeDefined();
        expect(data.voyageData).toHaveLength(1);
        expect(data.blogData).toHaveLength(1);
        expect(data.videoData).toHaveLength(1);

        // Check video duration aggregation (10:00 = 0h10)
        const videoDurationStat = data.videoHeaderStats.find((s) => s.icon === 'clock');
        expect(videoDurationStat?.value).toBe('0h10');
    });

    it('filters featured items by slug', async () => {
        const data = await getHomepageData({
            featuredPhotoSlugs: ['non-existent'],
        });
        // If not found, it should fallback to default (latest) or empty if filtered
        // Based on implementation: if not found, it's filtered out of the explicit list
        expect(data.astroData).toHaveLength(0);
    });
});

type CollectionName = 'voyages' | 'blog' | 'videos';

function stubCollections(collections: Record<CollectionName, unknown[]>) {
    vi.mocked(getCollection).mockImplementation(
        (async (collection: CollectionName) => collections[collection] ?? []) as unknown as typeof getCollection,
    );
}

describe('getHomepageData (statistiques et sélections)', () => {
    beforeEach(() => {
        vi.stubEnv('FORCE_LOCAL_IMAGES', 'false');
        vi.stubEnv('PUBLIC_FORCE_LOCAL_IMAGES', 'false');
        vi.stubEnv('PUBLIC_R2_URL', 'https://r2.example.com');
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        stubCollections({
            voyages: [
                {
                    id: '2019/islande',
                    data: {
                        title: 'Islande',
                        year: 2019,
                        country: ['Islande'],
                        image: 'voyages/2019/i.jpg',
                        gallery: [1, 2],
                    },
                },
                {
                    id: '2024/nepal',
                    data: {
                        title: 'Népal',
                        year: 2024,
                        country: 'Népal',
                        image: 'voyages/2024/n.jpg',
                        season: 'Hiver',
                    },
                },
                { id: '2020/sans-pays', data: { title: 'Sans pays', image: 'voyages/2020/s.jpg', gallery: [1] } },
                { id: '2025/brouillon', data: { title: 'Brouillon', year: 2025, country: 'Chili', draft: true } },
            ],
            blog: [
                {
                    id: '2023/ancien',
                    data: {
                        title: 'Ancien',
                        date: '2023-01-01',
                        categories: ['Récits de voyage polaires', "Publications d'astronomie"],
                        image: 'blog/2023/a.jpg',
                        description: 'a',
                    },
                },
                {
                    id: '2025/recent',
                    data: {
                        title: 'Récent',
                        date: '2025-06-01',
                        categories: ["Publications d'astronomie", 'Divers'],
                        image: 'blog/2025/r.jpg',
                        description: 'r',
                    },
                },
                {
                    id: '2025/brouillon',
                    data: { title: 'Brouillon', date: '2025-07-01', categories: ['Divers'], draft: true },
                },
            ],
            videos: [
                { id: 'v1', data: { title: 'V1', duration: '1:30:00', image: 'videos/v1.jpg' } },
                { id: 'v2', data: { title: 'V2', duration: '45:00', image: 'videos/v2.jpg' } },
                { id: 'v3', data: { title: 'V3', duration: '1:2:3:4', image: 'videos/v3.jpg' } },
                { id: 'v4', data: { title: 'V4', image: 'videos/v4.jpg' } },
                { id: 'v5', data: { title: 'V5', duration: '10:00', image: 'videos/v5.jpg' } },
            ],
        });
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it('ne réordonne pas le tableau partagé des photos', async () => {
        // POURQUOI : le CSV est déjà trié par année ; on l'inverse pour qu'un tri en place se voie.
        photos.reverse();
        try {
            const orderBefore = photos.map((photo) => photo.id);
            await getHomepageData({});
            expect(photos.map((photo) => photo.id)).toEqual(orderBefore);
        } finally {
            photos.reverse();
        }
    });

    it('exclut les brouillons et compte pays, photos et années de voyage', async () => {
        const data = await getHomepageData({});
        const stat = (icon: string) => data.voyageHeaderStats.find((s) => s.icon === icon)?.value;
        expect(stat('globe')).toBe(2);
        expect(stat('camera')).toBe(3);
        expect(stat('calendar')).toBe(2024 - 2019 + 1);
        expect(data.voyageData.map((v) => v.href)).toEqual([
            '/voyages/2024/nepal',
            '/voyages/2019/islande',
            '/voyages/2020/sans-pays',
        ]);
        expect(data.voyageData[0]).toMatchObject({ countries: ['Népal'], season: 'Hiver' });
        expect(data.voyageData[2].countries).toEqual([]);
        expect(data.voyageData[0].img).toBe('https://r2.example.com/voyages/2024/n.jpg');
    });

    it('trie les catégories du blog par fréquence et raccourcit les libellés connus', async () => {
        const data = await getHomepageData({});
        expect(data.blogHeaderStats[0]).toMatchObject({
            key: "Publications d'astronomie",
            value: 2,
            suffix: 'Publications',
            label: "d'astronomie",
        });
        const recit = data.blogHeaderStats.find((s) => s.key === 'Récits de voyage polaires');
        expect(recit).toMatchObject({ suffix: 'Récits', label: 'de voyage polaires', value: 1 });
        const divers = data.blogHeaderStats.find((s) => s.key === 'Divers');
        expect(divers).toMatchObject({ suffix: 'Divers', label: '', icon: 'tag' });
    });

    it('présente les articles du plus récent au plus ancien avec leur miniature', async () => {
        const data = await getHomepageData({});
        expect(data.blogData.map((b) => b.href)).toEqual(['/blog/2025/recent', '/blog/2023/ancien']);
        expect(data.blogData[0].img).toBe('https://r2.example.com/blog/2025/r-thumb.jpg');
    });

    it('additionne les durées hh:mm:ss et mm:ss en ignorant les formats invalides', async () => {
        const data = await getHomepageData({});
        expect(data.videoHeaderStats).toEqual([
            { icon: 'film', value: 5, suffix: 'Episodes', label: 'YouTube' },
            { icon: 'clock', value: '2h25', label: 'de vidéo' },
        ]);
        expect(data.videoData).toHaveLength(4);
        expect(data.videoData[0]).toMatchObject({ href: '/videos/v1', title: 'V1' });
    });

    it('respecte les sélections explicites de voyages, d’articles et de photos', async () => {
        const firstPhoto = photos[0];
        const data = await getHomepageData({
            featuredVoyageSlugs: ['2019/islande', 'absent'],
            featuredBlogSlugs: ['2023/ancien'],
            featuredPhotoSlugs: [firstPhoto.slug],
        });
        expect(data.voyageData.map((v) => v.title)).toEqual(['Islande']);
        expect(data.blogData.map((b) => b.title)).toEqual(['Ancien']);
        expect(data.astroData).toEqual([
            expect.objectContaining({
                href: `/astrophotographies/${firstPhoto.slug}`,
                title: firstPhoto.title,
                img: expect.stringContaining('/astrophotographies/mini/'),
            }),
        ]);
    });

    it('limite la mosaïque à 48 URL et résout les images de l’accueil', async () => {
        const data = await getHomepageData({});
        expect(data.mosaicImages.length).toBe(Math.min(48, photos.length + 3));
        expect(data.mosaicImages.every((src) => typeof src === 'string' && src.length > 0)).toBe(true);
        expect(data.heroImage).toBe('/src/assets/index/mini/hero.jpg');
        expect(data.obsAtriaImage).toBe('/src/assets/index/obs-atria.jpg');
        expect(data.obsV2Image).toBe('/src/assets/index/obs-v2.jpg');
    });

    it('calcule les statistiques d’astrophotographie à partir du catalogue', async () => {
        const data = await getHomepageData({});
        expect(data.astroHeaderStats[0]).toEqual({ icon: 'camera', value: photos.length, label: 'photos' });
        expect(data.astroData.length).toBe(Math.min(5, photos.length));
        expect(data.observatoryHeaderStats.map((s) => s.label)).toEqual(['télescopes', 'caméras', 'montures']);
    });
});
