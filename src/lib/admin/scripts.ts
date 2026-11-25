export type ScriptCategory = 'pipeline' | 'seo' | 'check';

/**
 * Option d'un script, affichée en case à cocher, en liste ou en champ numérique.
 *
 * WARNING: sécurité. À distance, seules ces options déclarées sont acceptées (`buildScriptArgs`), au serveur
 * comme dans le runner de GitHub Actions ; jamais d'argument libre.
 */
export type ScriptOption =
    | {
          id: string;
          kind: 'flag';
          /** Argument ajouté quand la case est cochée (`--missing`). */
          flag: string;
          label: string;
          help: string;
          /** Efface des données : l'admin demande une confirmation renforcée. */
          destructive?: boolean;
      }
    | {
          id: string;
          kind: 'list';
          /** Préfixe de l'argument, suivi des valeurs séparées par des virgules (`--only=`). */
          flag: string;
          label: string;
          help: string;
          /** Motif que chaque valeur doit respecter (source d'expression régulière, ancrée). */
          pattern: string;
          maxItems: number;
      }
    | {
          id: string;
          kind: 'number';
          /** Argument suivi de la valeur, séparée par une espace (`--max-mag 14`). */
          flag: string;
          label: string;
          help: string;
          min: number;
          max: number;
          integer?: boolean;
          /** Valeur du script quand l'option est absente (affichée, jamais transmise). */
          defaultValue: number;
      };

/** Valeurs choisies dans l'admin, par identifiant d'option. */
export type ScriptOptionValues = Record<string, boolean | number | string[]>;

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
     * Masque l'entrée de /admin/infra/scripts, qui lance sans argument : sans dossier, ce script porterait sur
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
     * `devOnly` ni `needsTarget` (à distance, seuls les arguments issus de `options` sont transmis).
     */
    remote?: boolean;
    /**
     * Réservé à l'admin distant : masqué de /admin/infra/scripts en local et refusé par `api/admin/scripts/run.ts`.
     * POURQUOI : `update-photos-ci` (et sa variante `-force`) est conçu pour un disque vide (GitHub Actions) ; lancé en local, il
     * comparerait tout `src/assets/astrophotographies/` à R2 et écrirait sur le R2 de production.
     */
    remoteOnly?: boolean;
    /** Options proposées dans l'admin (cases à cocher, listes, nombres), validées par `buildScriptArgs`. */
    options?: ScriptOption[];
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
        // WARNING: écrit sur le R2 de production (après envoi complet sous incoming/astro/) et lit AstroBin.
        id: 'update-photos-ci',
        label: 'Astrophotos : mettre à jour les photos (GitHub Actions)',
        description:
            'Lance le scrape AstroBin (nouvelles photos seulement), génère miniatures, alts, descriptions Wikipedia, versions web et dimensions, envoie tout sur R2 sous un préfixe temporaire puis le copie vers les clés définitives si tout a réussi, et committe le CSV et les manifestes sur dev. Ne supprime rien sur R2. Les descriptions SEO restent à écrire via Claude Code.',
        category: 'pipeline',
        command: 'node',
        args: ['scripts/pipeline/update-photos.mjs', '--ci'],
        writes: true,
        remote: true,
        remoteOnly: true,
    },
    {
        // WARNING: retélécharge toute la galerie (2,8 Go) et remplace sur R2 les fichiers dont le contenu a changé.
        id: 'update-photos-ci-force',
        label: 'Astrophotos : tout recopier depuis AstroBin (GitHub Actions)',
        description:
            'Comme la mise à jour des photos, mais retélécharge tous les médias d’AstroBin (raws, annotations, skyplots) et régénère miniatures et versions web, même s’ils sont déjà sur R2. Seuls les fichiers dont le contenu a changé remplacent ceux de R2 (cache du worker purgé) ; rien n’est supprimé. Long : de 30 min à 1 h.',
        category: 'pipeline',
        command: 'node',
        args: ['scripts/pipeline/update-photos.mjs', '--ci', '--force-media'],
        writes: true,
        remote: true,
        remoteOnly: true,
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
        options: [
            {
                id: 'only',
                kind: 'list',
                flag: '--only=',
                label: 'Catalogues à traiter',
                help: 'Identifiants des catalogues (messier, caldwell…). Vide : tous.',
                pattern: '[a-z0-9-]{1,40}',
                maxItems: 50,
            },
            {
                id: 'missing',
                kind: 'flag',
                flag: '--missing',
                label: 'Seulement les catalogues sans instantané',
                help: 'Saute les catalogues déjà présents dans src/data/catalogues/.',
            },
            {
                id: 'force',
                kind: 'flag',
                flag: '--force',
                label: 'Accepter une liste plus courte',
                help: 'Écrit l’instantané même si la nouvelle liste est nettement plus courte que l’actuelle (sinon, elle est jugée tronquée et ignorée).',
                destructive: true,
            },
            {
                id: 'dryRun',
                kind: 'flag',
                flag: '--dry-run',
                label: 'Simulation',
                help: 'Télécharge et valide sans rien écrire.',
            },
        ],
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
        options: [
            {
                id: 'maxMag',
                kind: 'number',
                flag: '--max-mag',
                label: 'Magnitude de la dernière tranche',
                help: 'Dernière tranche de magnitude traitée. La tranche ≤ 12 est toujours traitée.',
                min: 1,
                max: 35,
                defaultValue: 30.8,
            },
            {
                id: 'batchSize',
                kind: 'number',
                flag: '--batch-size',
                label: 'Étoiles par requête',
                help: 'Taille des lots envoyés au CDS XMatch.',
                min: 100,
                max: 50000,
                integer: true,
                defaultValue: 15000,
            },
            {
                id: 'reset',
                kind: 'flag',
                flag: '--reset',
                label: 'Repartir de zéro',
                help: 'Vide la table variable_stars_gaia avant le traitement.',
                destructive: true,
            },
        ],
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

/** Options refusées : inconnues, mal typées ou hors bornes. */
export class ScriptOptionsError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ScriptOptionsError';
    }
}

