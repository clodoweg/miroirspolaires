/**
 * États de la liste des petits corps : compteur de résultats, erreur de chargement, pagination
 *
 * Responsabilité : petits blocs d'interface identiques dans les visualiseurs de comètes et
 * d'astéroïdes.
 */

import { AlertTriangle } from 'lucide-react';

/**
 * Compteur « Affichage de N sur M. ».
 *
 * @param props - Nombre d'éléments affichés et nombre total après filtrage.
 * @returns La ligne de compteur.
 */
export function ResultCount({ displayed, total }: { displayed: number; total: number }) {
    return (
        <div className="font-sans text-sm text-mp-text-muted">
            Affichage de{' '}
            <span className="font-mono font-medium text-mp-text-primary">{displayed.toLocaleString('fr-FR')}</span> sur{' '}
            <span className="font-mono font-medium text-mp-text-primary">{total.toLocaleString('fr-FR')}</span>.
        </div>
    );
}

/**
 * Encadré d'erreur de chargement du catalogue.
 *
 * @param props - Message d'erreur affiché.
 * @returns L'encadré d'erreur.
 */
export function CatalogueError({ message }: { message: string }) {
    return (
        <div className="mx-auto space-y-4 flex max-w-lg flex-col items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/5 px-6 py-12 text-center">
            <AlertTriangle className="h-8 w-8 text-red-400" />
            <div className="space-y-1">
                <h3 className="font-serif text-base font-light tracking-wide text-red-400">Erreur de chargement</h3>
                <p className="text-xs leading-relaxed text-mp-text-muted">{message}</p>
            </div>
        </div>
    );
}

/**
 * Bouton « Charger N de plus », affiché tant qu'il reste des éléments masqués.
 *
 * @param props - Nombre d'éléments restants et callback de chargement.
 * @returns Le bouton centré.
 */
export function LoadMoreButton({ remaining, onLoadMore }: { remaining: number; onLoadMore: () => void }) {
    return (
        <div className="flex justify-center pt-6">
            <button
                type="button"
                onClick={onLoadMore}
                className="cursor-pointer rounded-full border-0 bg-mp-accent px-6 py-2.5 font-sans text-xs font-medium tracking-uppercase text-mp-ui-black uppercase transition-colors hover:bg-mp-accent/90 disabled:opacity-50"
            >
                Charger {Math.min(100, remaining)} de plus
            </button>
        </div>
    );
}
