/**
 * Historique des passages du script d'annotation des astrophotos (`annotate_astro.py`, dépôt astrobin).
 *
 * Responsabilité : fusionner le rapport d'un passage (`<astrobin>/annotations-report.json`) dans
 * `src/data/annotation-runs.json`, que l'admin affiche dans la liste des astrophotos (réussite, photo ignorée,
 * échec et sa raison). Logique pure, sans accès disque.
 */

/** Passages gardés par photo : assez pour voir un échec suivi d'une reprise. */
export const MAX_ATTEMPTS_PER_PHOTO = 5;

const STATUSES = new Set(['ok', 'skipped', 'failed']);

/**
 * Ajoute les passages d'un rapport à l'historique, du plus récent au plus ancien.
 *
 * Un rapport déjà fusionné (même date pour la même photo) n'est pas ajouté deux fois : en local, update-photos.mjs
 * peut relire le rapport d'un scrape ancien.
 *
 * @param {Record<string, object[]>} history - Contenu actuel de `annotation-runs.json`.
 * @param {{ runAt?: string, photos?: Record<string, object> }} report - Rapport d'`annotate_astro.py`.
 * @returns {{ history: Record<string, object[]>, added: number }} Le nouvel historique et le nombre de passages ajoutés.
 */
export function mergeAnnotationReport(history, report) {
    const next = { ...history };
    const runAt = typeof report?.runAt === 'string' ? report.runAt : null;
    if (!runAt || !report.photos || typeof report.photos !== 'object') return { history: next, added: 0 };

    let added = 0;
    for (const [id, entry] of Object.entries(report.photos)) {
        if (!/^\d{1,12}$/.test(id) || !entry || !STATUSES.has(entry.status)) continue;
        const previous = Array.isArray(next[id]) ? next[id] : [];
        if (previous.some((attempt) => attempt.at === runAt)) continue;
        const attempt = { at: runAt, status: entry.status };
        if (typeof entry.reason === 'string' && entry.reason) attempt.reason = entry.reason.slice(0, 200);
        if (Number.isInteger(entry.objects)) attempt.objects = entry.objects;
        if (typeof entry.wcsSource === 'string' && entry.wcsSource) attempt.wcsSource = entry.wcsSource;
        next[id] = [attempt, ...previous].slice(0, MAX_ATTEMPTS_PER_PHOTO);
        added++;
    }
    return { history: next, added };
}

/**
 * Compte les statuts d'un rapport, pour le journal du job.
 *
 * @param {{ photos?: Record<string, { status?: string }> }} report - Rapport d'`annotate_astro.py`.
 * @returns {{ ok: number, skipped: number, failed: number }} Le nombre de photos par statut.
 */
export function summarizeAnnotationReport(report) {
    const counts = { ok: 0, skipped: 0, failed: 0 };
    for (const entry of Object.values(report?.photos ?? {})) {
        if (entry && STATUSES.has(entry.status)) counts[entry.status]++;
    }
    return counts;
}
