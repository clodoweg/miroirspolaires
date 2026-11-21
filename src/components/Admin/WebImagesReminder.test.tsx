/**
 * Tests du rappel des versions web : affichage du nombre d'images en attente et confirmation avant
 * de lancer le script sur un seul domaine.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import WebImagesReminder from './WebImagesReminder';

vi.mock('./ScriptConsole', () => ({
    default: ({ runId, args }: { runId: string; args: string[] }) => (
        <div data-testid="console">
            {runId} {args.join(' ')}
        </div>
    ),
}));

function mockStatus(body: unknown, ok = true) {
    global.fetch = vi.fn().mockResolvedValue({ ok, status: ok ? 200 : 500, json: async () => body }) as never;
}

describe('WebImagesReminder', () => {
    beforeEach(() => vi.restoreAllMocks());

    const mixedStatus = {
        total: 10,
        pending: 3,
        totalByScope: { astro: 4, blog: 4, voyages: 2 },
        pendingByScope: { astro: 0, blog: 2, voyages: 1 },
        pendingSamples: ['blog/a.jpg'],
    };

    async function confirmGeneration() {
        const confirmButtons = await screen.findAllByRole('button', { name: 'Générer et envoyer' });
        fireEvent.click(confirmButtons[confirmButtons.length - 1]);
    }

    it('propose un bouton par domaine sans scope, et lance le script sur ce seul domaine', async () => {
        mockStatus(mixedStatus);
        render(<WebImagesReminder />);
        expect(await screen.findByText('3 images sans version web')).toBeInTheDocument();
        expect(screen.getByText(/blog : 2 · voyages : 1/)).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Générer et envoyer : voyages' }));
        await confirmGeneration();
        await waitFor(() =>
            expect(screen.getByTestId('console')).toHaveTextContent('generate-web-images --only=voyages'),
        );
    });

    it('limite le bandeau au domaine de la page', async () => {
        mockStatus(mixedStatus);
        render(<WebImagesReminder scope="blog" />);
        expect(await screen.findByText('2 images sans version web')).toBeInTheDocument();
        expect(screen.queryByText(/voyages : 1/)).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Générer et envoyer' }));
        await confirmGeneration();
        await waitFor(() => expect(screen.getByTestId('console')).toHaveTextContent('generate-web-images --only=blog'));
    });

    it("n'affiche aucun bouton sur un domaine à jour, même si un autre domaine a des images en attente", async () => {
        mockStatus(mixedStatus);
        render(<WebImagesReminder scope="astro" />);
        expect(await screen.findByText('Toutes les images (4) ont leurs versions web.')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Générer/ })).not.toBeInTheDocument();
    });

    it('confirme quand toutes les images ont leurs versions web', async () => {
        mockStatus({
            total: 10,
            pending: 0,
            totalByScope: { astro: 4, blog: 4, voyages: 2 },
            pendingByScope: { astro: 0, blog: 0, voyages: 0 },
            pendingSamples: [],
        });
        render(<WebImagesReminder />);
        expect(await screen.findByText('Toutes les images (10) ont leurs versions web.')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Générer/ })).not.toBeInTheDocument();
    });

    it('indique quand l’état est indisponible', async () => {
        mockStatus({}, false);
        render(<WebImagesReminder />);
        expect(await screen.findByText(/État des versions web indisponible/)).toBeInTheDocument();
    });
});
