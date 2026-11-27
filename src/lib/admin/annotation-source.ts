/**
 * Origine des calques d'annotations des astrophotos, pour la liste de l'admin.
 *
 * Responsabilité : reconnaître qui a produit un `<id>_annotation.svg` à partir de ses premiers octets, et
 * décrire le dernier passage du script d'annotation (`src/data/annotation-runs.json`, écrit par update-photos.mjs).
 *
 * POURQUOI lire le fichier plutôt que tenir un registre : seul le contenu servi (disque ou R2) fait foi. Un import
 * peut échouer à mi-chemin et laisser l'ancien SVG d'AstroBin en ligne, comme le 26/11/2026 (429 de nova).
 */

/** Producteur du SVG. */
export type AnnotationKind = 'miroirs' | 'astrobin' | 'astrobin-local' | 'unknown';

export interface AnnotationInfo {
    kind: AnnotationKind;
    /** Date de génération inscrite dans le SVG (calques Miroirs Polaires récents seulement). */
    generatedAt?: string;
    /** Date de dernière écriture du fichier (R2 ou disque). */
    updatedAt?: string;
    /** Nombre d'objets annotés (calques Miroirs Polaires). */
    objectCount?: number;
    /** Origine de l'astrométrie : résolution d'AstroBin ou soumission propre à nova. */
    wcsSource?: 'astrobin' | 'nova';
}

export type AnnotationRunStatus = 'ok' | 'skipped' | 'failed';

/** Un passage du script d'annotation sur une photo. */
export interface AnnotationAttempt {
    at: string;
    status: AnnotationRunStatus;
    reason?: string;
    objects?: number;
    wcsSource?: string;
}

/** Contenu de `src/data/annotation-runs.json` : derniers passages par ID AstroBin, du plus récent au plus ancien. */
export type AnnotationRuns = Record<string, AnnotationAttempt[]>;

/** Octets lus en tête de fichier : l'élément `<svg>` et ses attributs tiennent largement dedans. */
export const ANNOTATION_HEAD_BYTES = 2048;

export const ANNOTATION_KIND_LABELS: Record<AnnotationKind, string> = {
    miroirs: 'Miroirs Polaires',
    astrobin: 'AstroBin (PixInsight)',
    'astrobin-local': 'AstroBin (repli local)',
    unknown: 'Inconnue',
};

function readAttribute(head: string, name: string): string | undefined {
    const match = new RegExp(`\\s${name}="([^"]*)"`).exec(head);
    return match && match[1] !== '' ? match[1] : undefined;
}

/**
 * Reconnaît le producteur d'un calque d'après le début du fichier.
 *
 * - `data-generator="annotate_astro"` : calque dessiné par `annotate_astro.py` (dépôt astrobin) ;
 * - `[Antigravity Local Generator]` : SVG reconstruit par `generate_local_svg.py` depuis le JSON d'AstroBin ;
 * - `PixInsight` : SVG natif d'AstroBin.
 *
 * @param head - Début du fichier SVG (`ANNOTATION_HEAD_BYTES` octets suffisent).
 * @returns Le producteur et les métadonnées inscrites dans le calque.
 */
export function classifyAnnotationSvg(head: string): AnnotationInfo {
    if (head.includes('data-generator="annotate_astro"')) {
        const info: AnnotationInfo = { kind: 'miroirs' };
        const generatedAt = readAttribute(head, 'data-generated-at');
        if (generatedAt) info.generatedAt = generatedAt;
        const wcsSource = readAttribute(head, 'data-wcs-source');
        if (wcsSource === 'astrobin' || wcsSource === 'nova') info.wcsSource = wcsSource;
        const objects = readAttribute(head, 'data-objects');
        if (objects && /^\d+$/.test(objects)) {
            info.objectCount = Number(objects);
        } else {
            // POURQUOI : les premiers calques (26/11/2026) n'avaient pas data-objects ; l'aria-label liste les objets.
            const label = /aria-label="Objets annotés : ([^"]*)"/.exec(head);
            if (label) info.objectCount = label[1].trim() ? label[1].split(',').length : 0;
        }
        return info;
    }
    if (head.includes('[Antigravity Local Generator]')) return { kind: 'astrobin-local' };
    if (head.includes('PixInsight')) return { kind: 'astrobin' };
    return { kind: 'unknown' };
}

/**
 * Dernier passage du script d'annotation sur une photo.
 *
 * @param runs - Contenu de `annotation-runs.json`.
 * @param id - ID AstroBin.
 * @returns Le passage le plus récent, ou `undefined`.
 */
export function latestAnnotationAttempt(runs: AnnotationRuns, id: string): AnnotationAttempt | undefined {
    const attempts = runs[id];
    return Array.isArray(attempts) && attempts.length > 0 ? attempts[0] : undefined;
}

/** Filtres de la liste des astrophotos portant sur les annotations. */
export const ANNOTATION_FILTERS = {
    'annotation-not-miroirs': 'Calques pas encore Miroirs Polaires',
    'annotation-miroirs': 'Calques Miroirs Polaires',
    'annotation-astrobin': 'SVG d’AstroBin (natif ou repli local)',
    'annotation-failed': 'Dernier essai d’annotation en échec ou ignoré',
} as const;

export type AnnotationFilter = keyof typeof ANNOTATION_FILTERS;

/** Ce que la liste sait de l'annotation d'une photo. */
export interface AnnotationState {
    hasAnnotation: boolean;
    annotation?: AnnotationInfo;
    annotationRun?: AnnotationAttempt;
}

/**
 * Indique si une photo passe un filtre d'annotation.
 *
 * @param photo - État de l'annotation de la photo.
 * @param filter - Filtre choisi.
 * @returns Vrai si la photo doit être affichée.
 */
export function matchesAnnotationFilter(photo: AnnotationState, filter: AnnotationFilter): boolean {
    const kind = photo.hasAnnotation ? photo.annotation?.kind : undefined;
    switch (filter) {
        case 'annotation-miroirs':
            return kind === 'miroirs';
        case 'annotation-not-miroirs':
            return kind !== 'miroirs';
        case 'annotation-astrobin':
            return kind === 'astrobin' || kind === 'astrobin-local';
        case 'annotation-failed':
            return photo.annotationRun?.status === 'failed' || photo.annotationRun?.status === 'skipped';
    }
}

/**
 * Formate une date ISO en jour français (`26/11/2026`), sans dépendre du fuseau du navigateur pour le jour.
 *
 * @param iso - Date ISO 8601.
 * @returns La date, ou la chaîne reçue si elle n'est pas une date ISO.
 */
export function formatAnnotationDate(iso: string): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : iso;
}

const RUN_STATUS_LABELS: Record<AnnotationRunStatus, string> = {
    ok: 'Réussi',
    skipped: 'Ignorée',
    failed: 'Échec',
};

/**
 * Décrit un passage du script d'annotation (« Échec le 26/11/2026 : HTTP Error 429 »).
 *
 * @param run - Passage à décrire.
 * @returns La description.
 */
export function describeAnnotationRun(run: AnnotationAttempt): string {
    const details =
        run.status === 'ok' ? (run.objects !== undefined ? `${run.objects} objet(s)` : '') : (run.reason ?? '');
    return `${RUN_STATUS_LABELS[run.status]} le ${formatAnnotationDate(run.at)}${details ? ` : ${details}` : ''}`;
}
