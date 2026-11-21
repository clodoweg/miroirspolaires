import React, { useState, type ReactNode } from 'react';
import CustomSelect from '../UI/CustomSelect';
import type { FilterConfig } from '@/types/filters';
import ObjectFilterBar, { type ActiveFilterChip } from './ObjectFilterBar';

export interface FilterChip {
    key: string;
    label: string;
    value: string | null | undefined;
}

export interface Suggestion {
    key: string;
    label: string;
    value: string;
}

interface FilterBarUIProps {
    /** Filter configuration */
    filters: FilterConfig[];
    /** Active filter values */
    activeFilters: Record<string, string>;
    /** Search term value */
    searchTerm: string;
    /** Suggestions for autocomplete */
    suggestions: Suggestion[];
    /** Whether the filter panel is open */
    isOpen: boolean;
    /** Toggle panel open/close */
    onToggle: () => void;
    /** Update a filter value */
    onFilterChange: (key: string, value: string) => void;
    /** Update search term */
    onSearchChange: (term: string) => void;
    /** Fired when the user submits the search (Enter key). Lets parents resolve
     *  the typed identifier against an external API and centre the view. */
    onSearchSubmit?: (term: string) => void;
    /** Select a suggestion */
    onSuggestionSelect: (suggestion: Suggestion) => void;
    /** Clear suggestions */
    onSuggestionsClear: () => void;
    /** Reset all filters */
    onReset: () => void;
    /** Search placeholder */
    searchPlaceholder?: string;
    /** Optional right-side content (e.g., results count) */
    rightContent?: ReactNode;
    /** Container className */
    className?: string;
    /** Whether to show the container padding */
    showContainerPadding?: boolean;
}

/**
 * Shared Filter Bar UI component.
 * Handles the visual presentation while parent components handle the filtering logic.
 */
export default function FilterBarUI({
    filters,
    activeFilters,
    searchTerm,
    suggestions,
    isOpen,
    onToggle,
    onFilterChange,
    onSearchChange,
    onSearchSubmit,
    onReset,
    searchPlaceholder = 'Rechercher...',
    rightContent,
    className = '',
    showContainerPadding = true,
}: FilterBarUIProps) {
    const activeFilterChips: ActiveFilterChip[] = filters
        .map((f) => ({ key: f.key, label: f.label, value: activeFilters[f.key] }))
        .filter((f) => Boolean(f.value));

    const formattedSuggestions = suggestions.map((s) => ({
        value: s.value,
        label: s.label,
    }));

    return (
        <div className={`w-full ${className} ${showContainerPadding ? 'py-1' : ''}`}>
            <ObjectFilterBar
                query={searchTerm}
                onQueryChange={(val) => {
                    onSearchChange(val);
                    if (onSearchSubmit && val) {
                        onSearchSubmit(val);
                    }
                }}
                onSearchInputChange={onSearchChange}
                searchPlaceholder={searchPlaceholder}
                showAdvanced={isOpen}
                onToggleAdvanced={onToggle}
                activeFilters={activeFilterChips}
                onClearFilter={(key) => onFilterChange(key, '')}
                onReset={onReset}
                rightControls={rightContent}
                suggestions={formattedSuggestions}
            >
                {filters.map((f) => (
                    <div key={f.key}>
                        <CustomSelect
                            label={f.label}
                            value={activeFilters[f.key] || ''}
                            onChange={(val: string) => onFilterChange(f.key, val)}
                            options={f.options}
                        />
                    </div>
                ))}
            </ObjectFilterBar>
        </div>
    );
}

/**
 * Hook for filter suggestion logic - shared between both filter bar implementations
 */
export function useFilterSuggestions(filters: FilterConfig[]) {
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

    const generateSuggestions = (term: string): Suggestion[] => {
        if (term.length === 0) return [];

        const lowerTerm = term.toLowerCase();
        const newSuggestions: Suggestion[] = [];

        filters.forEach((filter) => {
            filter.options.forEach((opt) => {
                if (String(opt).toLowerCase().includes(lowerTerm)) {
                    newSuggestions.push({
                        key: filter.key,
                        label: filter.label,
                        value: String(opt),
                    });
                }
            });
        });

        return newSuggestions.slice(0, 8);
    };

    const findExactMatch = (term: string): { filter: FilterConfig; match: string } | null => {
        if (term.length <= 2) return null;

        const lowerTerm = term.toLowerCase();

        for (const filter of filters) {
            const match = filter.options.find((opt) => String(opt).toLowerCase() === lowerTerm);
            if (match) {
                return { filter, match: String(match) };
            }
        }

        return null;
    };

    return {
        suggestions,
        setSuggestions,
        generateSuggestions,
        findExactMatch,
        clearSuggestions: () => setSuggestions([]),
    };
}
