/**
 * Tests des composants et hooks partagés par les éditeurs de contenu.
 */
import { act, render, renderHook, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import EditorSidebar from './EditorSidebar';
import Field from './Field';
import StatCard from './StatCard';
import { useSidebarCollapsed } from './useSidebarCollapsed';
import { withAdminProviders } from './withAdminProviders';
import { useToast } from '../Toast';
import { useConfirm } from '../ConfirmDialog';

function Icon({ className }: { className?: string }) {
    return <svg data-testid="icon" className={className} />;
}

describe('Field', () => {
    it('associe le libellé, l’indice et le contrôle', () => {
        render(
            <Field label="Titre" hint="obligatoire" className="md:col-span-6">
                <input />
            </Field>,
        );
        expect(screen.getByLabelText(/Titre/)).toBeInstanceOf(HTMLInputElement);
        expect(screen.getByText('obligatoire')).toBeInTheDocument();
        expect(screen.getByText('Titre').closest('label')).toHaveClass('md:col-span-6');
    });
});

describe('StatCard', () => {
    it('affiche valeur, total et complétude incomplète en orange', () => {
        render(<StatCard label="Couvertures" value={1} total={4} icon={Icon} showProgress />);
        expect(screen.getByText('/ 4')).toBeInTheDocument();
        expect(screen.getByText('25%')).toHaveClass('text-orange-400');
    });

    it('utilise la couleur émeraude quand la complétude est atteinte', () => {
        render(<StatCard label="Pays" value={2} total={2} icon={Icon} showProgress accentColor="emerald" />);
        expect(screen.getByText('100%')).toHaveClass('text-emerald-400');
    });

    it('masque la barre sans total', () => {
        render(<StatCard label="Total" value={3} icon={Icon} showProgress />);
        expect(screen.queryByText('Complétude')).toBeNull();
        expect(screen.getByTestId('icon')).toBeInTheDocument();
    });
});

describe('EditorSidebar', () => {
    it('applique les classes repliée ou dépliée', () => {
        const { container, rerender } = render(<EditorSidebar collapsed={false}>liste</EditorSidebar>);
        expect(container.querySelector('aside')).toHaveClass('lg:w-[300px]');
        rerender(<EditorSidebar collapsed>liste</EditorSidebar>);
        expect(container.querySelector('aside')).toHaveClass('opacity-0', 'lg:w-0');
    });
});

describe('withAdminProviders', () => {
    it('rend le composant sous les providers toast et confirmation', () => {
        function Inner() {
            useToast();
            useConfirm();
            return <p>contenu</p>;
        }
        const Wrapped = withAdminProviders(Inner, 'Essai');
        expect(Wrapped.displayName).toBe('Essai');
        render(<Wrapped />);
        expect(screen.getByText('contenu')).toBeInTheDocument();
    });
});

describe('useSidebarCollapsed', () => {
    beforeEach(() => localStorage.clear());

    it('lit et persiste l’état replié', () => {
        localStorage.setItem('admin_sidebar_collapsed', 'true');
        const { result } = renderHook(() => useSidebarCollapsed());
        expect(result.current[0]).toBe(true);
        act(() => result.current[1](false));
        expect(result.current[0]).toBe(false);
        expect(localStorage.getItem('admin_sidebar_collapsed')).toBe('false');
    });
});
