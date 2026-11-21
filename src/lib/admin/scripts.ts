export type ScriptCategory = 'pipeline' | 'seo' | 'check';

export interface ScriptDef {
    id: string;
    label: string;
    description: string;
    category: ScriptCategory;
    command: string;
    args: string[];
    /** Whether the script may write to disk (warn before running). */
    writes: boolean;
    /**
     * Masque l'entrée de /admin/scripts, qui lance sans argument : sans dossier, ce script porterait sur
     * plusieurs domaines. Seul un panneau qui lui passe un dossier (R2, cache, rappel web) peut la lancer.
     */
    needsTarget?: boolean;
    /**
     * Réservé à `npm run dev`, même une fois les scripts ouverts sur l'admin distant : le script lit
     * `src/assets/` ou le dépôt voisin `astrobin`, absents à distance, ou il est destructif (miroir R2).
     */
    devOnly?: boolean;
    /**
     * Lançable depuis l'admin distant : le script tourne dans GitHub Actions (`.github/workflows/admin-job.yml`)
     * et ce qu'il écrit sous `src/data/` ou `data/` est committé sur `dev`. Opt-in explicite, jamais avec
     * `devOnly` ni `needsTarget` (aucun argument n'est transmis à distance).
     */
    remote?: boolean;
}

/**
 * Registry of scripts exposed in the admin runner.
 * `command`/`args` are passed to child_process.spawn with cwd = project root.
 */
