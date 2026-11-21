import 'dotenv/config';
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

import { rehypeFigure } from './src/plugins/rehype-figure.mjs';
import { rehypeImageLoading } from './src/plugins/rehype-image-loading.mjs';
import { rehypeMasonry } from './src/plugins/rehype-masonry.mjs';
import { rehypeProbeDimensions } from './src/plugins/rehype-probe-dimensions.mjs';

import sitemap from '@astrojs/sitemap';

import vercel from '@astrojs/vercel';

import { buildLastmodMap } from './scripts/build/sitemap-lastmod.mjs';
import securityHeaders from './src/integrations/security-headers.mjs';
import quietPipelineData from './src/integrations/quiet-pipeline-data.mjs';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const lastmodMap = buildLastmodMap();

/**
 * Empreinte courte d'un fichier du dépôt.
 *
 * @param {string} relativePath - Chemin relatif à ce fichier.
 * @returns {string} Les 16 premiers caractères du SHA-256.
 */
const fileDigest = (relativePath) =>
    createHash('sha256')
        .update(readFileSync(new URL(relativePath, import.meta.url)))
        .digest('hex')
        .slice(0, 16);
const fallbackLastmod = new Date();

export default defineConfig({
    integrations: [
        react(),
        sitemap({
            changefreq: 'weekly',
            priority: 0.7,
            filter: (page) => {
                const { pathname } = new URL(page);
                // POURQUOI : /admin et /api n'existent qu'en dev (404 en production) et ne doivent pas être indexés.
                if (/^\/(admin|api)(\/|$)/.test(pathname)) return false;
                // La boutique et les CGV ne sont indexées que lorsque la boutique est activée.
                const isBoutiqueEnabled =
                    String(process.env.ENABLE_BOUTIQUE ?? process.env.enable_boutique ?? '')
                        .trim()
                        .toLowerCase() === 'true';
                return isBoutiqueEnabled || !/^\/(boutique|cgv)(\/|$)/.test(pathname);
            },
            serialize(item) {
                const known = lastmodMap.get(item.url);
                item.lastmod = (known ?? fallbackLastmod).toISOString();
                return item;
            },
        }),
        // Doit rester après l'adaptateur (inséré en tête par Astro) : modifie .vercel/output/config.json.
        securityHeaders(),
    ],
    prefetch: true,
    markdown: {
        rehypePlugins: [
            // Probe MUST run before rehypeMasonry: masonry copies width/height
            // from img.properties into the picture/source/img it generates.
            // POURQUOI : ces deux plugins lisent des JSON générés. Le cache de contenu d'Astro
            // (.astro/data-store.json, aussi conservé entre builds) ne se vide que si la config change :
            // passer l'empreinte des JSON en option l'invalide quand ils changent, sinon les articles
            // gardent d'anciennes dimensions ou ignorent les versions web.
            [rehypeProbeDimensions, { dimensionsDigest: fileDigest('./src/data/image-dimensions.json') }],
            [rehypeMasonry, { webImagesDigest: fileDigest('./src/data/web-images.json') }],
            rehypeImageLoading,
            rehypeFigure,
        ],
    },
    output: 'static',
    adapter: vercel(),
    site: 'https://www.miroirspolaires.fr',
    image: {
        domains: ['pub-r2.miroirspolaires.fr', 'miroirspolaires.fr'],
        remotePatterns: [{ protocol: 'https' }],
    },
    vite: {
        plugins: [tailwindcss(), quietPipelineData()],
        server: {
            watch: {
                // POURQUOI: Empêche Vite de recharger la page pendant les scripts qui écrivent ces images.
                // Un rechargement de l'admin coupe sa connexion au script et le tue (SIGTERM).
                ignored: [
                    '**/src/assets/astrophotographies/**',
                    '**/src/assets/index/mini/**',
                    '**/data/astrobin_clodoweg_gallery_python.html',
                    // POURQUOI : la création d'un fichier déclenche un full-reload que quiet-pipeline-data ne peut pas
                    // intercepter. Effet en dev : un nouvel instantané n'est lu qu'après un redémarrage du serveur.
                    '**/src/data/catalogues/**',
                ],
            },
        },
        define: {
            'import.meta.env.VERCEL_ENV': JSON.stringify(process.env.VERCEL_ENV),
        },
        optimizeDeps: {
            include: ['react', 'react-dom', 'react-dom/client'],
        },
    },
});
