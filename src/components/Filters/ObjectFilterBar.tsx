import React, { type ReactNode } from 'react';
import { Settings, SlidersHorizontal, Sparkles } from 'lucide-react';
import ObjectSearchInput from './ObjectSearchInput';

export interface ActiveFilterChip {
    key: string;
    label: string;
    value: string | number;
}

interface ObjectFilterBarProps {
    /** Le terme de recherche actuel */
    query: string;
    /** Callback appelé lors du changement de texte de recherche */
    onQueryChange: (val: string) => void;
    /** Placeholder personnalisé pour le champ de recherche */
    searchPlaceholder?: string;
    /** Indique si une requête de données est en cours (affiche un spinner dans la barre de recherche) */
    isLoading?: boolean;
    /** Indique si le panneau de filtres avancés est déployé */
    showAdvanced?: boolean;
    /** Callback pour intervertir l'affichage du panneau avancé */
    onToggleAdvanced?: () => void;
    /** Liste des filtres avancés actuellement actifs (pour afficher les badges/chips) */
    activeFilters?: ActiveFilterChip[];
    /** Callback appelé pour supprimer un filtre individuel via sa chip */
    onClearFilter?: (key: string) => void;
    /** Callback de réinitialisation complète des filtres */
    onReset?: () => void;
    /** Contenu de la grille de filtres avancés */
    children?: ReactNode;

    /** Callback d'ouverture de la modale des paramètres d'observation (lieu, matériel, date) */
    onOpenSettings?: () => void;
    /** Indique si des paramètres d'observation personnalisés sont actifs */
    isSettingsCustom?: boolean;

    /** Callback d'ouverture de la modale de synthèse d'observabilité */
    onOpenSynth?: () => void;
    /** Titre personnalisé pour le bouton de synthèse (par défaut: "Synthèse") */
    synthTitle?: string;

    /** Suggestions de recherche pré-calculées ou passées par le parent */
    suggestions?: { value: string; label?: string }[];
    /** Callback appelé à chaque modification de la saisie (pour charger des suggestions asynchrones) */
    onSearchInputChange?: (val: string) => void;
    /** Éléments de contrôle optionnels affichés tout à droite de la barre principale (ex: sélecteur de mode d'affichage) */
    rightControls?: ReactNode;
}

/**
 * ObjectFilterBar
 *
 * Barre de recherche et de filtrage unifiée pour tous les viewers d'objets célestes.
 * Implémente le design des barres d'outils avec support de la recherche synchrone/asynchrone,
 * des raccourcis d'observabilité et du panneau de filtres avancés.
 */
