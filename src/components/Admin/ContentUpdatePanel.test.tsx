/**
 * Tests du bouton de mise à jour : confirmation obligatoire et lancement du seul domaine de la page.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ContentUpdatePanel from './ContentUpdatePanel';

vi.mock('./ScriptConsole', () => ({
    default: ({ runId }: { runId: string }) => <div data-testid="console">{runId}</div>,
}));

function mockGaps(gaps: unknown) {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => gaps }) as never;
}

describe('ContentUpdatePanel', () => {
    beforeEach(() => {
        sessionStorage.clear();
        mockGaps({ missingAltCount: 0, missingSeo: [] });
    });

    it.each([
        ['blog', 'du blog', 'update-blog'],
        ['voyages', 'des voyages', 'update-voyages'],
    ] as const)('lance le seul domaine %s après confirmation', async (scope, label, runId) => {
        render(<ContentUpdatePanel scope={scope} />);
        fireEvent.click(screen.getByRole('button', { name: `Mettre à jour les images ${label}` }));

        expect(screen.queryByTestId('console')).not.toBeInTheDocument();
        fireEvent.click(await screen.findByRole('button', { name: 'Lancer' }));

        await waitFor(() => expect(screen.getByTestId('console')).toHaveTextContent(runId));
    });

    it('ne lance rien si la confirmation est annulée', async () => {
        render(<ContentUpdatePanel scope="blog" />);
        fireEvent.click(screen.getByRole('button', { name: 'Mettre à jour les images du blog' }));
        fireEvent.click(await screen.findByRole('button', { name: /Annuler/ }));

        await waitFor(() => expect(screen.queryByRole('button', { name: 'Lancer' })).not.toBeInTheDocument());
        expect(screen.queryByTestId('console')).not.toBeInTheDocument();
    });
});
