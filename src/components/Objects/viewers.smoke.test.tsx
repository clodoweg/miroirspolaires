/**
 * Test de fumée des quatre visualiseurs d'objets : chacun doit se monter et charger ses
 * données sans erreur d'exécution (une dépendance de useMemo mal nommée avait cassé le build).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import CometsViewer from './CometsViewer';
import AsteroidsViewer from './AsteroidsViewer';
import ExoplanetViewer from './ExoplanetViewer';
import VariableStarsViewer from './VariableStarsViewer';

const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const body = url.includes('variable-stars') ? { stars: [], total: 0, page: 1, limit: 100, isExact: true } : [];
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
});

describe('visualiseurs d’objets', () => {
    beforeEach(() => {
        fetchMock.mockClear();
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it.each([
        ['comètes', CometsViewer, '/api/comets'],
        ['astéroïdes', AsteroidsViewer, '/api/asteroids'],
        ['exoplanètes', ExoplanetViewer, '/api/exoplanets'],
        ['étoiles variables', VariableStarsViewer, '/api/variable-stars'],
    ])('monte le visualiseur des %s et interroge son API', async (_name, Viewer, endpoint) => {
        const { container } = render(<Viewer />);
        await waitFor(() =>
            expect(fetchMock.mock.calls.some(([input]) => String(input).startsWith(endpoint))).toBe(true),
        );
        expect(container.firstChild).not.toBeNull();
        expect(screen.queryByText(/Erreur de chargement/)).not.toBeInTheDocument();
    });
});
