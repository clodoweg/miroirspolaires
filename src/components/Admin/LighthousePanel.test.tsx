/**
 * @file src/components/Admin/LighthousePanel.test.tsx
 * @description Suite de tests d'intégration pour le panneau d'audit Lighthouse.
 * Responsabilité : Valider le rendu des jauges de performance, le filtrage de la
 * liste des pages par recherche textuelle, par criticité et par groupe, et le mock de SSE.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LighthousePanel from './LighthousePanel';

// Rapport d'audit de simulation (mock)
const mockReport = {
    target: 'https://www.miroirspolaires.fr',
    mode: 'production',
    timestamp: '2026-05-26T12:00:00.000Z',
    durationSeconds: 150,
    summary: {
        averagePerformance: 78,
        averageAccessibility: 95,
        averageBestPractices: 96,
        averageSeo: 100,
    },
    results: [
        {
            path: '/',
            name: 'Accueil',
            group: 'pages_principales',
            scores: {
                performance: 92,
                accessibility: 96,
                bestPractices: 100,
                seo: 100,
            },
            metrics: {
                lcp: 1200,
                cls: 0.0,
                tbt: 0,
                fcp: 800,
                ttfb: 150,
                totalBytes: 500000,
            },
        },
        {
            path: '/astrophotographies',
            name: 'Astrophotographies (Listing)',
            group: 'pages_principales',
            scores: {
                performance: 45, // Score rouge (< 50)
                accessibility: 94,
                bestPractices: 96,
                seo: 100,
            },
            metrics: {
                lcp: 4500,
                cls: 0.002,
                tbt: 120,
                fcp: 1400,
                ttfb: 280,
                totalBytes: 2500000,
            },
        },
    ],
};

describe('Composant LighthousePanel (Dashboard de Performance)', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Mock global de fetch pour simuler le chargement d'API
        global.fetch = vi.fn().mockImplementation((url) => {
            if (String(url).includes('/api/admin/lighthouse/report')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve(mockReport),
                } as any);
            }
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve([]),
            } as any);
        });

        // Mock global d'EventSource (SSE) inexistant dans l'environnement Happy DOM
        global.EventSource = vi.fn().mockImplementation(
            () =>
                ({
                    close: vi.fn(),
                    addEventListener: vi.fn(),
                    removeEventListener: vi.fn(),
                    onerror: null,
                    onmessage: null,
                    onopen: null,
                }) as any,
        ) as any;
    });

    /**
     * @test Valide le montage et la présence des scores moyens globaux calculés.
     */
    it('affiche correctement le résumé global et les jauges de performance', async () => {
        render(<LighthousePanel />);

        // Attendre le chargement de l'API de simulation
        await waitFor(() => {
            expect(screen.getByText('https://www.miroirspolaires.fr')).toBeInTheDocument();
        });

        // Validation des scores moyens
        expect(screen.getAllByText('78')[0]).toBeInTheDocument(); // Perf moyenne
        expect(screen.getAllByText('95')[0]).toBeInTheDocument(); // A11y moyenne
        expect(screen.getAllByText('96')[0]).toBeInTheDocument(); // Bonnes Pratiques moyenne
        expect(screen.getAllByText('100')[0]).toBeInTheDocument(); // SEO moyenne

        // Présence de la liste des pages auditées
        expect(screen.getByText('Accueil')).toBeInTheDocument();
        expect(screen.getByText('Astrophotographies (Listing)')).toBeInTheDocument();
    });

    /**
     * @test Valide que le champ de recherche textuel filtre correctement la liste des pages.
     */
    it("filtre les lignes d'audit à la saisie de mots-clés dans la barre de recherche", async () => {
        render(<LighthousePanel />);

        await waitFor(() => {
            expect(screen.getByText('Accueil')).toBeInTheDocument();
        });

        const searchInput = screen.getByPlaceholderText(/Rechercher une page/i);

        // Saisie "astrophoto" pour isoler le listing d'astrophotographies
        fireEvent.change(searchInput, { target: { value: 'astrophoto' } });

        // Seul le listing astrophoto doit être rendu
        expect(screen.getByText('Astrophotographies (Listing)')).toBeInTheDocument();
        expect(screen.queryByText('Accueil')).not.toBeInTheDocument();
    });

    /**
     * @test Valide le fonctionnement du filtrage par criticité de scores (filtre "red" / rouge).
     */
    it('filtre les pages par niveau de score lors du clic sur le filtre de score rouge', async () => {
        render(<LighthousePanel />);

        await waitFor(() => {
            expect(screen.getByText('Accueil')).toBeInTheDocument();
        });

        // Identifier le bouton de filtre "Critique (<50)"
        const redFilterButton = screen.getByText(/Critique/i);
        fireEvent.click(redFilterButton);

        // Seule la page astrophoto (Performance 45) doit s'afficher car l'accueil (92) est verte
        expect(screen.getByText('Astrophotographies (Listing)')).toBeInTheDocument();
        expect(screen.queryByText('Accueil')).not.toBeInTheDocument();
    });
});
