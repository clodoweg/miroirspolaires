/**
 * Universal Filter Bar
 *
 * Full-featured filter bar component with URL-synced state, search suggestions,
 * smart filter matching, and DOM-level item visibility toggling.
 * Used on gallery and catalog pages to filter photos by year, type, etc.
 */
import { useState, useEffect } from 'react';
import FilterBarUI, { useFilterSuggestions, type Suggestion } from './FilterBarUI';
import GalleryViewToggle from '@/components/Gallery/GalleryViewToggle';
import { normalizeCatalog, normalizeForSearch } from '@/utils/normalize';
import type { FilterConfig, StatUpdateConfig } from '@/types/filters';

// Re-export types for backwards compatibility
export type { FilterConfig, StatUpdateConfig };

interface UniversalFilterBarProps {
    filters: FilterConfig[];
    searchPlaceholder?: string;
    totalCountId?: string;
    additionalCountIds?: string[];
    dataSelector?: string;
    extraStats?: StatUpdateConfig[];
    initialValues?: Record<string, string>;
    /** CSS selector for the gallery wrapper whose `data-view` should be
     *  controlled by an inline grid/list toggle on the filter bar. */
    viewToggleTarget?: string;
}

export default function UniversalFilterBar({
    filters,
    searchPlaceholder = '🔎 Rechercher...',
    totalCountId = 'results-count',
    additionalCountIds = [],
    dataSelector = '[data-year]',
    extraStats = [],
    initialValues = {},
    viewToggleTarget,
}: UniversalFilterBarProps) {
    const [params, setParams] = useState<URLSearchParams>(() => {
        if (typeof window !== 'undefined') {
            const urlParams = new URLSearchParams(window.location.search);
            Object.entries(initialValues).forEach(([key, value]) => {
                if (!urlParams.has(key)) {
                    urlParams.set(key, value);
                }
            });
            return urlParams;
        }
        const p = new URLSearchParams();
        Object.entries(initialValues).forEach(([key, value]) => {
            p.set(key, value);
        });
        return p;
    });

    const [isOpen, setIsOpen] = useState(false);
    const { suggestions, setSuggestions, generateSuggestions, findExactMatch, clearSuggestions } =
        useFilterSuggestions(filters);

    // Build active filters from params
    const activeFilters: Record<string, string> = {};
    filters.forEach((f) => {
        const val = params.get(f.key);
        if (val) activeFilters[f.key] = val;
    });

    const filterItems = (params: URLSearchParams) => {
        const rawSearch = params.get('search')?.toLowerCase() || '';
        const search = normalizeForSearch(rawSearch);

        const currentFilters: Record<string, string> = {};
        filters.forEach((f) => {
            const val = params.get(f.key);
            if (val) currentFilters[f.key] = val;
        });

        let visibleCount = 0;
        const extraStatsData: Record<string, Set<any>> = {};
        extraStats.forEach((stat) => {
            extraStatsData[stat.elementId] = new Set();
        });

        const elements = document.querySelectorAll(dataSelector);

        elements.forEach((el) => {
            const element = el as HTMLElement;
            const textContent = normalizeCatalog(element.innerText.toLowerCase()).replace(/\s+/g, '');

            let matches = !search || textContent.includes(search);

            if (matches) {
                for (const [key, value] of Object.entries(currentFilters)) {
                    const attrVal = element.getAttribute(`data-${key}`);
                    if (!attrVal) {
                        matches = false;
                        break;
                    }
                    const values = attrVal.split(/[,;]/).map((v) => v.trim());
                    if (!values.includes(value)) {
                        matches = false;
                        break;
                    }
                }
            }

            element.style.display = matches ? '' : 'none';

            if (matches) {
                visibleCount++;
                extraStats.forEach((stat) => {
                    const val = element.getAttribute(`data-${stat.dataAttribute}`);
                    if (val) {
                        val.split(/[,;]/).forEach((v) => {
                            const cleanV = v.trim();
                            if (cleanV) {
                                if (stat.type === 'range') {
                                    extraStatsData[stat.elementId].add(parseInt(cleanV, 10));
                                } else {
                                    extraStatsData[stat.elementId].add(cleanV);
                                }
                            }
                        });
                    }
                });
            }
        });

        // Update counts
        [totalCountId, ...additionalCountIds].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.textContent = String(visibleCount);
        });

        // Update extra stats
        extraStats.forEach((stat) => {
            const el = document.getElementById(stat.elementId);
            if (el) {
                if (stat.type === 'count') {
                    el.textContent = String(extraStatsData[stat.elementId].size);
                } else if (stat.type === 'range') {
                    const numbers = Array.from(extraStatsData[stat.elementId]) as number[];
                    const range = numbers.length > 0 ? Math.max(...numbers) - Math.min(...numbers) + 1 : 0;
                    el.textContent = String(range);
                }
            }
        });

        // Dispatch event
        if (typeof window !== 'undefined') {
            window.dispatchEvent(
                new CustomEvent('filter-updated', {
                    detail: { visibleCount, activeFilters: currentFilters },
                }),
            );
        }
    };

    useEffect(() => {
        if (typeof window !== 'undefined') {
            filterItems(params);
        }
    }, []);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            filterItems(params);
        }
    }, [params]);

    const updateParams = (newParams: URLSearchParams) => {
        if (typeof window !== 'undefined') {
            window.history.pushState({}, '', `?${newParams.toString()}`);
            setParams(newParams);
        }
    };

    const updateFilter = (key: string, value: string) => {
        const newParams = new URLSearchParams(params);
        if (value) {
            newParams.set(key, value);
        } else {
            newParams.delete(key);
        }
        updateParams(newParams);
    };

    const resetFilters = () => {
        if (typeof window !== 'undefined') {
            window.history.pushState({}, '', window.location.pathname);
            setParams(new URLSearchParams());
        }
    };

    const handleSearchChange = (term: string) => {
        const newParams = new URLSearchParams(params);
        if (term) newParams.set('search', term);
        else newParams.delete('search');
        updateParams(newParams);

        setSuggestions(generateSuggestions(term));

        const exactMatch = findExactMatch(term);
        if (exactMatch) {
            const smartParams = new URLSearchParams(params);
            smartParams.delete('search');
            smartParams.set(exactMatch.filter.key, exactMatch.match);
            updateParams(smartParams);
            clearSuggestions();
        }
    };

    const handleSuggestionSelect = (suggestion: Suggestion) => {
        const smartParams = new URLSearchParams(params);
        smartParams.delete('search');
        smartParams.set(suggestion.key, suggestion.value);
        updateParams(smartParams);
        clearSuggestions();
    };

    return (
        <div className="relative z-fixed mb-4 w-full bg-transparent transition-all duration-300">
            <div className="container-mp">
                <FilterBarUI
                    filters={filters}
                    activeFilters={activeFilters}
                    searchTerm={params.get('search') || ''}
                    suggestions={suggestions}
                    isOpen={isOpen}
                    onToggle={() => setIsOpen(!isOpen)}
                    onFilterChange={updateFilter}
                    onSearchChange={handleSearchChange}
                    onSuggestionSelect={handleSuggestionSelect}
                    onSuggestionsClear={clearSuggestions}
                    onReset={resetFilters}
                    searchPlaceholder={searchPlaceholder}
                    showContainerPadding={true}
                    rightContent={
                        viewToggleTarget ? <GalleryViewToggle targetSelector={viewToggleTarget} /> : undefined
                    }
                />
            </div>
        </div>
    );
}
