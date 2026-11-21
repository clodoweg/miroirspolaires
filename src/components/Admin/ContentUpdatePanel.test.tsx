/**
 * Tests du bouton de mise à jour : confirmation obligatoire, lancement du seul domaine de la page et
 * rappel des textes à écrire via Claude Code.
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

    it('indique de passer par Claude Code quand la SEO manque', async () => {
        mockGaps({ missingAltCount: 3, missingSeo: ['2026/a'] });
        render(<ContentUpdatePanel scope="voyages" />);

        expect(await screen.findByText(/1 description SEO manquante/)).toBeInTheDocument();
        expect(screen.getByText(/via Claude Code/)).toBeInTheDocument();
        expect(screen.getByText('/generate-seo voyages')).toBeInTheDocument();
        expect(screen.getByText('/generate-alts voyages')).toBeInTheDocument();
        expect(global.fetch).toHaveBeenCalledWith('/api/admin/content-gaps?scope=voyages');
    });

    it("n'affiche aucun rappel quand rien ne manque, ni quand l'état est indisponible", async () => {
        render(<ContentUpdatePanel scope="blog" />);
        await waitFor(() => expect(global.fetch).toHaveBeenCalled());
        expect(screen.queryByRole('status')).not.toBeInTheDocument();

        global.fetch = vi.fn().mockRejectedValue(new Error('réseau')) as never;
        render(<ContentUpdatePanel scope="voyages" />);
        await waitFor(() => expect(global.fetch).toHaveBeenCalled());
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
});
