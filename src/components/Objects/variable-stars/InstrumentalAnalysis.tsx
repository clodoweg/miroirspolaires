/**
 * @file InstrumentalAnalysis.tsx
 * @description Encadré « Analyse instrumentale » du détail d'une étoile variable.
 *
 * Responsabilité : expliquer en clair la compatibilité instrumentale (diamètre, magnitudes
 * limites visuelle et photo) selon le verdict calculé par `evaluateSetupCompatibility`.
 */

import type { ReactNode } from 'react';
import type { AnalysedVariableStar } from '@/lib/objects/variable-stars';

interface InstrumentalAnalysisProps {
    star: AnalysedVariableStar;
    aperture: number;
    limitMag: number;
    limitMagPhoto: number;
}

/** Valeur mise en évidence dans le texte. */
function Highlight({ children }: { children: ReactNode }) {
    return <span className="font-semibold text-mp-accent">{children}</span>;
}

/** Pictogramme du verdict (✓, ⚠, ✗). */
function VerdictMark({ symbol }: { symbol: string }) {
    return <span className="mr-1.5 inline-block font-bold text-mp-accent">{symbol}</span>;
}

/**
 * Note d'analyse instrumentale.
 *
 * @param props - Étoile analysée, diamètre (mm) et magnitudes limites.
 * @returns L'encadré d'analyse.
 */
export default function InstrumentalAnalysis({
    star: s,
    aperture,
    limitMag,
    limitMagPhoto,
}: InstrumentalAnalysisProps) {
    return (
        <div className="space-y-2 rounded-lg border border-mp-glass-border bg-mp-ui-black/30 p-4 text-xs">
            <div className="font-medium tracking-wide text-mp-text-primary uppercase">Analyse instrumentale :</div>
            <p className="leading-relaxed text-mp-text-body">
                {s.comp.label === 'Entièrement observable' && (
                    <span>
                        <VerdictMark symbol="✓" />
                        Votre optique de <Highlight>{aperture} mm</Highlight> permet d'observer confortablement cette
                        étoile sur l'ensemble de son cycle de variabilité. En imagerie, elle reste toujours plus
                        brillante que votre magnitude limite photo de{' '}
                        <Highlight>{limitMagPhoto.toFixed(1)} V</Highlight>.
                    </span>
                )}
                {s.comp.label === 'Observable au maximum' && (
                    <span>
                        <VerdictMark symbol="✓" />
                        Au minimum d'éclat (mag <Highlight>{s.vMagMax.toFixed(1)}</Highlight>
                        ), cette cible s'approche ou dépasse votre seuil de détection visuel (mag{' '}
                        <Highlight>{limitMag.toFixed(1)}</Highlight>
                        ). Cependant, votre magnitude limite photo de{' '}
                        <Highlight>{limitMagPhoto.toFixed(1)} V</Highlight> garantit sa détection en imagerie sur
                        l'ensemble du cycle.
                    </span>
                )}
                {s.comp.label === 'Partiellement observable' && (
                    <span>
                        <VerdictMark symbol="⚠" />
                        Cette cible est accessible en imagerie lors de son maximum d'éclat (mag{' '}
                        <Highlight>{s.vMagMin.toFixed(1)}</Highlight>
                        ). En revanche, lors de son minimum (mag <Highlight>{s.vMagMax.toFixed(1)}</Highlight>
                        ), elle dépasse votre magnitude limite photo de{' '}
                        <Highlight>{limitMagPhoto.toFixed(1)} V</Highlight> et devient temporairement indétectable.
                    </span>
                )}
                {s.comp.label === 'Trop faible pour votre setup' && (
                    <span>
                        <VerdictMark symbol="✗" />
                        L'éclat de cette étoile (mag <Highlight>{s.vMagMin.toFixed(1)}</Highlight> à{' '}
                        <Highlight>{s.vMagMax.toFixed(1)}</Highlight>) dépasse les capacités de votre télescope. En
                        imagerie, elle reste hors de portée par rapport à votre limite photo de{' '}
                        <Highlight>{limitMagPhoto.toFixed(1)} V</Highlight>.
                    </span>
                )}
            </p>
        </div>
    );
}
