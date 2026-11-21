/**
 * @file src/components/Objects/AstronomicalLoader.tsx
 * @description Composant centralisé de chargement et de recherche cosmique pour les outils d'observation (Exoplanètes, Astéroïdes, Comètes, Étoiles Variables).
 *
 * RESPONSABILITÉ PRINCIPALE :
 * Fournir une expérience visuelle harmonisée et immersive pendant les phases de chargement de données,
 * de recalcul d'éphémérides et d'exécution de filtres de recherche.
 *
 * UTILISATION ET EXEMPLES :
 * ```tsx
 * // Exemple 1 : Chargement simple avec messages par défaut
 * <AstronomicalLoader />
 *
 * // Exemple 2 : Chargement spécifique avec titre et description
 * <AstronomicalLoader
 *     title="Calcul des éphémérides en cours"
 *     message="Évaluation de la visibilité locale et des transits pour ce soir..."
 * />
 *
 * // Exemple 3 : Recherche en cours avec sous-titre de requête
 * <AstronomicalLoader
 *     title="Recherche dans le catalogue d'astéroïdes"
 *     message="Filtrage des cibles géocroiseurs..."
 *     query="Apophis"
 * />
 * ```
 */

import React from 'react';
import { Sparkles } from 'lucide-react';

/**
 * Options et propriétés configurables du loader cosmique.
 */
export interface AstronomicalLoaderProps {
    /** Titre principal affiché sous le scanner radar (ex: "Téléchargement du catalogue") */
    title?: string;
    /** Message secondaire détaillant l'opération en cours (ex: "Calcul des hauteurs célestes...") */
    message?: string;
    /** Terme de recherche optionnel pour personnaliser l'affichage lors d'une requête */
    query?: string;
    /** Classes CSS additionnelles pour le conteneur englobant */
    className?: string;
}

/**
 * Composant de chargement d'astronomie (loader cosmique unifié).
 * Affiche une animation de radar/sonar stellaire avec flou d'arrière-plan glassmorphism.
 *
 * POURQUOI : Unifier la présentation visuelle lors des chargements et des recherches complexes
 * à travers toutes les vues d'objets (Exoplanètes, Astéroïdes, Comètes, Étoiles Variables).
 *
 * @param {AstronomicalLoaderProps} props Les propriétés de configuration du loader.
 * @returns {JSX.Element} Le composant React de chargement cosmique.
 */
export default function AstronomicalLoader({
    title = 'Calcul des éphémérides en cours',
    message = "Nous calculons les positions célestes, l'observabilité locale et les données de visibilité...",
    query,
    className = '',
}: AstronomicalLoaderProps): React.JSX.Element {
    return (
        <div
            className={`space-y-6 flex flex-col items-center justify-center rounded-2xl border border-mp-glass-border bg-mp-glass-bg px-6 py-16 text-center backdrop-blur-md ${className}`}
        >
            {/* Scanner radar & pulsations sonar */}
            <div className="relative flex h-24 w-24 items-center justify-center">
                {/* Anneaux sonar en expansion */}
                <div
                    className="absolute inset-0 animate-ping rounded-full border border-mp-accent/20"
                    style={{ animationDuration: '3s' }}
                />
                <div
                    className="absolute inset-2 animate-ping rounded-full border border-mp-accent/30"
                    style={{ animationDuration: '2s' }}
                />

                {/* Balayage rotatif SVG du radar */}
                <svg
                    className="absolute inset-0 h-full w-full animate-spin"
                    style={{ animationDuration: '4s' }}
                    viewBox="0 0 100 100"
                    aria-hidden="true"
                >
                    <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(212, 180, 131, 0.08)" strokeWidth="1" />
                    <line
                        x1="50"
                        y1="50"
                        x2="50"
                        y2="5"
                        stroke="url(#astronomicalScannerGrad)"
                        strokeWidth="2"
                        strokeLinecap="round"
                    />
                    <defs>
                        <linearGradient id="astronomicalScannerGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor="#D4B483" />
                            <stop offset="100%" stopColor="transparent" />
                        </linearGradient>
                    </defs>
                </svg>

                {/* Cœur d'étoile centrale pulsante */}
                <div className="relative flex h-8 w-8 animate-pulse items-center justify-center rounded-full bg-mp-accent shadow-[0_0_20px_#D4B483]">
                    <Sparkles className="h-4 w-4 text-mp-ui-black" />
                </div>
            </div>

            {/* Textes explicatifs */}
            <div className="space-y-2 max-w-md">
                <h3 className="font-serif text-base font-light tracking-wide text-mp-text-heading">{title}</h3>
                <p className="text-xs leading-relaxed text-mp-text-muted">{message}</p>
                {query && (
                    <div className="pt-2 font-mono text-xs text-mp-accent">
                        Recherche : <span className="underline">{query}</span>
                    </div>
                )}
            </div>
        </div>
    );
}
