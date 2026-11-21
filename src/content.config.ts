/**
 * @file src/content.config.ts
 * @description Configuration des collections de contenu pour le site Miroirs Polaires.
 * Définit les schémas de validation et les chargeurs pour le blog, les voyages et les vidéos.
 */

import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * Collection pour les articles de blog.
 * Charge les fichiers Markdown de manière récursive depuis src/content/blog/.
 */
const blogCollection = defineCollection({
    loader: glob({ pattern: '**/[^_]*.{md,mdx}', base: './src/content/blog' }),
    schema: () =>
        z.object({
            title: z.string(),
            date: z.string(),
            categories: z.array(z.string()),
            description: z.string(),
            seoDescription: z.string().optional(),
            image: z.string(),
            showImage: z.boolean().default(true).optional(),
            draft: z.boolean().optional().default(false),
            hideImageCaptions: z.boolean().optional().default(false),
        }),
});

/**
 * Collection pour les récits de voyages.
 * Charge les fichiers Markdown de manière récursive depuis src/content/voyages/.
 */
const voyagesCollection = defineCollection({
    loader: glob({ pattern: '**/[^_]*.{md,mdx}', base: './src/content/voyages' }),
    schema: () =>
        z.object({
            title: z.string(),
            date: z.string().optional(),
            description: z.string().optional(),
            image: z.string(),
            gallery: z.array(z.string()).optional(),
            country: z.union([z.string(), z.array(z.string())]).optional(),
            season: z.enum(['Hiver', 'Printemps', 'Été', 'Automne']).optional(),
            year: z.number().optional(),
            draft: z.boolean().optional().default(false),
        }),
});

/**
 * Collection pour les vidéos.
 * Charge les fichiers Markdown de manière récursive depuis src/content/videos/.
 */
const videosCollection = defineCollection({
    loader: glob({ pattern: '**/[^_]*.{md,mdx}', base: './src/content/videos' }),
    schema: () =>
        z.object({
            title: z.string(),
            date: z.string(),
            duration: z.string().optional(),
            image: z.string(),
            videoUrl: z.string(),
            description: z.string(),
            categories: z.array(z.string()).optional(),
        }),
});

/**
 * Exportation de l'ensemble des collections de contenu.
 */
export const collections = {
    blog: blogCollection,
    voyages: voyagesCollection,
    videos: videosCollection,
};
