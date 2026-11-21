/**
 * Pastilles d'une ligne d'exoplanète
 *
 * Responsabilité : pastille de statut (confirmée / candidate TESS) et pastille de faisabilité,
 * rendues à l'identique dans les vues mobile et desktop de `ExoplanetRow`.
 */

import { feasibilityTooltip, type Feasibility } from '@/lib/objects/exoplanets';

/**
 * Pastille « Candidate TESS » ou « Confirmée ».
 *
 * @param props - `isCandidate` : candidate TESS (TOI) plutôt que planète confirmée.
 * @returns La pastille avec son info-bulle.
 */
export function DiscoveryStatusBadge({ isCandidate }: { isCandidate: boolean }) {
    if (isCandidate) {
        return (
            <span
                className="cursor-help rounded-sm border border-amber-500/40 bg-amber-500/15 px-1.5 py-0.5 font-sans text-[9px] font-medium tracking-wider text-amber-400 uppercase select-none"
                title="Candidate TESS (TOI) : Signal de transit détecté par le télescope spatial TESS, en cours de confirmation."
            >
                Candidate TESS
            </span>
        );
    }
    return (
        <span
            className="cursor-help rounded-sm border border-emerald-500/40 bg-emerald-500/15 px-1.5 py-0.5 font-sans text-[9px] font-medium tracking-wider text-emerald-400 uppercase select-none"
            title="Confirmée : Exoplanète dont la découverte et la réalité physique sont définitivement confirmées."
        >
            Confirmée
        </span>
    );
}

/**
 * Pastille de faisabilité de la nuit.
 *
 * @param props - Faisabilité calculée (libellé, classes, statut).
 * @returns La pastille avec son info-bulle explicative.
 */
export function FeasibilityBadge({ feasibility }: { feasibility: Feasibility }) {
    return (
        <span
            className={`inline-block cursor-help rounded-sm border px-2 py-0.5 text-[11px] ${feasibility.color}`}
            title={feasibilityTooltip(feasibility.status)}
        >
            {feasibility.label}
        </span>
    );
}
