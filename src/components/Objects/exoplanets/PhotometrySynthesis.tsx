/**
 * Contenu de la modale « Synthèse » du planificateur de transits
 *
 * Responsabilité : résumer l'instrument estimé, le seuil de détection 3σ pour une étoile de
 * magnitude 11 et le modèle photométrique utilisé.
 */

import { computeSetupNoise } from '@/lib/objects/exoplanets';

/**
 * Synthèse de la configuration photométrique.
 *
 * @param props - `aperture` : diamètre de l'instrument en mm.
 * @returns Les cartes de synthèse.
 */
export default function PhotometrySynthesis({ aperture }: { aperture: number }) {
    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 text-mp-text-body sm:grid-cols-2">
                <div className="space-y-1 rounded-xl border border-mp-glass-border bg-mp-glass-bg p-3.5">
                    <span className="block text-xs text-mp-text-muted">Instrument estimé</span>
                    <span className="font-mono text-base font-semibold text-mp-accent">{aperture} mm</span>
                    <span className="block text-xs text-mp-text-muted">
                        (basé sur la focale ou le télescope choisi)
                    </span>
                </div>
                <div className="space-y-1 rounded-xl border border-mp-glass-border bg-mp-glass-bg p-3.5">
                    <span className="block text-xs text-mp-text-muted">Seuil de détection (3σ)</span>
                    <span className="font-mono text-base font-semibold text-mp-accent">
                        {(computeSetupNoise(11, aperture) * 3).toFixed(1)} mmag
                    </span>
                    <span className="block text-xs text-mp-text-muted">(pour une étoile standard de mag 11.0)</span>
                </div>
            </div>
            <div className="space-y-1 rounded-xl border border-mp-glass-border bg-mp-glass-bg p-3.5">
                <span className="block text-xs text-mp-text-muted">Précision visée & modèle photométrique</span>
                <span className="block font-mono font-medium text-mp-accent">Photométrie différentielle</span>
                <p className="mt-1 text-xs leading-relaxed text-mp-text-muted">
                    Intègre le bruit de scintillation atmosphérique de Young (1974), le bruit de fond de ciel local et
                    le bruit de lecture de la caméra. Les prédictions de transit utilisent les éphémérides de la NASA
                    Exoplanet Archive.
                </p>
            </div>
        </div>
    );
}
