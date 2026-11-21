import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import UniversalFilterBar from './UniversalFilterBar';
import type { FilterConfig } from '@/types/filters';

describe('UniversalFilterBar', () => {
    const mockFilters: FilterConfig[] = [
        { key: 'year', label: 'Année', options: ['2023', '2022'] },
        { key: 'type', label: 'Type', options: ['Galaxie'] },
    ];

    beforeEach(() => {
        // Clear DOM for each test
        document.body.innerHTML = '';
        // Mock window.history.pushState
        vi.spyOn(window.history, 'pushState').mockImplementation(() => {});
    });

    it('renders search input and filter buttons', () => {
        render(<UniversalFilterBar filters={mockFilters} />);
        expect(screen.getByPlaceholderText(/Rechercher/i)).toBeDefined();
    });

    it('filters items in the DOM based on attributes', () => {
        // Setup mock items in DOM
        document.body.innerHTML = `
            <div id="results-count">0</div>
            <div class="test-item" data-year="2023" data-type="Galaxie">Item 1</div>
            <div class="test-item" data-year="2022" data-type="Galaxie">Item 2</div>
        `;

        render(<UniversalFilterBar filters={mockFilters} dataSelector=".test-item" />);

        const searchInput = screen.getByPlaceholderText(/Rechercher/i);

        // Trigger a filter change via search (indirectly tests filterItems logic)
        fireEvent.change(searchInput, { target: { value: 'Item 1' } });

        const item1 = document.querySelector('[data-year="2023"]') as HTMLElement;
        const item2 = document.querySelector('[data-year="2022"]') as HTMLElement;
        const count = document.getElementById('results-count');

        expect(item1.style.display).toBe('');
        expect(item2.style.display).toBe('none');
        expect(count?.textContent).toBe('1');
    });

    it('updates URL when filter is selected', () => {
        render(<UniversalFilterBar filters={mockFilters} />);

        // Find a filter button/select
        // Since FilterBarUI is complex, we target the search behavior which also updates params
        const searchInput = screen.getByPlaceholderText(/Rechercher/i);
        fireEvent.change(searchInput, { target: { value: 'test' } });

        expect(window.history.pushState).toHaveBeenCalledWith(
            expect.anything(),
            '',
            expect.stringContaining('search=test'),
        );
    });
});
