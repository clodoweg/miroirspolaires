/**
 * Tests de la recherche dans le catalogue de matériel (caméras, télescopes,
 * accessoires) et de la récupération par identifiant.
 */

import { describe, it, expect } from 'vitest';
import {
    findAccessory,
    findCamera,
    findTelescope,
    searchAccessories,
    searchCameras,
    searchTelescopes,
} from './catalog';

describe('recherche de matériel', () => {
    it('renvoie les premiers éléments, limités, pour une requête vide', () => {
        expect(searchCameras('')).toHaveLength(10);
        expect(searchTelescopes('   ', 3)).toHaveLength(3);
        expect(searchAccessories('', 5)).toHaveLength(5);
    });

    it('classe en tête les correspondances qui commencent le plus tôt', () => {
        const results = searchCameras('qhy600');
        expect(results[0].id).toBe('qhy600');
        expect(results.every((c) => `${c.brand} ${c.name}`.toLowerCase().includes('qhy600'))).toBe(true);
    });

    it('accepte des jetons dans le désordre et ignore les accents', () => {
        const telescopes = searchTelescopes('cdk17 planewave');
        expect(telescopes.map((t) => t.id)).toContain('pw-cdk17');

        const accessories = searchAccessories('REDUCTEUR 0.79x generique');
        expect(accessories.map((a) => a.id)).toContain('generic-red-079');
    });

    it('renvoie une liste vide quand rien ne correspond', () => {
        expect(searchCameras('zzz introuvable')).toEqual([]);
    });
});

describe('recherche par identifiant', () => {
    it('trouve chaque type de matériel par son id', () => {
        expect(findCamera('qhy600')).toMatchObject({ sensorWidthMm: 36, pixelSizeUm: 3.76 });
        expect(findTelescope('pw-cdk17')).toMatchObject({ focalLengthMm: 2939 });
        expect(findAccessory('generic-red-080')).toMatchObject({ focalMultiplier: 0.8 });
    });

    it('renvoie undefined pour un id absent ou inconnu', () => {
        expect(findCamera(undefined)).toBeUndefined();
        expect(findTelescope('')).toBeUndefined();
        expect(findAccessory(undefined)).toBeUndefined();
        expect(findCamera('inconnue')).toBeUndefined();
        expect(findTelescope('inconnu')).toBeUndefined();
        expect(findAccessory('inconnu')).toBeUndefined();
    });
});
