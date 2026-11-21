/**
 * Tests du transport ASU sur des réponses réelles de VizieR, enregistrées dans `src/test/fixtures/vizier-asu/`.
 */

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { buildAsuUrl, parseAsuTsv, parseDeclination, parseRightAscension } from './asu';

const fixture = (name: string) => readFileSync(`src/test/fixtures/vizier-asu/${name}.tsv`, 'utf-8');

describe('parseRightAscension', () => {
    it.each([
        ['00 00.1', 0.025],
        ['17 45', 266.25],
        ['15 52 48.0', 238.2],
        ['00 42 44.33', 10.684708],
    ])('%s donne %f°', (value, degrees) => {
        expect(parseRightAscension(value)).toBeCloseTo(degrees, 6);
    });

    it.each(['', '12', '1 2 3 4', 'ab cd'])('refuse « %s »', (value) => {
        expect(parseRightAscension(value)).toBeNull();
    });
});

describe('parseDeclination', () => {
    it.each([
        ['+32 45', 32.75],
        ['-72 21.5', -72.358333],
        ['-38 00 00', -38],
        ['-27 22 10.0', -27.369444],
        ['+08 09 19', 8.155278],
    ])('%s donne %f°', (value, degrees) => {
        expect(parseDeclination(value)).toBeCloseTo(degrees, 6);
    });

    it('garde le signe d’une déclinaison proche de zéro', () => {
        expect(parseDeclination('-00 30')).toBe(-0.5);
    });

    it('refuse une valeur illisible', () => {
        expect(parseDeclination('nord')).toBeNull();
    });
});

describe('buildAsuUrl', () => {
    it('demande toutes les lignes et encode la table et les colonnes', () => {
        const url = buildAsuUrl('https://miroir/asu-tsv', { table: 'VII/118/ngc2000', columns: ['Name', 'mag'] });
        expect(url).toBe('https://miroir/asu-tsv?-source=VII%2F118%2Fngc2000&-out.max=unlimited&-out=Name%2Cmag');
    });

    it('garde le padding d’un filtre en %20, car un + ne trouve pas la ligne', () => {
        const url = buildAsuUrl('https://miroir/asu-tsv', {
            table: 'VII/118/ngc2000',
            columns: ['Name'],
            constraints: { Name: '  224' },
        });
        expect(url).toContain('Name=%20%20224');
    });
});

describe('parseAsuTsv', () => {
    it('NGC : convertit les coordonnées, type les nombres et rend null pour une valeur manquante', () => {
        const columns = ['Name', 'Type', 'RAB2000', 'DEB2000', 'mag', 'size', 'Const', 'Desc'];
        const { cols, rows } = parseAsuTsv(fixture('ngc'), columns);
        expect(cols).toEqual(columns);
        expect(rows[0]).toEqual(['I5370', ' Gx', 0.025, 32.75, 15, 0.7, 'And', 'pB, S, R, stell N']);
        expect(rows[1].slice(1, 6)).toEqual([null, 0.05, 32.816667, null, null]);
    });

    it('rend les colonnes dans l’ordre demandé, même différent de la réponse', () => {
        const { rows } = parseAsuTsv(fixture('ngc'), ['mag', 'Name']);
        expect(rows[0]).toEqual([15, 'I5370']);
    });

    it('garde une colonne déjà en degrés (vdB)', () => {
        const { rows } = parseAsuTsv(fixture('vdb'), ['VdB', '_RA', '_DE']);
        expect(rows[0]).toEqual([1, 2.69319, 58.76952]);
    });

    it('lit les formats de coordonnées réels de chaque table', () => {
        const coordinates = (name: string, ra: string, dec: string) => parseAsuTsv(fixture(name), [ra, dec]).rows[0];
        expect(coordinates('sharpless', 'RA1900', 'DE1900')).toEqual([238.2, -25.833333]);
        expect(coordinates('barnard', 'RA1875', 'DE1875')).toEqual([51.308333, 30.733333]);
        expect(coordinates('gc', 'RA1950', 'DE1950')).toEqual([5.470833, -72.358333]);
    });

    it('lit une réponse sans ligne d’unités, omise quand aucune colonne n’a d’unité', () => {
        expect(parseAsuTsv(fixture('sh2-no-unit'), ['Sh2'], true).rows).toEqual([[155]]);
    });

    it('lève une erreur sur un en-tête sans ligne de séparation', () => {
        const broken = fixture('sh2-no-unit').replace(/^-+$/m, 'pas de tirets');
        expect(() => parseAsuTsv(broken, ['Sh2'])).toThrow('en-tête illisible');
    });

    it('lève une erreur sur une colonne absente, que VizieR ignore en répondant 200', () => {
        expect(() => parseAsuTsv(fixture('unknown-column'), ['NGC', 'RAJ2000'])).toThrow(
            'colonnes absentes (NGC, RAJ2000)',
        );
    });

    it('lève une erreur sur une table inconnue', () => {
        expect(() => parseAsuTsv(fixture('unknown-table'), ['A', 'B'])).toThrow('colonnes absentes');
    });

    it('accepte une recherche filtrée sans résultat, mais pas une table complète vide', () => {
        const columns = ['Name', 'Type', 'mag'];
        expect(parseAsuTsv(fixture('no-match'), columns, true).rows).toEqual([]);
        expect(() => parseAsuTsv(fixture('no-match'), columns)).toThrow('table vide');
    });

    it('lève une erreur sur une coordonnée illisible, plutôt que de placer l’objet en 0,0', () => {
        const corrupted = fixture('gc').replace('00 21 53', 'n/a');
        expect(() => parseAsuTsv(corrupted, ['IAU', 'RA1950'])).toThrow('coordonnée illisible « n/a » (RA1950)');
    });
});
