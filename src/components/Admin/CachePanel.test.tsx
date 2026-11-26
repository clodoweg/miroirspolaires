/**
 * Tests du panneau Cache CDN & Worker en mode distant : dossiers proposés et lancement des jobs GitHub Actions.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CachePanel from './CachePanel';

const STATUS = {
    configured: true,
    workerUrl: 'https://images.example',
    purgeKeyConfigured: true,
    cdnPurgeConfigured: false,
    r2Configured: true,
    online: true,
    pingStatus: 400,
    pingStatusText: 'Bad Request',
    pingTime: 40,
    errorMessage: null,
    cachePolicy: {
        widths: [400],
        format: 'jpeg',
        cpuLimitMs: 10,
        sizeLimitKb: 500,
        megapixelLimit: 1.8,
        cachingMaxAge: '',
    },
};

function mockFetch() {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const path = String(url);
        if (path === '/api/admin/cache/status') return Response.json(STATUS);
        if (path === '/api/admin/jobs' && init?.method === 'POST') {
            return Response.json({ id: 'job-1', scriptId: 'warm-cache-ci', status: 'queued' }, { status: 201 });
        }
        if (path === '/api/admin/jobs') return Response.json({ scripts: [], jobs: [] });
        return new Response('{}', { status: 501 });
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

afterEach(() => {
    // POURQUOI : démonter avant de rétablir fetch, sinon le suivi du job lancé interroge le vrai réseau.
    cleanup();
    vi.unstubAllGlobals();
});

describe('CachePanel (admin distant)', () => {
    it('propose les trois domaines sans lire le disque, et lance le préchauffage comme job', async () => {
        const fetchMock = mockFetch();
        render(<CachePanel remote />);

        const options = await screen.findAllByRole('option');
        expect(options.map((option) => option.getAttribute('value'))).toEqual([
            'astrophotographies',
            'blog',
            'voyages',
        ]);
        expect(fetchMock.mock.calls.some(([url]) => String(url) === '/api/admin/r2/status')).toBe(false);

        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'blog' } });
        fireEvent.click(screen.getByRole('button', { name: /Préchauffer CDN/ }));

        await waitFor(() => {
            const post = fetchMock.mock.calls.find(
                ([url, init]) => url === '/api/admin/jobs' && init?.method === 'POST',
            );
            expect(JSON.parse(String(post?.[1]?.body))).toEqual({
                scriptId: 'warm-cache-ci',
                options: { prefix: ['blog'] },
            });
        });
        expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith('/api/admin/scripts/run'))).toBe(false);
    });
});
