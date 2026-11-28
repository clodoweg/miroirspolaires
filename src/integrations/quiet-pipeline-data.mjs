/**
 * Plugin Vite : pas de rechargement de page quand les données écrites par les scripts changent
 *
 * Responsabilité : en dev, invalider les modules qui dépendent des fichiers réécrits par
 * `update-photos.mjs` et `update-content.mjs` (CSV et JSON de `src/data/`), ou par `/admin/donnees/routes-cds`, sans envoyer
 * de `full-reload` au navigateur.
 *
 * POURQUOI : recharger une page de l'admin coupe sa connexion à `/api/admin/scripts/run`, qui tue
 * alors le script en cours (SIGTERM). « Mettre à jour les photos » s'arrêtait ainsi à mi-parcours, dès
 * l'écriture d'un de ces fichiers, selon les pages déjà visitées (elles remplissent le graphe de
 * modules). Le prochain chargement de page voit bien les nouvelles données.
 */

const QUIET_FILES = [
    '/data/astrobin_clodoweg_gallery_python.csv',
    '/src/data/alt.json',
    '/src/data/annotation-runs.json',
    '/src/data/astro_details.json',
    '/src/data/blog.json',
    '/src/data/image-dimensions.json',
    '/src/data/seo.json',
    '/src/data/upstream-priority.json',
    '/src/data/web-images.json',
    '/src/data/wikipedia.json',
];

/**
 * Invalide un module et tous ceux qui l'importent.
 *
 * @param {import('vite').EnvironmentModuleGraph} moduleGraph - Graphe de l'environnement.
 * @param {import('vite').EnvironmentModuleNode} moduleNode - Module à invalider.
 * @param {number} timestamp - Horodatage de la mise à jour.
 * @param {Set<import('vite').EnvironmentModuleNode>} seen - Modules déjà traités.
 * @returns {void}
 */
function invalidateWithImporters(moduleGraph, moduleNode, timestamp, seen) {
    if (seen.has(moduleNode)) return;
    seen.add(moduleNode);
    moduleGraph.invalidateModule(moduleNode, new Set(), timestamp, true);
    for (const importer of moduleNode.importers) invalidateWithImporters(moduleGraph, importer, timestamp, seen);
}

/**
 * Crée le plugin.
 *
 * @returns {import('vite').Plugin} Le plugin Vite.
 */
export default function quietPipelineData() {
    return {
        name: 'miroirs-polaires:quiet-pipeline-data',
        apply: 'serve',
        enforce: 'pre',
        hotUpdate: {
            order: 'pre',
            handler({ file, modules, timestamp }) {
                if (!QUIET_FILES.some((quietFile) => file.endsWith(quietFile))) return undefined;
                const seen = new Set();
                for (const moduleNode of modules) {
                    invalidateWithImporters(this.environment.moduleGraph, moduleNode, timestamp, seen);
                }
                return [];
            },
        },
    };
}
