import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ReleasePanel from './ReleasePanel';

const HEAD = 'a'.repeat(40);

function status(pullRequest: unknown, ahead = 2) {
    return {
        contentBranch: 'dev',
        productionBranch: 'main',
        ahead,
        commits: [
            { sha: '1'.repeat(40), message: 'feat: nouvel article', author: 'bot', date: '2026-11-10T09:00:00Z' },
        ],
        pullRequest,
    };
}

function mockFetch(handler: (url: string, init?: RequestInit) => Response) {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => handler(url, init));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('ReleasePanel', () => {
    it('liste les commits en attente et ouvre la PR', async () => {
        const fetchMock = mockFetch((_url, init) =>
            init?.method === 'POST' ? Response.json({ number: 7 }) : Response.json(status(null)),
        );
        render(<ReleasePanel />);
        expect(await screen.findByText('feat: nouvel article')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Préparer la mise en production/ }));
        await waitFor(() =>
            expect(fetchMock).toHaveBeenCalledWith('/api/admin/release', expect.objectContaining({ method: 'POST' })),
        );
    });

    it('bloque la publication tant que la CI n’est pas verte', async () => {
        mockFetch(() =>
            Response.json(status({ number: 7, url: 'https://x', headSha: HEAD, mergeable: true, checks: 'pending' })),
        );
        render(<ReleasePanel />);
        expect(await screen.findByText('CI en cours…')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Mettre en production/ })).toBeDisabled();
    });

    it('publie après confirmation quand la CI est verte', async () => {
        const fetchMock = mockFetch((url) =>
            url.endsWith('/merge')
                ? Response.json({ ok: true, sha: 'm' })
                : Response.json(
                      status({ number: 7, url: 'https://x', headSha: HEAD, mergeable: true, checks: 'success' }),
                  ),
        );
        render(<ReleasePanel />);
        fireEvent.click(await screen.findByRole('button', { name: /^Mettre en production$/ }));
        const dialogButtons = await screen.findAllByRole('button', { name: 'Mettre en production' });
        fireEvent.click(dialogButtons[dialogButtons.length - 1]);
        await waitFor(() => {
            const mergeCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/merge'));
            expect(JSON.parse(String(mergeCall?.[1]?.body))).toEqual({ pullNumber: 7, headSha: HEAD });
        });
    });

    it('affiche une branche à jour et une erreur de chargement', async () => {
        mockFetch(() => Response.json(status(null, 0)));
        const { unmount } = render(<ReleasePanel />);
        expect(await screen.findByText(/Rien à publier/)).toBeInTheDocument();
        unmount();
        mockFetch(() =>
            Response.json({ error: 'La mise en production se fait depuis l’admin distant' }, { status: 501 }),
        );
        render(<ReleasePanel />);
        expect(await screen.findByText(/Chargement impossible/)).toBeInTheDocument();
    });
});
