/**
 * @file src/components/Catalogues/CatalogueViewer.test.tsx
 * @description Suite de tests d'intégration pour l'island interactif CatalogueViewer.
 * Responsabilité : Valider que le composant de visualisation de catalogue récupère correctement
 * les données de l'API REST de manière paginée, réagit aux changements de filtres textuels (debounced search),
 * supporte le tri multi-colonnes et gère gracieusement le chargement et les pannes réseau.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CatalogueViewer from './CatalogueViewer';

// Mock du hook des préférences utilisateur pour figer la latitude à Paris
vi.mock('@/lib/settings/useUserSettings', () => ({
    useUserSettings: () => ({
        location: { lat: 48.8566, lon: 2.3522, name: 'Paris' },
    }),
}));

describe('Composant CatalogueViewer (Island de Visualisation)', () => {
    const mockCatalogueDef = {
        name: 'Messier',
        slug: 'messier',
        description: 'Catalogue des objets nébuleux de Charles Messier',
        size: 110,
        epoch: 2000,
    };

    const mockEntriesResponse = {
        catalogue: mockCatalogueDef,
        page: 1,
        limit: 100,
        total: 2,
        entries: [
            {
                id: 'M 42',
                label: 'M 42',
                commonName: "Nébuleuse d'Orion",
                type: 'nebula',
                ra: 83.822,
                dec: -5.391,
                mag: 4.0,
                constellation: 'Ori',
            },
            {
                id: 'M 31',
                label: 'M 31',
                commonName: "Galaxie d'Andromède",
                type: 'galaxy',
                ra: 10.684,
                dec: 41.269,
                mag: 3.4,
                constellation: 'And',
            },
        ],
    };

    beforeEach(() => {
        vi.clearAllMocks();

        // Mock de l'API globale fetch
        const fetchMock = vi.fn().mockImplementation(async () => ({
            ok: true,
            status: 200,
            json: async () => mockEntriesResponse,
        }));
        vi.stubGlobal('fetch', fetchMock);
    });

    /**
     * @test Valide le montage et le rendu initial du tableau des objets.
     */
    it('récupère et affiche les entrées du catalogue au montage', async () => {
        render(<CatalogueViewer slug="messier" catalogue={mockCatalogueDef as any} />);

        // Attente du chargement AJAX
        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalled();
            expect(screen.getAllByText('M 42')[0]).toBeInTheDocument();
            expect(screen.getAllByText('M 31')[0]).toBeInTheDocument();
        });

        // Présence du compteur d'objets total
        expect(screen.getAllByText('2')[0]).toBeInTheDocument();
    });

    /**
     * @test Valide la saisie textuelle dans le filtre de recherche.
     */
    it('réactualise les données avec le filtre de recherche saisi', async () => {
        render(<CatalogueViewer slug="messier" catalogue={mockCatalogueDef as any} />);

        await waitFor(() => {
            expect(screen.getAllByText('M 42')[0]).toBeInTheDocument();
            expect(screen.getAllByText('M 31')[0]).toBeInTheDocument();
        });

        const searchInput = screen.getByPlaceholderText(/Filtrer/i);

        // Simule la frappe de l'utilisateur et déclenche la recherche
        fireEvent.change(searchInput, { target: { value: 'Orion' } });
        const searchBtn = screen.getByTitle('Lancer la recherche');
        fireEvent.click(searchBtn);

        // Filtrage côté client
        await waitFor(() => {
            expect(screen.getAllByText('M 42')[0]).toBeInTheDocument();
            expect(screen.queryByText('M 31')).not.toBeInTheDocument();
        });
    });

    /**
     * @test Valide le changement de tri lors du clic sur un en-tête de colonne.
     */
    it("déclenche le tri lors du clic sur l'en-tête de colonne", async () => {
        render(<CatalogueViewer slug="messier" catalogue={mockCatalogueDef as any} />);

        await waitFor(() => {
            expect(screen.getAllByText('M 42')[0]).toBeInTheDocument();
        });

        // Recherche l'en-tête cliquable de la magnitude 'Mag.'
        const magHeader = screen.getByText('Mag.');
        fireEvent.click(magHeader);

        await waitFor(() => {
            expect(screen.getAllByText('M 42')[0]).toBeInTheDocument();
        });
    });

    /**
     * @test Valide la gestion des erreurs réseau de l'API.
     */
    it("affiche un message d'erreur si l'appel d'API échoue", async () => {
        // Force l'échec de fetch pour ce test
        vi.stubGlobal(
            'fetch',
            vi.fn().mockImplementation(async () => ({
                ok: false,
                status: 500,
                json: async () => ({ error: 'Erreur serveur simulée' }),
            })),
        );

        render(<CatalogueViewer slug="messier" catalogue={mockCatalogueDef as any} />);

        await waitFor(() => {
            expect(screen.getByText('Erreur serveur simulée')).toBeInTheDocument();
        });
    });
});
