/**
 * @file src/components/Recommendations/RecommendationsViewer.test.tsx
 * @description Suite de tests d'intégration pour l'island interactif RecommendationsViewer.
 * Responsabilité : Valider que le composant de recommandations astronomiques affiche correctement
 * le payload SSR initial sans requête redondante, réagit au changement de date/localisation,
 * filtre les résultats côté client et tolère les dysfonctionnements du backend de notation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RecommendationsViewer from './RecommendationsViewer';
import type { ObsLocation } from '@/lib/objects/observation';

// Mock du hook global pour figer les réglages utilisateur
const stableLocation = { lat: 48.8566, lon: 2.3522, name: 'Paris' };
const stableCamera = { sensorWidth: 22.3, sensorHeight: 14.9, focalLength: 400, rotationDeg: 0, focalMultiplier: 1 };

vi.mock('@/lib/settings/useUserSettings', () => ({
    useUserSettings: () => ({
        location: stableLocation,
        camera: stableCamera,
        isLocationCustom: false,
        isCameraCustom: false,
        setLocation: vi.fn(),
        setCamera: vi.fn(),
        resetLocation: vi.fn(),
        resetCamera: vi.fn(),
    }),
}));

describe('Composant RecommendationsViewer (Island de Recommandations)', () => {
    const mockParis: ObsLocation = { lat: 48.8566, lon: 2.3522, name: 'Paris' };

    // Payload de test simulant le rendu initial SSR côté serveur
    const mockInitialData = {
        referenceMonthStart: '2026-05-01T00:00:00.000Z',
        poolSize: 320,
        location: mockParis,
        items: [
            {
                id: 'M 42',
                label: 'M 42',
                commonName: "Nébuleuse d'Orion",
                type: 'nebula',
                ra: 83.822,
                dec: -5.391,
                mag: 4.0,
                constellation: 'Ori',
                catalogue: 'messier',
                peakMonthStart: '2026-12-01T00:00:00.000Z',
                peakAltDeg: 35.8,
                peakOffset: 1 as const,
                nightHoursAbove30: 4.5,
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
                catalogue: 'messier',
                peakMonthStart: '2026-10-01T00:00:00.000Z',
                peakAltDeg: 82.4,
                peakOffset: 0 as const,
                nightHoursAbove30: 8.0,
            },
        ],
    };

    beforeEach(() => {
        vi.clearAllMocks();

        // Mock de l'appel d'API fetch global
        const fetchMock = vi.fn().mockImplementation(async () => ({
            ok: true,
            status: 200,
            json: async () => ({
                referenceMonthStart: '2026-05-01T00:00:00.000Z',
                poolSize: 320,
                location: mockParis,
                items: [mockInitialData.items[0]], // Retourne uniquement Orion lors du fetch
            }),
        }));
        vi.stubGlobal('fetch', fetchMock);
    });

    /**
     * @test Valide le bon fonctionnement du court-circuit de fetch lorsque les données SSR initiales sont fournies.
     */
    it('affiche directement les données initiales SSR sans faire de requête API au montage', () => {
        render(<RecommendationsViewer initialData={mockInitialData as any} initialDate="2026-05-26T12:00:00.000Z" />);

        // Les deux objets issus du SSR doivent être visibles immédiatement
        expect(screen.getAllByText('M 42')[0]).toBeInTheDocument();
        expect(screen.getAllByText('M 31')[0]).toBeInTheDocument();

        // L'API n'a pas été appelée puisque les données initiales étaient renseignées
        expect(global.fetch).not.toHaveBeenCalled();
    });

    /**
     * @test Valide le filtrage instantané côté client des objets recommandés.
     */
    it('filtre les recommandations côté client via le champ de recherche textuel', () => {
        render(<RecommendationsViewer initialData={mockInitialData as any} initialDate="2026-05-26T12:00:00.000Z" />);

        const searchInput = screen.getByPlaceholderText(/Filtrer/i);

        // Simule la frappe "Andromède"
        fireEvent.change(searchInput, { target: { value: 'Andromède' } });
        fireEvent.keyDown(searchInput, { key: 'Enter', code: 'Enter' });

        // Seule la galaxie d'Andromède doit demeurer à l'écran
        expect(screen.getAllByText('M 31')[0]).toBeInTheDocument();
        expect(screen.queryByText('M 42')).not.toBeInTheDocument();
    });

    /**
     * @test Valide le chargement asynchrone lorsque l'état de date initiale change.
     */
    it('lance une requête de rechargement API lorsque la date ou la configuration change', async () => {
        // Monte sans données initiales pour forcer l'asynchronisme
        render(<RecommendationsViewer initialData={null} initialDate="2026-05-26T12:00:00.000Z" />);

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalled();
            expect(screen.getAllByText('M 42')[0]).toBeInTheDocument();
        });
    });

    /**
     * @test Valide l'affichage d'erreurs en cas de défaillance du backend de recommandations.
     */
    it("affiche un bandeau d'erreur explicite si le service de recommandation échoue", async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockImplementation(async () => ({
                ok: false,
                status: 500,
                json: async () => ({ error: 'Service de calcul indisponible' }),
            })),
        );

        render(<RecommendationsViewer initialData={null} initialDate="2026-05-26T12:00:00.000Z" />);

        await waitFor(() => {
            expect(screen.getByText('Service de calcul indisponible')).toBeInTheDocument();
        });
    });
});
