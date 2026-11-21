import type { Photo } from '@/lib/photos';
import type { CollectionEntry } from 'astro:content';

const SITE_URL = 'https://www.miroirspolaires.fr';

/**
 * Helper to ensure URLs are absolute
 */
function toAbsoluteUrl(path: string | undefined): string | undefined {
    if (!path) return undefined;
    if (path.startsWith('http')) return path;
    return `${SITE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
}

/**
 * Sérialise un objet JSON-LD pour un `<script type="application/ld+json" set:html>`.
 *
 * WARNING: `set:html` n'échappe rien ; un `</script>` dans un titre ou une description
 * (CSV, front-matter) fermerait la balise et permettrait d'injecter du HTML. On échappe
 * donc `<`, `>`, `&` et les séparateurs de ligne Unicode, ce qui reste du JSON valide.
 *
 * @param value - Données structurées.
 * @returns La chaîne JSON sûre à insérer dans la page.
 */
export function toJsonLd(value: unknown): string {
    return JSON.stringify(value)
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/&/g, '\\u0026')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
}

/**
 * Generates the JSON-LD schema for a specific photo.
 */
export function generatePhotoSchema(photo: Photo, mainImageUrl?: string): string {
    if (!mainImageUrl) return '';

    const imageUrl = toAbsoluteUrl(mainImageUrl);

    return toJsonLd({
        '@context': 'https://schema.org/',
        '@type': 'ImageObject',
        contentUrl: imageUrl,
        url: imageUrl,
        name: photo.title,
        description: photo.description,
        author: {
            '@type': 'Person',
            name: 'Miroirs Polaires (Julien Bourdette)',
            url: SITE_URL,
        },
        creator: {
            '@type': 'Person',
            name: 'Miroirs Polaires (Julien Bourdette)',
        },
        creditText: 'Miroirs Polaires',
        copyrightNotice: `© ${photo.year || new Date().getFullYear()} Miroirs Polaires`,
        datePublished: photo.year ? `${photo.year}-01-01` : undefined,
        license: `${SITE_URL}/mentions-legales`,
        acquireLicensePage: `${SITE_URL}/a-propos#contact`,
        encodingFormat: 'image/jpeg',
        exifData: [
            photo.telescope ? { '@type': 'PropertyValue', name: 'Telescope', value: photo.telescope } : null,
            photo.camera ? { '@type': 'PropertyValue', name: 'Camera', value: photo.camera } : null,
            photo.mount ? { '@type': 'PropertyValue', name: 'Mount', value: photo.mount } : null,
        ].filter(Boolean),
    });
}

/**
 * Generates the JSON-LD schema for a blog post.
 */
export function generateBlogSchema(entry: CollectionEntry<'blog'>, imageUrl?: string): string {
    const permalink = `${SITE_URL}/blog/${entry.id}`;
    const imageAbsoluteUrl = toAbsoluteUrl(imageUrl);

    const schema = {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: entry.data.title,
        description: entry.data.description,
        image: imageAbsoluteUrl ? [imageAbsoluteUrl] : [],
        datePublished: new Date(entry.data.date.split('/').reverse().join('-')).toISOString(),
        dateModified: new Date(entry.data.date.split('/').reverse().join('-')).toISOString(), // Default to published date if no modified date
        author: [
            {
                '@type': 'Person',
                name: 'Julien Bourdette',
                url: `${SITE_URL}/a-propos`,
            },
        ],
        publisher: {
            '@type': 'Organization',
            name: 'Miroirs Polaires',
            logo: {
                '@type': 'ImageObject',
                url: `${SITE_URL}/images/logo-mp.png`,
            },
        },
        mainEntityOfPage: {
            '@type': 'WebPage',
            '@id': permalink,
        },
    };

    return toJsonLd(schema);
}

/**
 * JSON-LD describing the website + its author. Emitted on the homepage so
 * Google can build the brand knowledge panel + sitelinks search box.
 */
export function generateSiteSchema(): string {
    const person = {
        '@type': 'Person',
        '@id': `${SITE_URL}/#julien-bourdette`,
        name: 'Julien Bourdette',
        alternateName: 'Clodoweg',
        url: `${SITE_URL}/a-propos`,
        jobTitle: 'Astrophotographe et photographe de voyage',
        description:
            "Astronome amateur, photographe et baroudeur. Auteur d'astrophotographies du ciel profond et de récits d'expéditions polaires.",
        image: `${SITE_URL}/_astro/julien-telescope.jpg`,
        sameAs: [
            'https://www.instagram.com/julien.bourdette/',
            'https://www.youtube.com/@clodoweg',
            'https://www.astrobin.com/users/Clodoweg/',
        ],
    };

    const website = {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        url: SITE_URL,
        name: 'Miroirs Polaires',
        alternateName: 'Miroirs Polaires - Julien Bourdette',
        description:
            "Astrophotographies du ciel profond, récits de voyages polaires et himalayens, vidéos d'astronomie et d'histoire des sciences par Julien Bourdette.",
        inLanguage: 'fr-FR',
        publisher: { '@id': `${SITE_URL}/#julien-bourdette` },
        author: { '@id': `${SITE_URL}/#julien-bourdette` },
    };

    return toJsonLd({
        '@context': 'https://schema.org',
        '@graph': [person, website],
    });
}

/**
 * JSON-LD schema for a video entry. Used on /videos/[slug] so YouTube
 * embeds become eligible for Google's video rich results.
 */
export function generateVideoSchema(entry: CollectionEntry<'videos'>, thumbnailUrl?: string): string {
    const permalink = `${SITE_URL}/videos/${entry.id}`;
    const thumb = toAbsoluteUrl(thumbnailUrl);
    const published = new Date(entry.data.date).toISOString();

    // Convert "mm:ss" or "hh:mm:ss" to ISO 8601 duration (PT…H…M…S).
    function toIsoDuration(d: string | undefined): string | undefined {
        if (!d) return undefined;
        const parts = d.split(':').map((p) => parseInt(p, 10));
        if (parts.some(Number.isNaN)) return undefined;
        let h = 0;
        let m: number;
        let s: number;
        if (parts.length === 2) [m, s] = parts;
        else if (parts.length === 3) [h, m, s] = parts;
        else return undefined;
        // TODO: [Corriger la durée nulle] "00:00" produit "PT" et non "PT0S" (le repli `|| 'PT0S'` n'était jamais atteint).
        return `PT${h ? `${h}H` : ''}${m ? `${m}M` : ''}${s ? `${s}S` : ''}`;
    }

    const schema = {
        '@context': 'https://schema.org',
        '@type': 'VideoObject',
        name: entry.data.title,
        description: entry.data.description,
        thumbnailUrl: thumb ? [thumb] : undefined,
        uploadDate: published,
        embedUrl: entry.data.videoUrl,
        duration: toIsoDuration(entry.data.duration),
        author: {
            '@type': 'Person',
            name: 'Julien Bourdette',
            url: `${SITE_URL}/a-propos`,
        },
        publisher: {
            '@type': 'Organization',
            name: 'Miroirs Polaires',
            logo: {
                '@type': 'ImageObject',
                url: `${SITE_URL}/images/logo-mp.png`,
            },
        },
        mainEntityOfPage: {
            '@type': 'WebPage',
            '@id': permalink,
        },
    };

    return toJsonLd(schema);
}
