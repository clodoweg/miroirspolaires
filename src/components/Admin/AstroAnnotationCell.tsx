/**
 * Cellule « Annotation » de la liste des astrophotos (`AstroPhotosPanel.tsx`).
 *
 * Responsabilité : montrer d'un coup d'œil qui a produit le calque en ligne (Miroirs Polaires, AstroBin natif,
 * AstroBin reconstruit en local), quand il a été écrit, combien d'objets il annote, et si le dernier passage du
 * script d'annotation a échoué ou ignoré la photo. Le détail complet est dans l'infobulle.
 */
import { AlertCircle } from 'lucide-react';
import {
    ANNOTATION_KIND_LABELS,
    describeAnnotationRun,
    formatAnnotationDate,
    type AnnotationAttempt,
    type AnnotationInfo,
    type AnnotationKind,
} from '@/lib/admin/annotation-source';

const KIND_SHORT_LABELS: Record<AnnotationKind, string> = {
    miroirs: 'Miroirs',
    astrobin: 'AstroBin',
    'astrobin-local': 'AstroBin local',
    unknown: 'Inconnue',
};

const KIND_CLASSES: Record<AnnotationKind, string> = {
    miroirs: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
    astrobin: 'border-sky-500/30 bg-sky-500/10 text-sky-400',
    'astrobin-local': 'border-amber-500/30 bg-amber-500/10 text-amber-400',
    unknown: 'border-mp-glass-border bg-mp-glass-solid/40 text-mp-text-muted',
};

const WCS_LABELS = { astrobin: 'résolution d’AstroBin', nova: 'soumission propre à nova' } as const;

interface Props {
    hasAnnotation: boolean;
    annotation?: AnnotationInfo;
    annotationRun?: AnnotationAttempt;
    annotationRunCount?: number;
    annotationPath?: string;
}

export default function AstroAnnotationCell({
    hasAnnotation,
    annotation,
    annotationRun,
    annotationRunCount,
    annotationPath,
}: Props) {
    const kind: AnnotationKind | null = hasAnnotation ? (annotation?.kind ?? 'unknown') : null;
    const runFailed = annotationRun?.status === 'failed' || annotationRun?.status === 'skipped';

    const details = [
        kind ? `Origine : ${ANNOTATION_KIND_LABELS[kind]}` : 'Aucun calque en ligne',
        annotation?.updatedAt && `Fichier écrit le ${formatAnnotationDate(annotation.updatedAt)}`,
        annotation?.generatedAt && `Calque généré le ${formatAnnotationDate(annotation.generatedAt)}`,
        annotation?.objectCount !== undefined && `${annotation.objectCount} objet(s) annoté(s)`,
        annotation?.wcsSource && `Astrométrie : ${WCS_LABELS[annotation.wcsSource]}`,
        annotationRun && `Dernier passage : ${describeAnnotationRun(annotationRun)}`,
        annotationRunCount && annotationRunCount > 1 && `${annotationRunCount} passages enregistrés`,
        annotationPath,
    ]
        .filter(Boolean)
        .join('\n');

    return (
        <div className="flex min-w-[110px] flex-col items-start gap-0.5" title={details}>
            <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium whitespace-nowrap ${
                    kind ? KIND_CLASSES[kind] : 'border-red-500/20 bg-red-500/10 text-red-400'
                }`}
            >
                {kind ? KIND_SHORT_LABELS[kind] : 'Absente'}
            </span>
            {annotation?.updatedAt && (
                <span className="font-mono text-[10px] whitespace-nowrap text-mp-text-muted">
                    {formatAnnotationDate(annotation.updatedAt)}
                    {annotation.objectCount !== undefined ? ` · ${annotation.objectCount} obj.` : ''}
                </span>
            )}
            {runFailed && annotationRun && (
                <span className="inline-flex items-center gap-1 text-[10px] text-red-400">
                    <AlertCircle className="h-3 w-3 shrink-0" aria-hidden="true" />
                    {annotationRun.status === 'failed' ? 'Échec' : 'Ignorée'} le{' '}
                    {formatAnnotationDate(annotationRun.at).slice(0, 5)}
                </span>
            )}
        </div>
    );
}
