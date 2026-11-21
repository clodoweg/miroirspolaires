import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen, renderHook, act } from '@testing-library/react';
import FilterBarUI, { useFilterSuggestions } from './FilterBarUI';
import type { FilterConfig } from '@/types/filters';

describe('FilterBarUI', () => {
    const mockFilters: FilterConfig[] = [{ key: 'year', label: 'Année', options: ['2023', '2022'] }];

    it('renders correctly', () => {
        render(
            <FilterBarUI
                filters={mockFilters}
                activeFilters={{}}
                searchTerm=""
                suggestions={[]}
                isOpen={false}
                onToggle={vi.fn()}
                onFilterChange={vi.fn()}
                onSearchChange={vi.fn()}
                onSuggestionSelect={vi.fn()}
                onSuggestionsClear={vi.fn()}
                onReset={vi.fn()}
            />,
        );
        expect(screen.getByText('Filtres')).toBeDefined();
    });

    it('shows active filter count', () => {
        render(
            <FilterBarUI
                filters={mockFilters}
                activeFilters={{ year: '2023' }}
                searchTerm=""
                suggestions={[]}
                isOpen={false}
                onToggle={vi.fn()}
                onFilterChange={vi.fn()}
                onSearchChange={vi.fn()}
                onSuggestionSelect={vi.fn()}
                onSuggestionsClear={vi.fn()}
                onReset={vi.fn()}
            />,
        );
        expect(screen.getByText('1')).toBeDefined(); // The count span
    });

    it('calls onToggle when filters button is clicked', () => {
        const onToggle = vi.fn();
        render(
            <FilterBarUI
                filters={mockFilters}
                activeFilters={{}}
                searchTerm=""
                suggestions={[]}
                isOpen={false}
                onToggle={onToggle}
                onFilterChange={vi.fn()}
                onSearchChange={vi.fn()}
                onSuggestionSelect={vi.fn()}
                onSuggestionsClear={vi.fn()}
                onReset={vi.fn()}
            />,
        );
        fireEvent.click(screen.getByText('Filtres'));
        expect(onToggle).toHaveBeenCalled();
    });
});

describe('useFilterSuggestions', () => {
    const mockFilters: FilterConfig[] = [
        { key: 'year', label: 'Année', options: ['2023', '2022'] },
        { key: 'type', label: 'Type', options: ['Galaxie', 'Nébuleuse'] },
    ];

    it('generates suggestions based on term', () => {
        const { result } = renderHook(() => useFilterSuggestions(mockFilters));

        let suggestions: any[] = [];
        act(() => {
            suggestions = result.current.generateSuggestions('20');
        });

        expect(suggestions).toHaveLength(2);
        expect(suggestions?.[0].value).toBe('2023');
    });

    it('finds exact matches', () => {
        const { result } = renderHook(() => useFilterSuggestions(mockFilters));

        let match: any = null;
        act(() => {
            match = result.current.findExactMatch('Galaxie');
        });

        expect(match).not.toBeNull();
        expect(match?.match).toBe('Galaxie');
        expect(match?.filter.key).toBe('type');
    });
});
