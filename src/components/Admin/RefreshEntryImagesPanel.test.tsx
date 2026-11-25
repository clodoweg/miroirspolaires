/**
 * Tests de la régénération des versions web d'un seul article : arguments limités au dossier, confirmation.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RefreshEntryImagesPanel, { refreshArgs } from './RefreshEntryImagesPanel';

vi.mock('./ScriptConsole', () => ({
    default: ({ runId, args }: { runId: string; args: string[] }) => (
        <div data-testid="console">{[runId, ...args].join(' ')}</div>
    ),
}));

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

describe('refreshArgs', () => {
    it('limite le script au dossier de l’entrée', () => {
        expect(refreshArgs('voyages', '2025/islande')).toEqual(['--only=voyages', '--prefix=voyages/2025/islande/']);
    });
});

describe('RefreshEntryImagesPanel', () => {
    it('lance la régénération de l’article choisi après confirmation', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () =>
                Response.json([
                    { year: '2025', slug: 'ancien', title: 'Ancien' },
                    { year: '2026', slug: 'fjords', title: 'La route des fjords' },
                ]),
            ),
        );
        render(<RefreshEntryImagesPanel scope="blog" />);
        const select = await screen.findByRole('combobox');
        await screen.findByRole('option', { name: '2026 · La route des fjords' });
        expect(screen.getByRole('button', { name: 'Régénérer' })).toBeDisabled();
        fireEvent.change(select, { target: { value: '2026/fjords' } });
        fireEvent.click(screen.getByRole('button', { name: 'Régénérer' }));
        const buttons = await screen.findAllByRole('button', { name: 'Régénérer' });
        fireEvent.click(buttons[buttons.length - 1]);
        await waitFor(() =>
            expect(screen.getByTestId('console')).toHaveTextContent(
                'refresh-web-images --only=blog --prefix=blog/2026/fjords/',
            ),
        );
    });
});
