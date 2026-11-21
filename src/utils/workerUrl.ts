/**
 * Composition des URL du worker de redimensionnement (sans dépendance serveur)
 *
 * Responsabilité : format unique `${worker}/w_<largeur>,q_<qualité>,f_<format>/<clé>`, partagé par
 * `buildOptimizedUrl()` (`imageService.ts`, côté serveur) et les îlots React de la carte du ciel,
 * qui ne peuvent pas importer `imageService.ts` (lecture de `process.env` et `import.meta.glob`
 * de tous les assets).
 */

/** Worker public utilisé quand `IMAGE_WORKER_URL` n'est pas exposée au navigateur. */
export const DEFAULT_IMAGE_WORKER_URL = 'https://images.miroirspolaires.fr';

export interface WorkerImageOptions {
    width: number;
    quality?: number;
    /** Toujours `jpeg` en pratique : le worker ne produit que du WebP sans perte (voir CLAUDE.md). */
    format?: 'webp' | 'avif' | 'jpeg';
}

/**
 * Construit l'URL du worker pour une clé R2.
 *
 * @param workerBase - URL du worker (sans `/` final obligatoire).
 * @param key - Clé R2, avec ou sans `/` initial (`astrophotographies/mini/2025/1.jpg`).
 * @param options - Largeur, qualité (85 par défaut) et format (`jpeg` par défaut).
 * @returns L'URL complète du worker.
 */
export function composeWorkerUrl(workerBase: string, key: string, options: WorkerImageOptions): string {
    const { width, quality = 85, format = 'jpeg' } = options;
    const keyWithSlash = key.startsWith('/') ? key : `/${key}`;
    return `${workerBase.replace(/\/$/, '')}/w_${width},q_${quality},f_${format}${keyWithSlash}`;
}