export default function ObjectFilterBar({
    query,
    onQueryChange,
    searchPlaceholder = 'Rechercher...',
    isLoading = false,
    showAdvanced = false,
    onToggleAdvanced,
    activeFilters = [],
    onClearFilter,
    onReset,
    children,
    onOpenSettings,
    isSettingsCustom,
    onOpenSynth,
    synthTitle = 'Synthèse',
    suggestions,
    onSearchInputChange,
    rightControls,
}: ObjectFilterBarProps) {
    const hasActiveFilters = activeFilters.length > 0;

    return (
        <div className="relative space-y-4 mb-6 w-full bg-transparent transition-all duration-300">
            {/* Ligne 1 : Barre de recherche (prend toute la largeur en mobile) + Boutons sur la même ligne en-dessous (ou alignés à droite/gauche sur desktop) */}
            <div className="flex w-full flex-col items-stretch gap-3 sm:flex-row sm:items-center">
                {/* Champ de recherche (sur mobile: prend toute la largeur 100%) */}
                <div className="relative w-full sm:order-2 sm:min-w-0 sm:flex-1">
                    <ObjectSearchInput
                        query={query}
                        onQueryChange={onQueryChange}
                        suggestions={suggestions}
                        searchPlaceholder={searchPlaceholder}
                        isLoading={isLoading}
                        onSearchInputChange={onSearchInputChange}
                        inputClassName="w-full pl-4 pr-16 py-2.5 text-sm focus:outline-hidden transition-colors rounded-lg bg-mp-bg border border-mp-border-light text-mp-text-heading focus:border-mp-accent focus:ring-1 focus:ring-mp-accent placeholder:text-mp-text-muted/40"
                    />
                </div>

                {/* Conteneur des boutons */}
                <div className="flex w-full shrink-0 flex-row items-center gap-2 sm:contents sm:w-auto">
                    {/* Bouton de bascule Filtres avancés */}
                    {onToggleAdvanced && (
                        <button
                            type="button"
                            onClick={onToggleAdvanced}
                            className={`flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg border border-mp-accent px-3 py-2.5 text-xs font-medium transition-all sm:order-1 sm:px-4 sm:text-sm ${
                                showAdvanced
                                    ? 'bg-mp-text-heading text-mp-bg'
                                    : 'bg-transparent text-mp-text-body hover:bg-white/5'
                            }`}
                        >
                            <SlidersHorizontal className="h-4 w-4 text-mp-accent" />
                            <span>Filtres</span>
                            {hasActiveFilters && (
                                <span
                                    className={`ml-0.5 rounded-full px-1.5 py-0.5 text-xs ${
                                        showAdvanced
                                            ? 'bg-mp-bg font-semibold text-mp-text-heading'
                                            : 'bg-mp-accent font-semibold text-mp-bg'
                                    }`}
                                >
                                    {activeFilters.length}
                                </span>
                            )}
                        </button>
                    )}

                    {/* Bouton Synthèse / Observabilité */}
                    {onOpenSynth && (
                        <button
                            type="button"
                            onClick={onOpenSynth}
                            className="flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg border border-mp-border-light bg-mp-bg px-3 py-2.5 text-xs font-medium text-mp-text-body transition-all hover:border-mp-accent hover:text-mp-accent sm:order-3 sm:text-sm"
                            title="Synthèse d'observabilité & configuration"
                        >
                            <Sparkles className="h-4 w-4 text-mp-accent" />
                            <span>{synthTitle}</span>
                        </button>
                    )}

                    {/* Bouton Paramètres d'observation */}
                    {onOpenSettings && (
                        <button
                            type="button"
                            onClick={onOpenSettings}
                            className="flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg border border-mp-border-light bg-mp-bg px-3 py-2.5 text-xs font-medium text-mp-text-body transition-all hover:border-mp-accent hover:text-mp-accent sm:order-3 sm:text-sm"
                            title="Paramètres d'observation (Lieu, Matériel, Date)"
                        >
                            <Settings className="h-4 w-4 text-mp-accent" />
                            <span>Paramètres</span>
                            {isSettingsCustom && <span className="h-2 w-2 rounded-full bg-mp-accent" />}
                        </button>
                    )}

                    {/* Éléments supplémentaires à droite (ex: bascule vignettes/tableau) */}
                    {rightControls && <div className="shrink-0 sm:order-4">{rightControls}</div>}
                </div>
            </div>

            {/* Chips de filtres actifs (visible sur desktop) */}
            {hasActiveFilters && onClearFilter && (
                <div className="hidden max-w-full flex-none flex-wrap gap-2 pb-3 md:flex">
                    {activeFilters.map((f) => (
                        <button
                            key={f.key}
                            type="button"
                            onClick={() => onClearFilter(f.key)}
                            className="group/chip flex cursor-pointer items-center gap-1.5 rounded-full border border-mp-border-light bg-mp-glass-bg px-3 py-1.5 text-xs whitespace-nowrap text-mp-text-muted transition-colors hover:border-mp-accent/50"
                        >
                            <span className="text-mp-text-muted/70 group-hover/chip:text-mp-accent">{f.label} :</span>
                            <span className="font-medium text-mp-text-heading group-hover/chip:text-mp-accent">
                                {f.value}
                            </span>
                            <span className="ml-1 hover:text-red-400">×</span>
                        </button>
                    ))}
                </div>
            )}

            {/* Panneau de filtres avancés */}
            {showAdvanced && children && (
                <div className="animate-in fade-in slide-in-from-top-2 mt-2 grid grid-cols-1 gap-4 pb-4 duration-200 sm:grid-cols-2 md:grid-cols-5">
                    {children}

                    {/* Bouton de réinitialisation générale */}
                    {onReset && (
                        <div className="flex items-end">
                            <button
                                type="button"
                                onClick={onReset}
                                className="w-full cursor-pointer rounded-lg border border-mp-accent bg-transparent px-3 py-2.5 text-sm font-medium text-mp-text-body transition-colors hover:opacity-90"
                            >
                                Réinitialiser tout
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
