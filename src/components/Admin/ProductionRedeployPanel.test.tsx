import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ProductionRedeployPanel from './ProductionRedeployPanel';

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

describe('ProductionRedeployPanel', () => {
    it('lance le redéploiement après confirmation', async () => {
        const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
            init?.method === 'POST' ? Response.json({ ok: true, jobId: 'j' }) : Response.json({ configured: true }),
        );
        vi.stubGlobal('fetch', fetchMock);
        render(<ProductionRedeployPanel />);
        const button = await screen.findByRole('button', { name: 'Redéployer la production' });
        await waitFor(() => expect(button).toBeEnabled());
        fireEvent.click(button);
        fireEvent.click(await screen.findByRole('button', { name: 'Redéployer' }));
        await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/admin/release/redeploy', { method: 'POST' }));
    });

    it('explique comment le configurer quand le hook manque', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => Response.json({ configured: false })),
        );
        render(<ProductionRedeployPanel compact />);
        expect(await screen.findByText(/VERCEL_PRODUCTION_DEPLOY_HOOK/)).toBeInTheDocument();
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
});