/**
 * Traduit les options choisies en arguments, après validation stricte.
 *
 * @param script - Script du registre.
 * @param values - Valeurs reçues (non fiables : corps de requête ou ligne Turso).
 * @returns Les arguments à ajouter à `script.args`, dans l'ordre des options déclarées.
 * @throws ScriptOptionsError si une option est inconnue, mal typée ou hors bornes.
 */
export function buildScriptArgs(script: ScriptDef, values: unknown): string[] {
    if (values === undefined || values === null) return [];
    if (typeof values !== 'object' || Array.isArray(values)) throw new ScriptOptionsError('Options invalides.');
    const declared = new Map((script.options ?? []).map((option) => [option.id, option]));
    const record = values as Record<string, unknown>;
    for (const key of Object.keys(record)) {
        if (!declared.has(key)) throw new ScriptOptionsError(`Option inconnue : ${key}`);
    }
    const args: string[] = [];
    for (const option of script.options ?? []) {
        const value = record[option.id];
        if (value === undefined || value === null) continue;
        if (option.kind === 'flag') {
            if (typeof value !== 'boolean') throw new ScriptOptionsError(`${option.label} : oui ou non attendu.`);
            if (value) args.push(option.flag);
        } else if (option.kind === 'list') {
            if (!Array.isArray(value)) throw new ScriptOptionsError(`${option.label} : liste attendue.`);
            const pattern = new RegExp(`^(?:${option.pattern})$`);
            const items = [...new Set(value)];
            if (items.length > option.maxItems) throw new ScriptOptionsError(`${option.label} : trop de valeurs.`);
            for (const item of items) {
                if (typeof item !== 'string' || !pattern.test(item)) {
                    throw new ScriptOptionsError(`${option.label} : valeur refusée (${String(item)}).`);
                }
            }
            if (items.length > 0) args.push(`${option.flag}${items.join(',')}`);
        } else {
            const isValidNumber =
                typeof value === 'number' &&
                Number.isFinite(value) &&
                value >= option.min &&
                value <= option.max &&
                (!option.integer || Number.isInteger(value));
            if (!isValidNumber) {
                throw new ScriptOptionsError(`${option.label} : nombre entre ${option.min} et ${option.max} attendu.`);
            }
            args.push(option.flag, String(value));
        }
    }
    return args;
}

/**
 * Indique si les options choisies effacent des données.
 *
 * @param script - Script du registre.
 * @param values - Valeurs choisies.
 * @returns `true` si une option `destructive` est cochée.
 */
export function hasDestructiveOption(script: Pick<ScriptDef, 'options'>, values: ScriptOptionValues): boolean {
    return (script.options ?? []).some(
        (option) => option.kind === 'flag' && option.destructive && values[option.id] === true,
    );
}
