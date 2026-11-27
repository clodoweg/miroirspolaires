/**
 * Tests du bouton « Reprendre la photo » de la liste des astrophotos : lien vers l'importeur en local, lancement
 * direct du job `update-photos-ci --refresh-ids=<id>` à distance, après confirmation.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AdminProviders from './AdminProviders';
import AstroRefreshButton from './AstroRefreshButton';

function renderButton(remote: boolean) {
    return render(
        <AdminProviders>
            <AstroRefreshButton photoId="334045" title="Triplet du lion" remote={remote} />
        </AdminProviders>,
    );
}

async function confirmLaunch() {
    const buttons = await screen.findAllByRole('button', { name: 'Lancer' });
    fireEvent.click(buttons[buttons.length - 1]);
}

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

describe('AstroRefreshButton', () => {
    it('renvoie vers l’importeur pré-rempli en local', () => {
        renderButton(false);
        expect(screen.getByRole('link', { name: 'Reprendre la photo 334045 depuis AstroBin' })).toHaveAttribute(
            'href',
            '/admin/astrophotos/importer?refresh=334045',
        );
    });

    it('lance le job de la photo à distance, après confirmation', async () => {
        const fetchMock = vi.fn(async () => Response.json({ id: 'job' }, { status: 201 }));
        vi.stubGlobal('fetch', fetchMock);
        renderButton(true);
        fireEvent.click(screen.getByRole('button', { name: 'Reprendre la photo 334045 depuis AstroBin' }));
        expect(await screen.findByText('Reprendre « Triplet du lion » ?')).toBeInTheDocument();
        expect(fetchMock).not.toHaveBeenCalled();
        await confirmLaunch();
        await waitFor(() =>
            expect(fetchMock).toHaveBeenCalledWith(
                '/api/admin/jobs',
                expect.objectContaining({
                    method: 'POST',
                    body: JSON.stringify({ scriptId: 'update-photos-ci', options: { refreshIds: ['334045'] } }),
                }),
            ),
        );
        expect(await screen.findByText(/Job lancé pour 334045/)).toBeInTheDocument();
    });

    it('affiche le refus du serveur, par exemple un job déjà en cours', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => Response.json({ error: 'Un job est déjà en cours.' }, { status: 409 })),
        );
        renderButton(true);
        fireEvent.click(screen.getByRole('button', { name: 'Reprendre la photo 334045 depuis AstroBin' }));
        await confirmLaunch();
        expect(await screen.findByText('Un job est déjà en cours.')).toBeInTheDocument();
    });
});
