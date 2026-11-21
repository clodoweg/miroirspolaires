/**
 * Homepage Data Processing Utilities
 * Extracts all data fetching and processing logic from index.astro
 */

import { getCollection } from 'astro:content';
import {
    photos,
    getUniqueConstellations,
    getUniqueYears,
    getUniqueObservatories,
    getUniqueTelescopes,
    getUniqueCameras,
    getUniqueMounts,
} from '@/lib/photos';
import { getCategoryIcon } from '@/utils/constants';
import { normalizeCountries } from '@/utils/data';
import { resolveImage, toThumbUrl } from '@/utils/imageService';

// ============================================================================
// TYPES
// ============================================================================

export interface Stat {
    icon: string;
    value: string | number;
    label: string;
    suffix?: string;
    key?: string;
}

export interface AstroItem {
    img: ReturnType<typeof resolveImage>;
    href: string;
    title: string;
    constellation: string;
    year: number;
}

export interface VoyageItem {
    img: ReturnType<typeof resolveImage>;
    href: string;
    title: string;
    year: number | undefined;
    countries: string[];
    season: string | undefined;
}

export interface BlogItem {
    img: ReturnType<typeof resolveImage>;
    href: string;
    title: string;
    description: string;
    date: string;
    categories: string[];
}

export interface VideoItem {
    img: ReturnType<typeof resolveImage>;
    href: string;
    title: string;
}

export interface HomepageData {
    // Stats arrays for StatsMetadata
    astroHeaderStats: Stat[];
    voyageHeaderStats: Stat[];
    observatoryHeaderStats: Stat[];
    videoHeaderStats: Stat[];
    blogHeaderStats: Stat[];

    // Featured items data
    astroData: AstroItem[];
    voyageData: VoyageItem[];
    blogData: BlogItem[];
    videoData: VideoItem[];

