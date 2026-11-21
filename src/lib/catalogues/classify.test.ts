/**
 * Tests de l'étiquetage des types d'objets et de leur regroupement en
 * cinq catégories de filtre.
 */

import { describe, it, expect } from 'vitest';
import { categorize, typeLabel } from './classify';

describe('typeLabel', () => {
    it('traduit les codes connus en libellés français', () => {
        expect(typeLabel('Pl')).toBe('Nébuleuse planétaire');
        expect(typeLabel(' Gb ')).toBe('Amas globulaire');
        expect(typeLabel('dark_nebula')).toBe('Nébuleuse obscure');
    });

    it('renvoie le code nettoyé quand il est inconnu et un tiret quand il est absent', () => {
        expect(typeLabel('  Galaxie Sb ')).toBe('Galaxie Sb');
        expect(typeLabel()).toBe('—');
        expect(typeLabel('')).toBe('—');
    });
});

describe('categorize', () => {
    it.each([
        ['Gx', 'Galaxie'],
        ['Sy2', 'Galaxie'],
        ['Groupe compact (4 galaxies)', 'Galaxie'],
        ['Amas de galaxies (II)', 'Galaxie'],
        ['OC', 'Amas'],
        ['As*', 'Amas'],
        ['C+N', 'Amas'],
        ['open_cluster', 'Amas'],
        ['PN', 'Nébuleuse'],
        ['H II elliptique', 'Nébuleuse'],
        ['SNR', 'Nébuleuse'],
        ['sh', 'Nébuleuse'],
        ['ISM', 'Nébuleuse'],
        ['WR*', 'Étoile'],
        ['**', 'Étoile'],
        ['star', 'Étoile'],
        ['-', 'Autre'],
        ['Quasar', 'Autre'],
    ] as const)('classe « %s » dans « %s »', (raw, expected) => {
        expect(categorize(raw)).toBe(expected);
    });

    it('classe un type absent dans « Autre »', () => {
        expect(categorize()).toBe('Autre');
        expect(categorize('')).toBe('Autre');
    });
});
