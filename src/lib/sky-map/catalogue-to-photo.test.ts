/**
 * Tests de l'adaptation d'une entrée de catalogue en `Photo` synthétique pour
 * la carte du ciel.
 */

import { describe, it, expect } from 'vitest';
import { catalogueEntryToPhoto } from './catalogue-to-photo';

describe('catalogueEntryToPhoto', () => {
    it('produit une photo synthétique liée à l’explorateur avec vignette hips2fits', () => {
        const photo = catalogueEntryToPhoto({
            id: 'M 31',
            label: 'M 31',
            commonName: "Galaxie d'Andromède",
            ra: 10.684708,
            dec: 41.26875,
            type: 'G',
            constellation: 'And',
            mag: 3.4,
            sizeArcmin: 190,
        });
        expect(photo).toMatchObject({
            slug: 'M 31',
            title: "M 31 — Galaxie d'Andromède",
            type: 'Galaxie',
            constellation: 'Andromède',
            ra: '10.684708',
            dec: '41.26875',
            raVal: 10.684708,
            decVal: 41.26875,
            description: 'Galaxie',
            version: 'catalogue',
            href: '/objets?q=M%2031',
            mag: 3.4,
        });
        expect(Number.isInteger(photo.id)).toBe(true);
        expect(photo.id).toBeGreaterThanOrEqual(0);
        const thumb = new URL(photo.thumbnailUrl ?? '');
        expect(thumb.hostname).toBe('alasky.cds.unistra.fr');
        expect(thumb.searchParams.get('width')).toBe('200');
        expect(thumb.searchParams.get('fov')).toBe('2.0000');
    });

    it('donne un identifiant numérique stable pour un même id', () => {
        const entry = { id: 'NGC 7000', label: 'NGC 7000', ra: 314.7, dec: 44.3 };
        expect(catalogueEntryToPhoto(entry).id).toBe(catalogueEntryToPhoto({ ...entry }).id);
        expect(catalogueEntryToPhoto(entry).id).not.toBe(catalogueEntryToPhoto({ ...entry, id: 'NGC 7001' }).id);
    });

    it('n’ajoute pas un nom commun identique à la désignation et gère les champs absents', () => {
        const photo = catalogueEntryToPhoto({
            id: 'M 2',
            label: 'M 2',
            commonName: 'M  2',
            ra: 323.36,
            dec: -0.82,
            description: 'Amas globulaire du Verseau',
        });
        expect(photo.title).toBe('M 2');
        expect(photo.constellation).toBe('');
        expect(photo.type).toBe('Autre');
        expect(photo.description).toBe('Amas globulaire du Verseau');
        expect(photo.mag).toBeUndefined();
    });
});
