/**
 * @file EquipmentSynthesis.tsx
 * @description Contenu de la modale « Bilan d'observabilité de votre équipement » des étoiles variables.
 *
 * Responsabilité : afficher le diamètre résolu, les magnitudes limites visuelle et photo,
 * l'échantillonnage de la caméra et la note de méthode.
 */

import type { CameraSettings } from '@/lib/settings/userSettings';

interface EquipmentSynthesisProps {
    aperture: number;
    limitMag: number;
    limitMagPhoto: number;
    camera: Pick<CameraSettings, 'pixelSizeUm' | 'focalLengthMm' | 'focalMultiplier'>;
}

/**
 * Synthèse de l'équipement et des magnitudes limites.
 *
 * @param props - Diamètre (mm), magnitudes limites et réglages caméra.
 * @returns Le contenu de la modale.
 */
export default function EquipmentSynthesis({ aperture, limitMag, limitMagPhoto, camera }: EquipmentSynthesisProps) {
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
                <span className="block text-xs text-mp-text-muted">Méthode de calcul & Marge de photométrie</span>
                <p className="mt-1 text-xs leading-relaxed text-mp-text-muted">
                    Les hauteurs et conditions d'observabilité locales sont recalculées dynamiquement d'après les
                    coordonnées de l'observateur. Une marge de sécurité de 1,0 magnitude est soustraite de la limite
                    photo pour garantir une détection robuste lors de travaux de photométrie différentielle.
                </p>
            </div>
        </div>
    );
}
