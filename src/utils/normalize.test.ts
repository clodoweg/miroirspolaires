import { describe, it, expect } from 'vitest';
import { foldAccents, normalizeCatalog, slugify, stripAccents } from './normalize';

describe('stripAccents et foldAccents', () => {
    it('retire les diacritiques en gardant la casse', () => {
        expect(stripAccents('Nébuleuse Çà et Là')).toBe('Nebuleuse Ca et La');
    });

    it('passe en minuscules sans accents, sans retirer les espaces', () => {
        expect(foldAccents(' Écharpe d’Andromède ')).toBe(' echarpe d’andromede ');
    });
});

describe('slugify', () => {
    it('produit un slug d’URL sans accents ni séparateurs en bord', () => {
        expect(slugify("La Nébuleuse d'Orion (M42) !")).toBe('la-nebuleuse-d-orion-m42');
        expect(slugify('  --NGC 7000--  ')).toBe('ngc-7000');
    });
});

describe('normalizeCatalog', () => {
    it('sépare préfixe et numéro et retire les accents', () => {
        expect(normalizeCatalog('NGC765 Nébuleuse')).toBe('NGC 765 Nebuleuse');
    });
});
