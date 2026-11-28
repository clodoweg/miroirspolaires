/**
 * Version de l'URL du calque d'annotations d'une astrophoto, pour la page de la photo.
 *
 * POURQUOI : un calque redessiné garde la même clé R2. Sans version dans l'URL, le navigateur (et le cache du
 * worker) gardaient l'ancien SVG, servi `immutable` pendant un an (récif cosmique, 28/11/2026). La version suit
 * le dernier dessin réussi d'`annotate_astro.py` (`src/data/annotation-runs.json`) : chaque nouveau calque a une
 * nouvelle URL.
 */
import annotationRuns from '@/data/annotation-runs.json';
import type { AnnotationRuns } from '@/lib/admin/annotation-source';

/**
 * Version du calque d'une photo : date compacte du dernier dessin réussi.
 *
 * @param id - ID AstroBin.
 * @param runs - Historique des passages (par défaut, celui du dépôt).
 * @returns La version (`20261126160740`), ou `undefined` si aucun dessin n'a réussi (calque d'AstroBin).
 */
export function getAnnotationVersion(
    id: string | number,
    runs: AnnotationRuns = annotationRuns as AnnotationRuns,
): string | undefined {
    const attempts = runs[String(id)];
    const lastSuccess = Array.isArray(attempts) ? attempts.find((attempt) => attempt.status === 'ok') : undefined;
    const digits = lastSuccess?.at.replace(/\D/g, '');
    return digits || undefined;
}
