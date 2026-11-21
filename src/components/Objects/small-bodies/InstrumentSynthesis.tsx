/**
 * Contenu de la modale « Bilan d'observabilité de votre équipement » des petits corps
 *
 * Responsabilité : afficher l'ouverture, les magnitudes limites visuelle et photographique,
 * l'échantillonnage de la caméra et la méthode de calcul propre au visualiseur.
 */

import type { CameraSettings } from '@/lib/settings/userSettings';
import type { InstrumentLimits } from './hooks';

interface InstrumentSynthesisProps extends InstrumentLimits {
    camera: CameraSettings;
    /** Titre du bloc décrivant la méthode de calcul. */
    methodTitle: string;
    /** Description de la méthode de calcul. */
    methodDescription: string;
}

/**
 * Synthèse des capacités de l'instrument.
 *
 * @param props - Limites de l'instrument, réglages caméra et texte de méthode.
 * @returns Le contenu de la modale.
 */
export default function InstrumentSynthesis({
    aperture,
    limitMag,
    limitMagPhoto,
    camera,
    methodTitle,
    methodDescription,
}: InstrumentSynthesisProps) {
    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 text-mp-text-body sm:grid-cols-3">
                <div className="space-y-1 rounded-xl border border-mp-glass-border bg-mp-glass-bg p-3.5">
                    <span className="block text-xs text-mp-text-muted">Diamètre résolu (D)</span>
                    <span className="font-mono text-base font-semibold text-mp-accent">{aperture} mm</span>
                </div>
                <div className="space-y-1 rounded-xl border border-mp-glass-border bg-mp-glass-bg p-3.5">
                    <span className="block text-xs text-mp-text-muted">Magnitude limite visuelle</span>
                    <span className="font-mono text-base font-semibold text-mp-accent">{limitMag.toFixed(1)} V</span>
                    <span className="block text-xs text-mp-text-muted">V = 9 + 5 × log₁₀(D / 10)</span>
                </div>
                <div className="space-y-1 rounded-xl border border-mp-glass-border bg-mp-glass-bg p-3.5">
                    <span className="block text-xs text-mp-text-muted">Magnitude limite photo</span>
                    <span className="font-mono text-base font-semibold text-mp-accent">
                        {limitMagPhoto.toFixed(1)} V
                    </span>
                    <span className="block text-xs text-mp-text-muted">
                        θ ={' '}
                        {(
                            (206.265 * camera.pixelSizeUm) /
                            (camera.focalLengthMm * (camera.focalMultiplier ?? 1))
                        ).toFixed(2)}
                        " / px
                    </span>
                </div>
            </div>
            <div className="space-y-1 rounded-xl border border-mp-glass-border bg-mp-glass-bg p-3.5">
                <span className="block text-xs text-mp-text-muted">{methodTitle}</span>
                <p className="mt-1 text-xs leading-relaxed text-mp-text-muted">{methodDescription}</p>
            </div>
        </div>
    );
}
