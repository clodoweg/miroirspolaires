/**
 * Historique des passages du script d'annotation des astrophotos (`annotate_astro.py`, dépôt astrobin).
 *
 * Responsabilité : fusionner le rapport d'un passage (`<astrobin>/annotations-report.json`) dans
 * `src/data/annotation-runs.json`, que l'admin affiche dans la liste des astrophotos (réussite, photo ignorée,
 * échec et sa raison), et choisir les photos à redessiner (`update-annotations.mjs`). Seule
 * `importAnnotationReportFile` lit et écrit sur le disque.
 */
import fs from 'node:fs';

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

/**
 * Lit le rapport d'annotate_astro.py et l'ajoute à l'historique.
 *
 * Un rapport absent ou illisible est seulement signalé : l'historique n'est qu'un affichage.
 *
 * @param {{ reportPath: string, historyPath: string, dryRun?: boolean, log?: (message: string) => void }} options -
 *   Chemins du rapport et de l'historique ; `dryRun` n'écrit rien.
 * @returns {{ ok: number, skipped: number, failed: number } | null} Le bilan du rapport, ou `null` sans rapport lisible.
 */
export function importAnnotationReportFile({ reportPath, historyPath, dryRun = false, log = console.log }) {
    if (!fs.existsSync(reportPath)) {
        log('Aucun rapport d’annotations (scrape sans annotate_astro.py ou sans photo à traiter).');
        return null;
    }
    let report;
    try {
        report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    } catch (error) {
        log(`⚠️  Rapport d’annotations illisible : ${error.message}`);
        return null;
    }
    const counts = summarizeAnnotationReport(report);
    log(`Annotations : ${counts.ok} réussie(s), ${counts.skipped} ignorée(s), ${counts.failed} en échec.`);
    const history = fs.existsSync(historyPath) ? JSON.parse(fs.readFileSync(historyPath, 'utf8')) : {};
    const { history: next, added } = mergeAnnotationReport(history, report);
    if (added === 0) {
        log('Historique des annotations déjà à jour.');
        return counts;
    }
    log(`${dryRun ? '[dry-run] Serait ajouté' : 'Ajouté'} : ${added} passage(s) à l’historique des annotations.`);
    if (!dryRun) fs.writeFileSync(historyPath, `${JSON.stringify(next, null, 2)}\n`);
    return counts;
}

/**
 * Clé R2 du calque d'une photo, sous l'année du CSV (comme `photos.ts`).
 *
 * @param {{ ID: string, Uploaded?: string }} row - Ligne du CSV.
 * @returns {string} La clé.
 */
export function annotationKeyForRow(row) {
    return `astrophotographies/annotations/${String(row.Uploaded ?? '').slice(0, 4)}/${String(row.ID).trim()}_annotation.svg`;
}

/**
 * Photos dont le calque est à redessiner : absent, ou pas encore dessiné par annotate_astro.py.
 *
 * @param {{ ID: string, Uploaded?: string }[]} rows - Lignes du CSV.
 * @param {Map<string, string>} kindByKey - Origine des calques présents sur R2 (`classifyAnnotationSvg().kind`).
 * @param {{ all?: boolean }} [options] - `all` : toutes les photos, même celles déjà dessinées par le script.
 * @returns {string[]} Les ID AstroBin, dans l'ordre du CSV.
 */
export function planAnnotationTargets(rows, kindByKey, { all = false } = {}) {
    return rows
        .filter((row) => /^\d{1,12}$/.test(String(row.ID ?? '').trim()))
        .filter((row) => all || kindByKey.get(annotationKeyForRow(row)) !== 'miroirs')
        .map((row) => String(row.ID).trim());
}
