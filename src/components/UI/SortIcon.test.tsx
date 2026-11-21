import { describe, it, expect, vi } from 'vitest';

// POURQUOI : le mock global de src/test/setup.tsx rend des <div> sans classes ; on teste les vraies icônes.
vi.unmock('lucide-react');
import { render } from '@testing-library/react';
import SortIcon from './SortIcon';

function svgClass(container: HTMLElement) {
    return container.querySelector('svg')?.getAttribute('class') ?? '';
}

describe('SortIcon', () => {
    it('affiche la flèche neutre, atténuée, quand la colonne n’est pas triée', () => {
        const { container } = render(<SortIcon sortKey="mag" activeSort={{ col: 'name', dir: 'asc' }} />);
        expect(svgClass(container)).toContain('h-3 w-3');
        expect(svgClass(container)).toContain('text-mp-text-muted/40');
    });

    it('met la colonne triée en couleur d’accent, à la taille demandée', () => {
        const { container } = render(
            <SortIcon sortKey="mag" activeSort={{ col: 'mag', dir: 'desc' }} size="md" inactiveClassName="neutre" />,
        );
        expect(svgClass(container)).toContain('h-3.5 w-3.5');
        expect(svgClass(container)).toContain('text-mp-accent');
        expect(svgClass(container)).not.toContain('neutre');
    });

    it('distingue le sens croissant et décroissant', () => {
        const ascending = render(<SortIcon sortKey="a" activeSort={{ col: 'a', dir: 'asc' }} />).container.innerHTML;
        const descending = render(<SortIcon sortKey="a" activeSort={{ col: 'a', dir: 'desc' }} />).container.innerHTML;
        expect(ascending).not.toBe(descending);
    });
});