export const SCRIPTS: ScriptDef[] = [
    {
        id: 'update-photos',
        label: 'Astrophotos : mettre à jour les photos',
        description:
            'Importe depuis le dépôt astrobin, génère miniatures, alts (depuis le CSV) et descriptions Wikipedia manquants, envoie sur R2 les fichiers absents ou modifiés, puis met à jour les dimensions et les versions web. Ne supprime rien sur R2.',
        category: 'pipeline',
        command: 'node',
        args: ['scripts/pipeline/update-photos.mjs'],
        writes: true,
        devOnly: true,
    },
    {
        id: 'sync-r2',
        label: 'Sync R2 (assets → bucket)',
        description: 'Envoie vers Cloudflare R2 les fichiers de src/assets absents du bucket, sans rien supprimer.',
        category: 'pipeline',
        command: 'node',
        args: ['scripts/r2/upload_local_to_r2.js'],
        writes: true,
        devOnly: true,
        needsTarget: true,
    },
    {
        // WARNING: destructif. Vide les préfixes R2 avant de réenvoyer ; réservé à la case
        // « Delete first » de R2Panel, qui demande confirmation.
        id: 'mirror-r2',
        label: 'Miroir R2 (vide puis réenvoie)',
        description: 'Vide les dossiers distants sur R2 puis réenvoie tout le contenu local. Destructif.',
        category: 'pipeline',
        command: 'node',
        args: ['scripts/r2/upload_local_to_r2.js', '--delete-first'],
        writes: true,
        devOnly: true,
        needsTarget: true,
    },
    {
        id: 'generate-mini',
        label: 'Astrophotos : générer les miniatures',
        description: 'Génère les versions mini manquantes des astrophotos.',
        category: 'pipeline',
        command: 'node',
        args: ['scripts/pipeline/generate-mini.mjs', '--only=astro'],
        writes: true,
        devOnly: true,
    },
    {
        id: 'generate-mini-index',
        label: 'Accueil : générer les miniatures',
        description: 'Génère les versions mini manquantes des images de la page d’accueil.',
        category: 'pipeline',
        command: 'node',
        args: ['scripts/pipeline/generate-mini.mjs', '--only=index'],
        writes: true,
        devOnly: true,
    },
    {
        id: 'update-blog',
        label: 'Blog : mettre à jour les images',
        description:
            'Calcule les temps de lecture manquants du blog, envoie sur R2 les fichiers absents ou modifiés, puis met à jour les dimensions et les versions web, et signale les alts manquants. Ne supprime rien sur R2.',
        category: 'pipeline',
        command: 'node',
        args: ['scripts/pipeline/update-content.mjs', '--scope=blog'],
        writes: true,
        devOnly: true,
    },
    {
        id: 'update-voyages',
        label: 'Voyages : mettre à jour les images',
        description:
            'Envoie sur R2 les fichiers absents ou modifiés, puis met à jour les dimensions et les versions web, et signale les alts et descriptions SEO manquants. Ne supprime rien sur R2.',
        category: 'pipeline',
        command: 'node',
        args: ['scripts/pipeline/update-content.mjs', '--scope=voyages'],
        writes: true,
        devOnly: true,
    },
    {
        // POURQUOI : sans versions web, une image ajoutée passe par le worker, qui sert l'original
        // entier au-delà de 500 Ko. Le rappel de l'admin (WebImagesReminder) lance cette entrée.
        id: 'generate-web-images',
        label: 'Versions web des images (400/800/1200 px)',
        description:
            'Génère les versions web manquantes (blog, voyages, mini des astrophotos), les envoie sur R2 sous web/ et met à jour src/data/web-images.json, à committer ensuite.',
        category: 'pipeline',
        command: 'node',
        args: ['scripts/build/generate-web-images.mjs', '--upload'],
        writes: true,
        needsTarget: true,
    },
    {
        id: 'seo-check',
        label: 'Audit SEO complet',
        description: 'Lecture seule. Vérifie la couverture SEO, alt-texts, sitemap, structured data.',
        category: 'check',
        command: 'node',
        args: ['scripts/audit/seo-coverage.mjs'],
        writes: false,
        remote: true,
    },

    {
        id: 'generate-blog-metadata',
        label: 'Blog : calculer les temps de lecture',
        description: 'Calcule les temps de lecture manquants des articles, sans appel externe.',
        category: 'seo',
        command: 'node',
        args: ['scripts/seo/blog-metadata.js'],
        writes: true,
        remote: true,
    },
    {
        id: 'generate-astro-details',
        label: 'Astrophotos : générer les fiches techniques (Wiki)',
        description: 'Enrichit data/astro_details.json depuis Wikipedia.',
        category: 'seo',
        command: 'node',
        args: ['scripts/seo/astro-details.mjs'],
        writes: true,
        remote: true,
    },
    {
        id: 'generate-wiki-descriptions',
        label: 'Astrophotos : récupérer les descriptions Wikipedia',
        description: 'Reprend l’introduction de l’article Wikipedia des photos sans description.',
        category: 'seo',
        command: 'node',
        args: ['scripts/seo/wiki-descriptions.js'],
        writes: true,
        remote: true,
    },
    {
        id: 'lighthouse-audit',
        label: 'Audit de performance Lighthouse',
        description:
            'Exécute un audit de performance mobile complet (16 pages/slugs) et génère src/data/lighthouse-results.json. Cible locale ou prod.',
        category: 'check',
        command: 'node',
        args: ['scripts/audit/lighthouse-runner.mjs'],
        writes: true,
        remote: true,
    },
    {
        id: 'download-r2',
        label: 'Téléchargement R2 → Local',
        description: 'Télécharge les fichiers depuis le bucket Cloudflare R2 vers src/assets.',
        category: 'pipeline',
        command: 'node',
        args: ['scripts/r2/download_r2_to_local.js'],
        writes: true,
        devOnly: true,
        needsTarget: true,
    },
    {
        id: 'upload-missing-r2',
        label: 'Upload incrémental Local → R2',
        description: 'Transfère les nouveaux fichiers locaux de src/assets vers R2 sans écraser ni supprimer.',
        category: 'pipeline',
        command: 'node',
        args: ['scripts/r2/upload_local_to_r2.js', '--incremental'],
        writes: true,
        devOnly: true,
        needsTarget: true,
    },
    {
        id: 'warm-cache',
        label: 'Préchauffage du CDN (Warm)',
        description:
            'Parcourt le bucket R2 et demande systématiquement chaque image optimisée pour pré-remplir le cache CDN Cloudflare.',
        category: 'pipeline',
        command: 'node',
        args: ['scripts/r2/warm-cache.mjs'],
        writes: false,
        needsTarget: true,
    },
    {
        id: 'purge-cache',
        label: 'Purge complète du cache CDN',
        description:
            'Demande la purge systématique de toutes les variantes optimisées des images astrophotographies du cache du Worker.',
        category: 'pipeline',
        command: 'node',
        args: ['scripts/r2/purge-cache.mjs'],
        writes: true,
        needsTarget: true,
    },
    {
        id: 'update-catalogues',
        label: 'Catalogues du ciel profond : générer les instantanés',
        description:
            'Télécharge les catalogues depuis SIMBAD et VizieR et réécrit src/data/catalogues/, à committer ensuite. Conserve les instantanés existants si un catalogue échoue ou revient tronqué.',
        category: 'pipeline',
        command: 'node',
        args: ['scripts/build/update-catalogue-snapshots.mjs'],
        writes: true,
        remote: true,
    },
    {
        id: 'update-exoplanets',
        label: 'Mise à jour des Exoplanètes',
        description:
            "Interroge l'API VarAstro et le NASA Exoplanet Archive pour mettre à jour la base des exoplanètes.",
        category: 'pipeline',
        command: 'node',
        args: ['scripts/pipeline/update-exoplanets.mjs'],
        writes: true,
        remote: true,
    },
    {
        id: 'update-variable-stars',
        label: 'Mise à jour des Étoiles Variables',
        description:
            'Télécharge le catalogue AAVSO VSX et le fusionne avec Gaia DR3 pour actualiser les étoiles variables.',
        category: 'pipeline',
        command: 'node',
        args: ['scripts/pipeline/update-variable-stars.mjs'],
        writes: true,
    },
    {
        id: 'check-variable-stars',
        label: 'Audit des Étoiles Variables',
        description: 'Vérifie la complétude des étoiles variables par magnitude et mesure la couverture Gaia DR3.',
        category: 'pipeline',
        command: 'node',
        args: ['scripts/pipeline/check-variable-stars.mjs'],
        writes: false,
        remote: true,
    },
    {
        id: 'crossmatch-variable-stars',
        label: 'Cross-match Gaia des Étoiles Variables',
        description:
            "Exécute le cross-match spatial Gaia DR3 sur toutes les étoiles variables n'ayant pas de distance.",
        category: 'pipeline',
        command: 'node',
        args: ['scripts/pipeline/crossmatch-variable-stars.mjs'],
        writes: true,
        remote: true,
    },
    {
        id: 'update-comets',
        label: 'Mise à jour des Comètes',
        description:
            "Télécharge les derniers éléments orbitaux des comètes (CometEls.txt) depuis le Minor Planet Center de l'IAU.",
        category: 'pipeline',
        command: 'node',
        args: ['scripts/pipeline/update-comets.mjs'],
        writes: true,
        remote: true,
    },
    {
        id: 'update-asteroids',
        label: 'Mise à jour des Astéroïdes',
        description:
            "Télécharge les éléments orbitaux des astéroïdes géocroiseurs (NEA), inhabituels et distants depuis le Minor Planet Center de l'IAU.",
        category: 'pipeline',
        command: 'node',
        args: ['scripts/pipeline/update-asteroids.mjs'],
        writes: true,
        remote: true,
    },
];

/**
 * Récupère la définition d'un script d'administration par son identifiant unique.
 *
 * @param {string} id - L'identifiant unique du script recherché.
 * @returns {ScriptDef | undefined} La définition du script correspondante, ou undefined.
 *
 * @example
 * const script = getScript('warm-cache');
 * if (script) console.log(script.label);
 */
/**
 * Scripts lançables depuis l'admin distant (GitHub Actions).
 *
 * @returns Les entrées marquées `remote`.
 */
export function listRemoteScripts(): ScriptDef[] {
    return SCRIPTS.filter((script) => script.remote === true);
}

export function getScript(id: string): ScriptDef | undefined {
    return SCRIPTS.find((s) => s.id === id);
}
