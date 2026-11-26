/**
 * Tests du panneau d'import des astrophotos : un seul bouton, dont les cases à cocher choisissent les options
 * (`--dry-run` en local, entrée `update-photos-ci-force` à distance), toujours après confirmation.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AstroImportPanel, { parseRefreshIds } from './AstroImportPanel';

vi.mock('./ScriptConsole', () => ({
    default: ({ runId, args }: { runId: string; args: string[] }) => (
        <div data-testid="console">{[runId, ...args].join(' ')}</div>
    ),
}));

const JOB_ID = '0f0e8a3c-1234-4abc-9def-0123456789ab';
const SCRIPTS = [
    { id: 'update-photos-ci', label: 'Astrophotos : mettre à jour', description: '', writes: true },
    { id: 'update-photos-ci-force', label: 'Astrophotos : tout recopier', description: '', writes: true },
    { id: 'seo-check', label: 'Audit SEO', description: '', writes: false },
];
const OLD_JOB = {
    id: JOB_ID,
    scriptId: 'update-photos-ci',
    status: 'succeeded',
    actor: 'clodoweg',
    createdAt: '2026-11-11T10:00:00Z',
    commitSha: 'abcdef1234',
};
const OTHER_JOB = { ...OLD_JOB, id: '11111111-1234-4abc-9def-0123456789ab', scriptId: 'seo-check' };

async function confirmLaunch() {
    const buttons = await screen.findAllByRole('button', { name: 'Lancer' });
    fireEvent.click(buttons[buttons.length - 1]);
}

describe('AstroImportPanel en local', () => {
    beforeEach(() => sessionStorage.clear());

    it('lance update-photos sans option après confirmation', async () => {
        render(<AstroImportPanel remote={false} />);
        fireEvent.click(screen.getByRole('button', { name: /Mettre à jour les photos/ }));
        expect(screen.queryByTestId('console')).not.toBeInTheDocument();
        await confirmLaunch();
        await waitFor(() => expect(screen.getByTestId('console')).toHaveTextContent(/^update-photos$/));
    });

    it('passe --dry-run quand la case Simulation est cochée', async () => {
        render(<AstroImportPanel remote={false} />);
        fireEvent.click(screen.getByRole('checkbox', { name: /Simulation/ }));
        expect(screen.getByText(/update-photos\.mjs --dry-run/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Simuler la mise à jour/ }));
        await confirmLaunch();
        await waitFor(() => expect(screen.getByTestId('console')).toHaveTextContent('update-photos --dry-run'));
    });
});

describe('AstroImportPanel à distance', () => {
    afterEach(() => {
        // POURQUOI : démonter avant de rendre le vrai fetch, sinon le suivi du journal (minuteur) l'appellerait.
        cleanup();
        vi.unstubAllGlobals();
    });

    function mockJobsApi() {
        const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
            if (url === '/api/admin/jobs' && init?.method === 'POST')
                return Response.json({ ...OLD_JOB, status: 'queued' }, { status: 201 });
            if (url === '/api/admin/jobs') return Response.json({ scripts: SCRIPTS, jobs: [OLD_JOB, OTHER_JOB] });
            return Response.json({ job: OLD_JOB, logs: [] });
        });
        vi.stubGlobal('fetch', fetchMock);
        return fetchMock;
    }

    it('ne montre que les imports dans l’historique', async () => {
        mockJobsApi();
        render(<AstroImportPanel remote />);
        expect(await screen.findByText('Derniers imports')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Astrophotos : mettre à jour' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Audit SEO' })).not.toBeInTheDocument();
    });

    it('lance update-photos-ci-force quand « Tout recopier » est cochée', async () => {
        const fetchMock = mockJobsApi();
        render(<AstroImportPanel remote />);
        fireEvent.click(await screen.findByRole('checkbox', { name: /Tout recopier/ }));
        expect(screen.getByText(/Durée : 30 min à 1 h/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Tout recopier \(30 min/ }));
        await confirmLaunch();
        await waitFor(() =>
            expect(fetchMock).toHaveBeenCalledWith(
                '/api/admin/jobs',
                expect.objectContaining({
                    method: 'POST',
                    body: JSON.stringify({ scriptId: 'update-photos-ci-force' }),
                }),
            ),
        );
    });

    it('reprend seulement les photos retraitées indiquées', async () => {
        const fetchMock = mockJobsApi();
        render(<AstroImportPanel remote />);
        fireEvent.change(await screen.findByRole('textbox', { name: /Photos retraitées/ }), {
            target: { value: '1213620, 42' },
        });
        expect(screen.getByText(/--refresh-ids=1213620,42/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Mettre à jour les photos/ }));
        await confirmLaunch();
        await waitFor(() =>
            expect(fetchMock).toHaveBeenCalledWith(
                '/api/admin/jobs',
                expect.objectContaining({
                    body: JSON.stringify({ scriptId: 'update-photos-ci', options: { refreshIds: ['1213620', '42'] } }),
                }),
            ),
        );
    });

    it('garde les annotations d’AstroBin quand la case est cochée', async () => {
        const fetchMock = mockJobsApi();
        render(<AstroImportPanel remote />);
        fireEvent.click(await screen.findByRole('checkbox', { name: /Tout recopier/ }));
        fireEvent.click(screen.getByRole('checkbox', { name: /Garder les annotations d’AstroBin/ }));
        expect(screen.getByText(/--force-media --astrobin-annotations/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Tout recopier \(30 min/ }));
        await confirmLaunch();
        await waitFor(() =>
            expect(fetchMock).toHaveBeenCalledWith(
                '/api/admin/jobs',
                expect.objectContaining({
                    body: JSON.stringify({
                        scriptId: 'update-photos-ci-force',
                        options: { astrobinAnnotations: true },
                    }),
                }),
            ),
        );
    });

    it('bloque le lancement sur une saisie qui n’est pas une liste d’ID', async () => {
        mockJobsApi();
        render(<AstroImportPanel remote />);
        fireEvent.change(await screen.findByRole('textbox', { name: /Photos retraitées/ }), {
            target: { value: 'M42' },
        });
        expect(screen.getByText(/Des ID AstroBin/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Mettre à jour les photos/ })).toBeDisabled();
    });

    it('affiche une erreur de chargement', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => Response.json({ error: 'Admin distant uniquement' }, { status: 501 })),
        );
        render(<AstroImportPanel remote />);
        expect(await screen.findByText(/Chargement impossible/)).toBeInTheDocument();
    });
});

describe('parseRefreshIds', () => {
    it('lit des ID séparés par des virgules ou des espaces, sans doublon', () => {
        expect(parseRefreshIds('')).toEqual([]);
        expect(parseRefreshIds(' 1, 2 2 ')).toEqual(['1', '2']);
    });

    it('refuse autre chose que des ID, ou plus de 50', () => {
        expect(parseRefreshIds('1;rm')).toBeNull();
        expect(parseRefreshIds(Array.from({ length: 51 }, (_, i) => String(i + 1)).join(','))).toBeNull();
    });
});
