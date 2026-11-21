import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import ObjectFilterBar, { type ActiveFilterChip } from './ObjectFilterBar';

describe('ObjectFilterBar', () => {
    const mockActiveFilters: ActiveFilterChip[] = [{ key: 'minMag', label: 'Mag Min', value: '11.5' }];

    it('renders search input and advanced filter toggle', () => {
        render(
            <ObjectFilterBar
                query=""
                onQueryChange={vi.fn()}
                searchPlaceholder="Chercher..."
                showAdvanced={false}
                onToggleAdvanced={vi.fn()}
                activeFilters={[]}
                onClearFilter={vi.fn()}
                onReset={vi.fn()}
            >
                <div>Champs Avancés</div>
            </ObjectFilterBar>,
        );

        expect(screen.getByPlaceholderText('Chercher...')).toBeDefined();
        expect(screen.getByText('Filtres')).toBeDefined();
    });

    it('renders active filter chips when provided', () => {
        render(
            <ObjectFilterBar
                query=""
                onQueryChange={vi.fn()}
                showAdvanced={false}
                onToggleAdvanced={vi.fn()}
                activeFilters={mockActiveFilters}
                onClearFilter={vi.fn()}
                onReset={vi.fn()}
            >
                <div>Champs Avancés</div>
            </ObjectFilterBar>,
        );

        expect(screen.getByText('Mag Min :')).toBeDefined();
        expect(screen.getByText('11.5')).toBeDefined();
    });

    it('shows active filter count badge', () => {
        render(
            <ObjectFilterBar
                query=""
                onQueryChange={vi.fn()}
                showAdvanced={false}
                onToggleAdvanced={vi.fn()}
                activeFilters={mockActiveFilters}
                onClearFilter={vi.fn()}
                onReset={vi.fn()}
            >
                <div>Champs Avancés</div>
            </ObjectFilterBar>,
        );

        expect(screen.getByText('1')).toBeDefined();
    });

    it('calls onToggleAdvanced when filters button is clicked', () => {
        const onToggleAdvanced = vi.fn();
        render(
            <ObjectFilterBar
                query=""
                onQueryChange={vi.fn()}
                showAdvanced={false}
                onToggleAdvanced={onToggleAdvanced}
                activeFilters={[]}
                onClearFilter={vi.fn()}
                onReset={vi.fn()}
            >
                <div>Champs Avancés</div>
            </ObjectFilterBar>,
        );

        fireEvent.click(screen.getByText('Filtres'));
        expect(onToggleAdvanced).toHaveBeenCalled();
    });

    it('renders children and reset button when showAdvanced is true', () => {
        const onReset = vi.fn();
        render(
            <ObjectFilterBar
                query=""
                onQueryChange={vi.fn()}
                showAdvanced={true}
                onToggleAdvanced={vi.fn()}
                activeFilters={[]}
                onClearFilter={vi.fn()}
                onReset={onReset}
            >
                <div data-testid="advanced-fields">Champs Avancés</div>
            </ObjectFilterBar>,
        );

        expect(screen.getByTestId('advanced-fields')).toBeDefined();
        expect(screen.getByText('Réinitialiser tout')).toBeDefined();

        fireEvent.click(screen.getByText('Réinitialiser tout'));
        expect(onReset).toHaveBeenCalled();
    });

    it('handles search query local state, autocomplete, and triggers query change only on submit/click', () => {
        const onQueryChange = vi.fn();
        const suggestions = [
            { value: 'Kepler-186f', label: 'Exoplanète' },
            { value: 'WASP-12b', label: 'Exoplanète' },
            { value: 'Proxima Centauri b', label: 'Exoplanète' },
        ];

        render(
            <ObjectFilterBar
                query=""
                onQueryChange={onQueryChange}
                searchPlaceholder="Chercher..."
                showAdvanced={false}
                onToggleAdvanced={vi.fn()}
                activeFilters={[]}
                onClearFilter={vi.fn()}
                onReset={vi.fn()}
                suggestions={suggestions}
            >
                <div>Champs Avancés</div>
            </ObjectFilterBar>,
        );

        const input = screen.getByPlaceholderText('Chercher...') as HTMLInputElement;

        // Typage : ne doit pas appeler onQueryChange immédiatement
        fireEvent.change(input, { target: { value: 'Kepler' } });
        expect(input.value).toBe('Kepler');
        expect(onQueryChange).not.toHaveBeenCalled();

        // Les suggestions de recherche filtrées doivent apparaître
        expect(screen.getByText('Kepler-186f')).toBeDefined();
        expect(screen.queryByText('WASP-12b')).toBeNull();

        // Clic sur la suggestion : doit mettre à jour l'input et déclencher la recherche
        fireEvent.click(screen.getByText('Kepler-186f'));
        expect(input.value).toBe('Kepler-186f');
        expect(onQueryChange).toHaveBeenCalledWith('Kepler-186f');
    });

    it('triggers search when Enter key is pressed', () => {
        const onQueryChange = vi.fn();
        render(
            <ObjectFilterBar
                query=""
                onQueryChange={onQueryChange}
                searchPlaceholder="Chercher..."
                showAdvanced={false}
                onToggleAdvanced={vi.fn()}
                activeFilters={[]}
                onClearFilter={vi.fn()}
                onReset={vi.fn()}
            >
                <div>Champs Avancés</div>
            </ObjectFilterBar>,
        );

        const input = screen.getByPlaceholderText('Chercher...');
        fireEvent.change(input, { target: { value: 'test-query' } });
        fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

        expect(onQueryChange).toHaveBeenCalledWith('test-query');
    });
});
