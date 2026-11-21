/**
 * Carte statistique des tableaux de bord des éditeurs de contenu (blog, voyages) :
 * valeur, total optionnel et barre de complétude colorée.
 */
import type { ComponentType } from 'react';

export interface StatCardProps {
    label: string;
    value: number;
    total?: number;
    icon: ComponentType<{ className?: string }>;
    showProgress?: boolean;
    accentColor?: 'accent' | 'emerald';
}

/**
 * Affiche une carte statistique individuelle.
 *
 * POURQUOI : standardise l'apparence des indicateurs clés, avec une barre de complétude
 * orange tant que la valeur n'atteint pas le total.
 *
 * @param props.label - Libellé de l'indicateur.
 * @param props.value - Valeur affichée.
 * @param props.total - Total de référence (affiche « / total » et alimente la complétude).
 * @param props.icon - Icône affichée en haut à droite.
 * @param props.showProgress - Affiche la barre de complétude (nécessite `total`).
 * @param props.accentColor - Couleur de la barre quand la complétude est atteinte.
 * @returns La carte rendue.
 */
export default function StatCard({
    label,
    value,
    total,
    icon: Icon,
    showProgress = false,
    accentColor = 'accent',
}: StatCardProps) {
    const percentage = total && total > 0 ? Math.round((value / total) * 100) : 0;

    // POURQUOI : Applique des couleurs de barre de complétude dynamiques et haut de gamme.
    let barBgClass = 'bg-mp-accent';
    let percentColorClass = 'text-mp-accent font-semibold';

    if (total && value < total) {
        barBgClass = 'bg-orange-500';
        percentColorClass = 'text-orange-400 font-semibold';
    } else if (accentColor === 'emerald') {
        barBgClass = 'bg-emerald-400';
        percentColorClass = 'text-emerald-400 font-semibold';
    }

    return (
        <div className="flex flex-col rounded-xl border border-mp-glass-border bg-mp-glass-solid/40 p-4 text-left shadow-xs transition-all duration-200">
            <div className="flex w-full items-center justify-between gap-2">
                <span className="truncate font-mono text-[10px] tracking-wider text-mp-text-muted uppercase">
                    {label}
                </span>
                <Icon className="h-4 w-4 shrink-0 text-mp-text-muted" />
            </div>

            <div className="mt-2 flex items-baseline gap-1.5">
                <span className="font-serif text-2xl font-bold text-mp-text-heading">{value}</span>
                {total !== undefined && <span className="text-[10px] text-mp-text-muted">/ {total}</span>}
            </div>

            {showProgress && total !== undefined && (
                <>
                    <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-mp-ui-black/60">
                        <div
                            className={`h-full transition-all duration-500 ${barBgClass}`}
                            style={{ width: `${percentage}%` }}
                        />
                    </div>

                    <div className="mt-1 flex w-full items-center justify-between text-[10px] text-mp-text-muted">
                        <span>Complétude</span>
                        <span className={percentColorClass}>{percentage}%</span>
                    </div>
                </>
            )}
        </div>
    );
}
