/**
 * Tests du panneau d'inventaire R2 : affichage par dossier, sélection des orphelins et suppression confirmée.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import R2InventoryPanel, { formatBytes } from './R2InventoryPanel';

const INVENTORY = {
    totalCount: 3,
    totalBytes: 3 * 1024 * 1024,
    prefixes: [{ prefix: 'blog/', count: 3, sizeBytes: 3 * 1024 * 1024 }],
    orphans: [
        { key: 'blog/2020/ancien/a.jpg', size: 2048, reason: 'Article supprimé' },
        { key: 'blog/2020/ancien/b.jpg', size: 2048, reason: 'Article supprimé' },
    ],
};

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

describe('formatBytes', () => {
    it('choisit l’unité', () => {
        expect(formatBytes(500)).toBe('500 o');
        expect(formatBytes(2048)).toBe('2 Ko');
        expect(formatBytes(3 * 1024 * 1024)).toBe('3 Mo');
    });
});

describe('R2InventoryPanel', () => {
    it('supprime les orphelins cochés après confirmation', async () => {
        const fetchMock = vi.fn(async (url: string) => {
            if (url === '/api/admin/r2/orphans') return Response.json({ deleted: ['blog/2020/ancien/a.jpg'] });
            return Response.json(INVENTORY);
        });
        vi.stubGlobal('fetch', fetchMock);
        render(<R2InventoryPanel />);

        expect(await screen.findByText(/Bucket : 3 fichiers, 3 Mo/)).toBeInTheDocument();
        expect(screen.getByText('Article supprimé (2)')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('checkbox', { name: /blog\/2020\/ancien\/a\.jpg/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Supprimer la sélection (1)' }));
        const confirmButtons = await screen.findAllByRole('button', { name: 'Supprimer' });
        fireEvent.click(confirmButtons[confirmButtons.length - 1]);

        await waitFor(() =>
            expect(fetchMock).toHaveBeenCalledWith(
                '/api/admin/r2/orphans',
                expect.objectContaining({ body: JSON.stringify({ keys: ['blog/2020/ancien/a.jpg'] }) }),
            ),
        );
        await waitFor(() =>
            expect(fetchMock.mock.calls.filter(([url]) => url === '/api/admin/r2/inventory')).toHaveLength(2),
        );
    });

    it('coche tout un groupe et affiche une erreur de lecture', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => Response.json(INVENTORY)),
        );
        render(<R2InventoryPanel />);
        fireEvent.click(await screen.findByRole('checkbox', { name: 'Tout cocher' }));
        expect(screen.getByRole('button', { name: 'Supprimer la sélection (2)' })).toBeEnabled();
        cleanup();

        vi.stubGlobal(
            'fetch',
            vi.fn(async () => Response.json({ error: 'R2 injoignable' }, { status: 502 })),
        );
        render(<R2InventoryPanel />);
        expect(await screen.findByText(/R2 injoignable/)).toBeInTheDocument();
    });
});
