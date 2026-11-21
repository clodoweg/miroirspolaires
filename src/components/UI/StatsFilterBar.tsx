import React, { useState, useMemo } from 'react';
import FilterBarUI, { useFilterSuggestions, type Suggestion } from '../Filters/FilterBarUI';
import type { Photo } from '@/lib/photos';
import { normalizeCatalog } from '@/utils/normalize';
import type { FilterConfig } from '@/types/filters';

interface Props {
    filters: FilterConfig[];
    photos: Photo[];
    onFilteredPhotosChange: (filteredPhotos: Photo[]) => void;
    /** Returns true on successful resolution; the search term is then cleared. */
    onSearchSubmit?: (term: string) => Promise<boolean> | boolean;
    /** Élément facultatif affiché à droite du champ de recherche */
    rightContent?: React.ReactNode;
}

export default function StatsFilterBar({
    filters,
    photos,
    onFilteredPhotosChange,
    onSearchSubmit,
    rightContent,
}: Props) {
    const [isOpen, setIsOpen] = useState(false);

    // Initialize state from URL, falling back to filter `defaultValue` when the
    // URL doesn't carry an explicit value for that key.
    const [activeFilters, setActiveFilters] = useState<Record<string, string>>(() => {
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            const initial: Record<string, string> = {};
            filters.forEach((f) => {
                const val = params.get(f.key);
                if (val) initial[f.key] = val;
                else if (f.defaultValue) initial[f.key] = f.defaultValue;
            });
            return initial;
        }
        return {};
    });

    const [searchTerm, setSearchTerm] = useState(() => {
        if (typeof window !== 'undefined') {
            return new URLSearchParams(window.location.search).get('search') || '';
        }
        return '';
    });

    const { suggestions, setSuggestions, generateSuggestions, clearSuggestions } = useFilterSuggestions(filters);

    // Apply filters and search
    const filteredPhotos = useMemo(() => {
        let result = photos;

        // Apply search
        if (searchTerm) {
            const term = normalizeCatalog(searchTerm.toLowerCase());
            result = result.filter((p) => {
                const normalize = (s?: string) => (s ? normalizeCatalog(s.toLowerCase()) : '');
                return (
                    normalize(p.title).includes(term) ||
                    normalize(p.constellation).includes(term) ||
                    normalize(p.type).includes(term) ||
                    normalize(p.telescope).includes(term) ||
                    normalize(p.camera).includes(term) ||
                    normalize(p.mount).includes(term) ||
                    normalize(p.locations).includes(term) ||
                    normalize(p.filterString).includes(term)
                );
            });
        }

        // Apply filters
        for (const [key, value] of Object.entries(activeFilters)) {
            if (!value) continue;
            const filterDef = filters.find((f) => f.key === key);
            if (filterDef?.type === 'numericMax') {
                const threshold = Number(value);
                if (!Number.isFinite(threshold)) continue;
                result = result.filter((p) => {
                    const photoValue = (p as any)[key];
                    return typeof photoValue === 'number' && photoValue <= threshold;
                });
                continue;
            }
            result = result.filter((p) => {
                const photoValue = (p as any)[key];
                if (Array.isArray(photoValue)) {
                    return photoValue.includes(value);
                }
                return String(photoValue) === value;
            });
        }

        return result;
    }, [photos, activeFilters, searchTerm]);

    // Update parent when filtered photos change
    React.useEffect(() => {
        onFilteredPhotosChange(filteredPhotos);
    }, [filteredPhotos, onFilteredPhotosChange]);

    // Sync state to URL
    React.useEffect(() => {
        if (typeof window === 'undefined') return;

        const params = new URLSearchParams(window.location.search);

        if (searchTerm) {
            params.set('search', searchTerm);
        } else {
            params.delete('search');
        }

        filters.forEach((f) => params.delete(f.key));
        Object.entries(activeFilters).forEach(([key, value]) => {
            if (value) params.set(key, value);
        });

        const queryString = params.toString();
        const newUrl = queryString ? `?${queryString}` : window.location.pathname;

        if (window.location.search !== `?${queryString}`) {
            window.history.replaceState({}, '', newUrl);
        }
    }, [activeFilters, searchTerm, filters]);

    const updateFilter = (key: string, value: string) => {
        setActiveFilters((prev) => {
            const next = { ...prev };
            if (value) {
                next[key] = value;
            } else {
                delete next[key];
            }
            return next;
        });
    };

    const handleSearchChange = (term: string) => {
        setSearchTerm(term);
        setSuggestions(generateSuggestions(term));
        // Auto-applying a filter when the typed term happens to match an option
        // exactly (e.g. "NGC") used to clobber further typing ("NGC100"). Now we
        // only apply filters through the suggestions dropdown — the user picks
        // explicitly. Plain text in the search box keeps full-text matching.
    };

    const handleSuggestionSelect = (suggestion: Suggestion) => {
        updateFilter(suggestion.key, suggestion.value);
        setSearchTerm('');
        clearSuggestions();
    };

    const resetFilters = () => {
        setActiveFilters({});
        setSearchTerm('');
        clearSuggestions();
    };

    const handleSearchSubmitWrapped = async (term: string) => {
        if (!onSearchSubmit) return;
        await onSearchSubmit(term);
        // Keep the term in the input: parent components may rely on the search
        // filter to keep the map focused on a single object. Clearing here would
        // bring back the whole catalogue and drown the injected resolved marker.
        clearSuggestions();
    };

    return (
        <FilterBarUI
            filters={filters}
            activeFilters={activeFilters}
            searchTerm={searchTerm}
            suggestions={suggestions}
            isOpen={isOpen}
            onToggle={() => setIsOpen(!isOpen)}
            onFilterChange={updateFilter}
            onSearchChange={handleSearchChange}
            onSearchSubmit={onSearchSubmit ? handleSearchSubmitWrapped : undefined}
            onSuggestionSelect={handleSuggestionSelect}
            onSuggestionsClear={clearSuggestions}
            onReset={resetFilters}
            searchPlaceholder="Rechercher (ex: Orion, Nébuleuse...)"
            rightContent={rightContent}
        />
    );
}
