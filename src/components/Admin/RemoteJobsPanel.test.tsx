import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RemoteJobsPanel from './RemoteJobsPanel';

const JOB_ID = '0f0e8a3c-1234-4abc-9def-0123456789ab';
const SCRIPT = {
    id: 'seo-check',
    label: 'Audit SEO complet',
    description: 'Lecture seule.',
    category: 'check',
    writes: false,
};
const JOB = {
    id: JOB_ID,
    scriptId: 'seo-check',
    status: 'succeeded',
    actor: 'clodoweg',
    createdAt: '2026-11-11T10:00:00Z',
    commitSha: 'abcdef1234',
};

afterEach(() => vi.unstubAllGlobals());

describe('RemoteJobsPanel', () => {
    it('liste scripts et jobs, lance un job après confirmation et affiche son journal', async () => {
        const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
            if (url === '/api/admin/jobs' && init?.method === 'POST')
                return Response.json({ ...JOB, status: 'queued' }, { status: 201 });
            if (url === '/api/admin/jobs') return Response.json({ scripts: [SCRIPT], jobs: [JOB] });
            return Response.json({
                job: JOB,
                logs: [{ id: 1, at: 't', stream: 'stdout', line: 'Couverture SEO : 98 %' }],
            });
        });
        vi.stubGlobal('fetch', fetchMock);
        render(<RemoteJobsPanel />);

        expect(await screen.findByText('Lecture seule.')).toBeInTheDocument();
        expect(screen.getByText(/commit abcdef1/)).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Lancer' }));
        const confirmButtons = await screen.findAllByRole('button', { name: 'Lancer' });
        fireEvent.click(confirmButtons[confirmButtons.length - 1]);
        await waitFor(() =>
            expect(fetchMock).toHaveBeenCalledWith('/api/admin/jobs', expect.objectContaining({ method: 'POST' })),
        );
        expect(await screen.findByText(/Couverture SEO : 98 %/)).toBeInTheDocument();
    });

    it('affiche une erreur de chargement', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => Response.json({ error: 'Admin distant uniquement' }, { status: 501 })),
        );
        render(<RemoteJobsPanel />);
        expect(await screen.findByText(/Chargement impossible/)).toBeInTheDocument();
    });
});
