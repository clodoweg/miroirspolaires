import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Search } from 'lucide-react';
import { NO_AUTOFILL_PROPS } from '@/utils/constants';
import { foldAccents } from '@/utils/normalize';

interface ObjectSearchInputProps {
    /** Le terme de recherche actuel (prop contrôlée) */
    query: string;
    /** Callback de validation de la recherche (déclenché sur clic suggestion, Enter, clic loupe ou clear) */
    onQueryChange: (val: string) => void;
    /** Suggestions d'autocomplétion [{ value, label }] */
    suggestions?: { value: string; label?: string }[];
    /** Placeholder du champ */
    searchPlaceholder?: string;
    /** Affiche une ligne de chargement animée sous l'input */
    isLoading?: boolean;
    /** Callback appelé à chaque frappe de touche (pour l'autocomplétion dynamique) */
    onSearchInputChange?: (val: string) => void;
    /** Classe CSS personnalisée pour l'élément input */
    inputClassName?: string;
}

export default function ObjectSearchInput({
    query,
    onQueryChange,
    suggestions = [],
    searchPlaceholder = 'Rechercher...',
    isLoading = false,
    onSearchInputChange,
    inputClassName = 'w-full pl-4 pr-16 py-2.5 text-sm focus:outline-hidden transition-colors rounded-lg bg-mp-bg border border-mp-border-light text-mp-text-heading focus:border-mp-accent focus:ring-1 focus:ring-mp-accent placeholder:text-mp-text-muted/40',
}: ObjectSearchInputProps) {
    const [localQuery, setLocalQuery] = useState(query);
    const [isOpenSuggestions, setIsOpenSuggestions] = useState(false);
    const [focusedIndex, setFocusedIndex] = useState(-1);
    const containerRef = useRef<HTMLDivElement>(null);

    // Synchronisation de l'état local avec la query globale (ex: reset externe)
    useEffect(() => {
        setLocalQuery(query);
    }, [query]);

    // Fermeture du menu de suggestions au clic extérieur
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpenSuggestions(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Filtrer les suggestions localement si on n'a pas de fetch dynamique géré par le parent
    const filteredSuggestions = useMemo(() => {
        if (!suggestions) return [];

        if (onSearchInputChange) {
            return suggestions.slice(0, 8);
        }

        if (!localQuery.trim()) return [];
        const cleanString = (str: string) => foldAccents(str).trim();
        const cleanQuery = cleanString(localQuery);
        if (!cleanQuery) return [];

        const matches = suggestions.filter((s) => cleanString(s.value).includes(cleanQuery));
        return matches.slice(0, 8);
    }, [suggestions, localQuery, onSearchInputChange]);

    const handleSearchSubmit = useCallback(() => {
        onQueryChange(localQuery);
        setIsOpenSuggestions(false);
        setFocusedIndex(-1);
    }, [localQuery, onQueryChange]);

    const handleSuggestionClick = useCallback(
        (val: string) => {
            setLocalQuery(val);
            onQueryChange(val);
            setIsOpenSuggestions(false);
            setFocusedIndex(-1);
        },
        [onQueryChange],
    );

    const handleClear = useCallback(() => {
        setLocalQuery('');
        onQueryChange('');
        setIsOpenSuggestions(false);
        setFocusedIndex(-1);
    }, [onQueryChange]);

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!isOpenSuggestions || filteredSuggestions.length === 0) {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleSearchSubmit();
            }
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setFocusedIndex((prev) => (prev + 1) % filteredSuggestions.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setFocusedIndex((prev) => (prev - 1 + filteredSuggestions.length) % filteredSuggestions.length);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (focusedIndex >= 0 && focusedIndex < filteredSuggestions.length) {
                handleSuggestionClick(filteredSuggestions[focusedIndex].value);
            } else {
                handleSearchSubmit();
            }
        } else if (e.key === 'Escape') {
            setIsOpenSuggestions(false);
            e.currentTarget.blur();
        }
    };

    return (
        <div ref={containerRef} className="relative w-full">
            <input
                type="text"
                {...NO_AUTOFILL_PROPS}
                value={localQuery}
                onChange={(e) => {
                    setLocalQuery(e.target.value);
                    setIsOpenSuggestions(true);
                    setFocusedIndex(-1);
                    onSearchInputChange?.(e.target.value);
                }}
                onFocus={() => setIsOpenSuggestions(true)}
                onKeyDown={onKeyDown}
                placeholder={searchPlaceholder}
                className={inputClassName}
            />
            {/* Conteneur de boutons d'action à droite (effacer + loupe de recherche) */}
            <div className="absolute top-1/2 right-2 z-10 flex -translate-y-1/2 items-center gap-1">
                {localQuery && (
                    <button
                        type="button"
                        onClick={handleClear}
                        className="cursor-pointer p-1 text-sm font-semibold text-mp-text-muted transition-colors hover:text-mp-text-primary"
                        title="Effacer la recherche"
                    >
                        ×
                    </button>
                )}
                <button
                    type="button"
                    onClick={handleSearchSubmit}
                    className="flex cursor-pointer items-center justify-center rounded-md p-1.5 text-mp-accent transition-all hover:bg-mp-accent/20 active:scale-95"
                    title="Lancer la recherche"
                    aria-label="Lancer la recherche"
                >
                    <Search className="h-4 w-4 text-mp-accent" />
                </button>
            </div>

            {/* Autocomplete Dropdown */}
            {isOpenSuggestions && filteredSuggestions.length > 0 && (
                <div className="absolute top-full right-0 left-0 z-popover mt-1 max-h-60 overflow-y-auto rounded-sm border border-mp-border-light bg-mp-bg-secondary shadow-lg">
                    {filteredSuggestions.map((suggestion, index) => {
                        const isFocused = index === focusedIndex;
                        return (
                            <button
                                key={`${suggestion.value}-${index}`}
                                type="button"
                                className={`group flex w-full cursor-pointer items-center justify-between px-4 py-2 text-left text-sm text-mp-text-body transition-colors ${isFocused ? 'bg-mp-accent font-medium text-mp-bg' : 'hover:bg-mp-accent-hover'}`}
                                onClick={() => handleSuggestionClick(suggestion.value)}
                            >
                                <span className={`font-medium ${isFocused ? 'text-mp-bg' : 'text-mp-text-heading'}`}>
                                    {suggestion.value}
                                </span>
                                {suggestion.label && (
                                    <span
                                        className={`rounded-sm px-1.5 py-0.5 text-xs ${isFocused ? 'bg-mp-bg/20 text-mp-bg' : 'bg-mp-accent-light text-mp-accent'}`}
                                    >
                                        {suggestion.label}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Ligne de chargement discrète */}
            {isLoading && (
                <div className="absolute right-0 bottom-0 left-0 h-[2px] overflow-hidden rounded-b-lg">
                    <div
                        className="h-full w-1/3 bg-linear-to-r/srgb from-transparent via-mp-accent to-transparent"
                        style={{ animation: 'searchBarShimmer 1.2s ease-in-out infinite' }}
                    />
                </div>
            )}
        </div>
    );
}