    // Images
    heroImage: ReturnType<typeof resolveImage>;
    obsAtriaImage: ReturnType<typeof resolveImage>;
    obsV2Image: ReturnType<typeof resolveImage>;
    mosaicImages: string[];
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Parses a duration string ("mm:ss" or "hh:mm:ss") into total seconds.
 * @param duration - Duration string
 * @returns Total seconds
 */
function parseDuration(duration: string | undefined): number {
    if (!duration) return 0;
    const parts = duration.split(':').map(Number);
    if (parts.length === 2) {
        return parts[0] * 60 + parts[1]; // mm:ss
    } else if (parts.length === 3) {
        return parts[0] * 3600 + parts[1] * 60 + parts[2]; // hh:mm:ss
    }
    return 0;
}

// ============================================================================
// MAIN DATA FETCHING FUNCTION
// ============================================================================

/**
 * Fetches and aggregates all homepage data: stats, featured items, and images.
 * Extracts all data processing from index.astro for cleaner separation.
 * @param config - Configuration with optional featured slugs for each section
 * @returns Fully resolved homepage data ready for template consumption
 */
export async function getHomepageData(config: {
    featuredPhotoSlugs?: string[];
    featuredVoyageSlugs?: string[];
    featuredBlogSlugs?: string[];
}): Promise<HomepageData> {
    const { featuredPhotoSlugs = [], featuredVoyageSlugs = [], featuredBlogSlugs = [] } = config;

    // === OBSERVATORY STATS ===
    const obsObservatories = getUniqueObservatories();
    const obsTelescopes = getUniqueTelescopes();
    const obsCameras = getUniqueCameras();
    const obsMounts = getUniqueMounts();

    const observatoryStats = {
        observatories: obsObservatories.length,
        telescopes: obsTelescopes.length,
        cameras: obsCameras.length,
        mounts: obsMounts.length,
    };

    // === ASTROPHOTOGRAPHY STATS ===
    const astroConstellations = getUniqueConstellations();
    const astroYears = getUniqueYears();
    const astroStats = {
        photos: photos.length,
        constellations: astroConstellations.length,
        years: astroYears.length > 0 ? Math.max(...astroYears) - Math.min(...astroYears) + 1 : 0,
    };

    // Featured astrophotographies
    const featuredAstro =
        featuredPhotoSlugs.length > 0
            ? featuredPhotoSlugs.map((slug) => photos.find((p) => p.slug === slug)).filter(Boolean)
            : // POURQUOI : copie avant tri, `photos` est partagé par toutes les pages rendues ensuite.
              [...photos].sort((a, b) => b.year - a.year).slice(0, 5);

    // === VOYAGE STATS ===
    const allVoyages = (await getCollection('voyages')).filter((v) => !v.data.draft);

    const voyageCountries = [...new Set(allVoyages.flatMap((v) => normalizeCountries(v.data.country)))].filter(
        (c) => c !== 'Inconnu',
    );

    const voyageYears = [...new Set(allVoyages.map((v) => v.data.year).filter((y): y is number => !!y))];
    const voyageYearsSpan = voyageYears.length > 0 ? Math.max(...voyageYears) - Math.min(...voyageYears) + 1 : 0;

    const totalVoyagePhotos = allVoyages.reduce((acc, v) => acc + (v.data.gallery?.length || 0), 0);

    const voyageStats = {
        countries: voyageCountries.length,
        years: voyageYearsSpan,
    };

    // Featured voyages
    const featuredVoyages =
        featuredVoyageSlugs.length > 0
            ? featuredVoyageSlugs
                  .map((slug) => allVoyages.find((v) => v.id === slug))
                  .filter((v): v is NonNullable<typeof v> => Boolean(v))
            : allVoyages
                  .sort((a, b) => {
                      const yearA = a.data.year || 0;
                      const yearB = b.data.year || 0;
                      return yearB - yearA;
                  })
                  .slice(0, 5);

    // === BLOG STATS ===
    const allPosts = (await getCollection('blog')).filter((p) => !p.data.draft);

    const categoryCounts = allPosts.reduce(
        (acc, post) => {
            post.data.categories.forEach((category) => {
                acc[category] = (acc[category] || 0) + 1;
            });
            return acc;
        },
        {} as Record<string, number>,
    );

    const blogCategoryStats = Object.entries(categoryCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([category, count]) => {
            let suffix = category;
            let label = '';

            if (category.startsWith('Récits de voyage')) {
                suffix = 'Récits';
                label = category.replace('Récits ', '');
            } else if (category === "Publications d'astronomie") {
                suffix = 'Publications';
                label = "d'astronomie";
            }

            return {
                icon: getCategoryIcon(category),
                value: count,
                label,
                suffix,
                key: category,
            };
        });

    // Featured blog posts
    const sortedPosts = [...allPosts].sort((a, b) => new Date(b.data.date).getTime() - new Date(a.data.date).getTime());
    const featuredBlogPosts =
        featuredBlogSlugs.length > 0
            ? featuredBlogSlugs.map((slug) => allPosts.find((p) => p.id === slug)).filter(Boolean)
            : sortedPosts.slice(0, 3);

    // === VIDEO STATS ===
    const allVideos = await getCollection('videos');

    const totalSeconds = allVideos.reduce((acc, v) => acc + parseDuration(v.data.duration), 0);
    const totalHours = Math.floor(totalSeconds / 3600);
    const totalMinutes = Math.floor((totalSeconds % 3600) / 60);

    const videoStats = {
        count: allVideos.length,
        duration: `${totalHours}h${totalMinutes.toString().padStart(2, '0')}`,
    };

    const featuredVideos = allVideos.slice(0, 4);

    // === STATS ARRAYS FOR STATSMETADATA ===
    const astroHeaderStats: Stat[] = [
        { icon: 'camera', value: astroStats.photos, label: 'photos' },
        { icon: 'star', value: astroStats.constellations, label: 'constellations' },
        { icon: 'hourglass', value: astroStats.years, suffix: 'ans', label: "d'observation" },
    ];

    const voyageHeaderStats: Stat[] = [
        { icon: 'globe', value: voyageStats.countries, label: 'pays' },
        { icon: 'camera', value: totalVoyagePhotos, label: 'photos' },
        { icon: 'calendar', value: voyageStats.years, suffix: 'ans', label: 'de voyages' },
    ];

    const observatoryHeaderStats: Stat[] = [
        { icon: 'dish', value: observatoryStats.telescopes, label: 'télescopes' },
        { icon: 'camera', value: observatoryStats.cameras, label: 'caméras' },
        { icon: 'cog', value: observatoryStats.mounts, label: 'montures' },
    ];

    const videoHeaderStats: Stat[] = [
        { icon: 'film', value: videoStats.count, suffix: 'Episodes', label: 'YouTube' },
        { icon: 'clock', value: videoStats.duration, label: 'de vidéo' },
    ];

    const blogHeaderStats = blogCategoryStats;

    // === COMBINED DATA FOR TEMPLATE ===
    const astroData: AstroItem[] = featuredAstro.map((photo) => ({
        img: resolveImage(`assets/astrophotographies/${photo!.imagePath}`, true, photo!.version),
        href: `/astrophotographies/${photo!.slug}`,
        title: photo!.title,
        constellation: photo!.constellation,
        year: photo!.year,
    }));

    const voyageData: VoyageItem[] = featuredVoyages.map((voyage) => {
        const countries = normalizeCountries(voyage.data.country).filter((c) => c !== 'Inconnu');
        return {
            img: resolveImage(voyage.data.image),
            href: `/voyages/${voyage.id}`,
            title: voyage.data.title,
            year: voyage.data.year,
            countries,
            season: voyage.data.season,
        };
    });

    const videoData: VideoItem[] = featuredVideos.map((video) => ({
        img: resolveImage(video.data.image),
        href: `/videos/${video.id}`,
        title: video.data.title,
    }));

    const blogData: BlogItem[] = featuredBlogPosts.map((post) => ({
        img: toThumbUrl(resolveImage(post!.data.image)),
        href: `/blog/${post!.id}`,
        title: post!.data.title,
        description: post!.data.description,
        date: post!.data.date,
        categories: post!.data.categories,
    }));

    // === MOSAIC IMAGES ===
    // 1. Get all voyage covers
    const voyageImages = allVoyages.map((v) => v.data.image).filter(Boolean);

    // 2. Get all astro images (use full size or a medium version if available,
    // but the component will handle resizing via worker anyway, so path is enough)
    // We construct the path as it's done in the mapping: assets/astrophotographies/...
    const astroImages = photos.map((p) => `assets/astrophotographies/${p.imagePath}`);

    // 3. Combine and Shuffle
    const allImages = [...voyageImages, ...astroImages];

    // DEBUG: Log examples

    // Fisher-Yates Shuffle
    for (let i = allImages.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allImages[i], allImages[j]] = [allImages[j], allImages[i]];
    }

