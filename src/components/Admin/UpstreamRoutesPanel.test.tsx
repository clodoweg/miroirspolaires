/**
 * Tests du panneau des routes amont : tests de latence, réordonnancement, interrupteur et préréglage.
 */

import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import UpstreamRoutesPanel from './UpstreamRoutesPanel';
import { CDS_DOWN_PRESET } from '@/config/upstream-routes';

const route = (id: string, label: string, extra = {}) => ({
    id,
    label,
    baseUrl: `https://${id}.test/`,
    protocol: 'tap-adql',
    enabled: true,
    priority: 1,
    ...extra,
});

const STATE = {
    updatedAt: null,
    services: [
        {
            id: 'simbad',
            label: 'SIMBAD (TAP)',
            description: 'Fiches',
            routes: [
                route('cds', 'CDS Strasbourg'),
                route('harvard', 'Harvard'),
                route('nao', 'NAO', { isInsecure: true }),
            ],
        },
    ],
};

const fetchMock = vi.fn();
const jsonOk = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

function lastPutBody() {
    const call = fetchMock.mock.calls.findLast(([, init]) => init?.method === 'PUT');
    return JSON.parse(call?.[1].body as string);
}

async function renderPanel() {
    render(<UpstreamRoutesPanel />);
    await screen.findByRole('region', { name: 'SIMBAD (TAP)' });
}

describe('UpstreamRoutesPanel', () => {
    beforeEach(() => {
        fetchMock.mockReset();
        fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
            if (url.endsWith('/probe')) return jsonOk({ status: 'ok', latencyMs: 321 });
            if (init?.method === 'PUT') return jsonOk({ ...STATE, updatedAt: '2026-11-05T08:00:00.000Z' });
            return jsonOk(STATE);
        });
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('affiche les routes dans l’ordre et signale celles sans TLS', async () => {
        await renderPanel();
        const items = within(screen.getByRole('region', { name: 'SIMBAD (TAP)' })).getAllByRole('listitem');
        expect(items[0]).toHaveTextContent('CDS Strasbourg');
        expect(items[2]).toHaveTextContent('HTTP sans TLS');
    });

    it('rappelle en permanence qu’il faut committer le fichier', async () => {
        await renderPanel();
        expect(screen.getByRole('status')).toHaveTextContent('src/data/upstream-priority.json');
    });

    it('teste une route par ses ids, sans URL dans la requête', async () => {
        await renderPanel();
        fireEvent.click(screen.getByRole('button', { name: 'Tester Harvard' }));
        expect(await screen.findByText('OK, 321 ms')).toBeInTheDocument();
        const probeCall = fetchMock.mock.calls.find(([url]) => (url as string).endsWith('/probe'));
        expect(JSON.parse(probeCall?.[1].body as string)).toEqual({ serviceId: 'simbad', routeId: 'harvard' });
    });

    it.each([
        [{ status: 'timeout', latencyMs: 15000 }, 'Expirée après 15000 ms'],
        [{ status: 'http-error', latencyMs: 80, httpStatus: 404 }, 'Erreur HTTP 404, 80 ms'],
        [{ status: 'network-error', latencyMs: 5 }, 'Injoignable'],
        [{ status: 'invalid-response', latencyMs: 5, detail: 'Sans données' }, 'Sans données'],
    ])('affiche l’état %j', async (result, label) => {
        fetchMock.mockImplementation(async (url: string) =>
            jsonOk((url as string).endsWith('/probe') ? result : STATE),
        );
        await renderPanel();
        fireEvent.click(screen.getByRole('button', { name: 'Tester Harvard' }));
        expect(await screen.findByText(label)).toBeInTheDocument();
    });

    it('teste toutes les routes d’un clic', async () => {
        await renderPanel();
        fireEvent.click(screen.getByRole('button', { name: 'Tester toutes les routes' }));
        await waitFor(() => expect(screen.getAllByText('OK, 321 ms')).toHaveLength(3));
    });

    it('monte une route et enregistre le nouvel ordre', async () => {
        await renderPanel();
        fireEvent.click(screen.getByRole('button', { name: 'Monter Harvard' }));
        await waitFor(() =>
            expect(lastPutBody().services.simbad).toEqual({ order: ['harvard', 'cds', 'nao'], disabled: [] }),
        );
    });

    it('empêche de sortir de la liste', async () => {
        await renderPanel();
        expect(screen.getByRole('button', { name: 'Monter CDS Strasbourg' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Descendre NAO' })).toBeDisabled();
    });

    it('coupe une route et enregistre l’état', async () => {
        await renderPanel();
        fireEvent.click(screen.getByRole('switch', { name: 'Activer CDS Strasbourg' }));
        await waitFor(() => expect(lastPutBody().services.simbad.disabled).toEqual(['cds']));
    });

    it('applique le préréglage en un clic et signale le commit à faire', async () => {
        await renderPanel();
        fireEvent.click(screen.getByRole('button', { name: 'CDS indisponible : Harvard en premier' }));
        await waitFor(() => expect(lastPutBody().services).toEqual(CDS_DOWN_PRESET));
        expect(await screen.findByText('Choix enregistré, pas encore en production.')).toBeInTheDocument();
    });

    it('rétablit l’ordre par défaut', async () => {
        await renderPanel();
        fireEvent.click(screen.getByRole('button', { name: 'Ordre par défaut' }));
        await waitFor(() => expect(lastPutBody().services).toEqual({}));
    });

    it('prévient quand plus aucune route n’est active', async () => {
        const inactive = STATE.services[0].routes.map((r) => ({ ...r, enabled: false }));
        fetchMock.mockResolvedValue(jsonOk({ ...STATE, services: [{ ...STATE.services[0], routes: inactive }] }));
        await renderPanel();
        expect(screen.getByText('Aucune route active : ce service échouera immédiatement.')).toBeInTheDocument();
    });

    it('signale un échec de chargement', async () => {
        fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
        render(<UpstreamRoutesPanel />);
        expect(await screen.findByText('Chargement impossible : HTTP 500')).toBeInTheDocument();
    });
});
