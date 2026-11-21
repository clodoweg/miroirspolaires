/**
 * @file src/components/UI/GlobalStatsCards.test.tsx
 * @description Suite de tests pour le composant GlobalStatsCards.
 * Responsabilité : Valider les calculs d'intégration d'heures et de poses,
 * ainsi que le rendu visuel conforme du composant React.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import GlobalStatsCards from './GlobalStatsCards';
import type { Photo } from '@/lib/photos';

describe('Composant GlobalStatsCards', () => {
    // Mock de données de photographies
    const mockPhotos: Photo[] = [
        {
            id: 'photo-1',
            title: "Nébuleuse d'Orion",
            slug: 'la-nebuleuse-d-orion',
            category: 'Ciel Profond',
            integrationSeconds: 7200, // 2 heures
            acquisitionDetails: [
                { number: 20, duration: 360 }, // 20 poses
            ],
        } as unknown as Photo,
        {
            id: 'photo-2',
            title: "Galaxie d'Andromède",
            slug: 'la-galaxie-d-andromede',
            category: 'Galaxies',
            integrationSeconds: 12600, // 3.5 heures (12600s / 3600 = 3.5)
            acquisitionDetails: [
                { number: 30, duration: 300 }, // 30 poses
                { number: 15, duration: 120 }, // 15 poses
            ],
        } as unknown as Photo,
    ];

    /**
     * @test Valide le calcul mathématique cumulé et le rendu des cartes.
     */
    it("calcule et affiche correctement les statistiques d'intégration et de poses", () => {
        render(<GlobalStatsCards photos={mockPhotos} />);

        // 1. Nombre total de photos
        expect(screen.getByText('2')).toBeInTheDocument();
        expect(screen.getByText('Astrophotographies')).toBeInTheDocument();

        // 2. Temps d'intégration total
        // Somme = 7200 + 12600 = 19800 secondes. Math.floor(19800 / 3600) = 5 heures
        expect(screen.getByText('5h')).toBeInTheDocument();
        expect(screen.getByText("Temps d'intégration total")).toBeInTheDocument();

        // 3. Nombre cumulé de poses unitaires
        // Somme = 20 (Photo 1) + 30 (Photo 2) + 15 (Photo 2) = 65 poses
        expect(screen.getByText('65')).toBeInTheDocument();
        expect(screen.getByText('Nombre de poses unitaires')).toBeInTheDocument();
    });

    /**
     * @test Vérifie le comportement sain en cas de tableau vide ou de valeurs indéfinies.
     */
    it('gère gracieusement un tableau de photos vide ou sans détails', () => {
        render(<GlobalStatsCards photos={[]} />);

        expect(screen.getByText('0h')).toBeInTheDocument();
        // Deux occurrences de "0" (photos et poses) - JSDOM contient deux balises affichant "0"
        const zeroElements = screen.queryAllByText('0');
        expect(zeroElements.length).toBe(2);
    });

    /**
     * @test Vérifie la robustesse si les champs techniques facultatifs sont absents des données.
     */
    it("gère de manière robuste l'absence de champs optionnels (acquisitionDetails, integrationSeconds)", () => {
        const minimalPhotos = [
            {
                id: 'minimal-1',
                title: 'Lune',
                // Pas de integrationSeconds, pas de acquisitionDetails
            } as unknown as Photo,
        ];

        render(<GlobalStatsCards photos={minimalPhotos} />);

        expect(screen.getByText('1')).toBeInTheDocument(); // 1 photo
        expect(screen.getByText('0h')).toBeInTheDocument(); // 0 heures

        // Poses unitaires par défaut à 0
        const zeroElements = screen.queryAllByText('0');
        expect(zeroElements.length).toBe(1); // 0 poses
    });
});