    // 4. Select a subset (e.g., 32 images for 8x4 grid)
    // We resolve them here to get the proper URL/ImageMetadata
    // We use mini=true for potentially faster valid path resolution for astro/index

    const mosaicImages = allImages
        .slice(0, 48) // Grab a bit more just in case
        .map((path) => {
            // Find corresponding photo for versioning if it's an astro image
            let version: string | undefined = undefined;
            if (path.includes('astrophotographies/')) {
                const photo = photos.find((p) => path.endsWith(p.imagePath));
                if (photo) version = photo.version;
            }
            const resolved = resolveImage(path, true, version);
            // Debug failure cases

            return typeof resolved === 'string' ? resolved : resolved.src;
        });

    // === IMAGES ===
    const heroImage = resolveImage('assets/index/hero.jpg', true);
    const obsAtriaImage = resolveImage('assets/index/obs-atria.jpg');
    const obsV2Image = resolveImage('assets/index/obs-v2.jpg');

    return {
        astroHeaderStats,
        voyageHeaderStats,
        observatoryHeaderStats,
        videoHeaderStats,
        blogHeaderStats,
        astroData,
        voyageData,
        blogData,
        videoData,
        heroImage,
        obsAtriaImage,
        obsV2Image,
        mosaicImages,
    };
}
