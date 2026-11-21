/**
 * Tests de l'extraction d'identifiant de catalogue depuis un texte libre.
 */

import { describe, it, expect } from 'vitest';
import { extractCatalogueId } from './extract-catalogue-id';

describe('extractCatalogueId', () => {
    it.each([
        ['M42', 'M 42'],
        ['NGC7000', 'NGC 7000'],
        ['ic 434', 'IC 434'],
        ['Sh2-155', 'Sh2 155'],
        ['vdb 152', 'vdB 152'],
        ['barnard 33', 'Barnard 33'],
        ['ldn 1251', 'LDN 1251'],
        ['Abell 2151', 'Abell 2151'],
        ['Galaxie de Barnard (NGC 6822)', 'NGC 6822'],
    ])('canonise « %s » en « %s »', (input, expected) => {
        expect(extractCatalogueId(input)).toBe(expected);
    });

    it('ignore les sources vides et retient la première qui contient un identifiant', () => {
        expect(extractCatalogueId(undefined, null, '', 'Nébuleuse sans numéro', 'Champ autour de IC 1396')).toBe(
            'IC 1396',
        );
    });

    it('renvoie null quand aucune source ne contient d’identifiant', () => {
        expect(extractCatalogueId('Voie lactée', undefined)).toBeNull();
        expect(extractCatalogueId()).toBeNull();
    });
});
