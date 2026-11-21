/**
 * Tests de la correspondance entre un objet résolu et les astrophotos du site :
 * normalisation des alias, tri par année et URL de vignette selon l'environnement.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Photo } from '@/lib/photos';

const mockPhotos = vi.hoisted(() => ({ list: [] as Photo[] }));

vi.mock('@/lib/photos', () => ({
    get photos() {
        return mockPhotos.list;
    },
}));

vi.mock('@/data/web-images.json', () => ({
    default: { 'astrophotographies/mini/2023/m31.jpg': [400, 800, 1200] },
}));

function makePhoto(overrides: Partial<Photo>): Photo {
    return {
        id: 1,
        slug: 'slug',
        title: '',
        type: '',
        constellation: '',
        observatories: [],
        locations: '',
        telescope: '',
        camera: '',
        mount: '',
        integrationTime: '',
        integrationSeconds: 0,
        uploaded: '',
        year: 2020,
        ra: '',
        dec: '',
        description: '',
        objectsInField: [],
        astrobinUrl: '',
        acquisitionDetails: [],
        filters: [],
        filterString: '',
        imagePath: 'img.jpg',
        version: '',
        ...overrides,
    };
}

async function loadModule() {
    vi.resetModules();
    return import('./own-photos');
}

describe('findOwnPhotos', () => {
    beforeEach(() => {
        mockPhotos.list = [
            makePhoto({
                slug: 'andromede-2019',
                title: "Galaxie d'Andromède (M31)",
                year: 2019,
                imagePath: '2019/m31.jpg',
                version: 'v2',
            }),
            makePhoto({
                slug: 'andromede-2023',
                title: 'Andromède en HDR',
                objectsInField: ['M 31', 'M 110', 'NGC 205'],
                year: 2023,
                imagePath: '2023/m31.jpg',
            }),
            makePhoto({ slug: 'orion', title: "Nébuleuse d'Orion", objectsInField: ['M 42'], year: 2024 }),
        ];
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('trouve les photos par alias normalisé (espaces, tirets, casse) triées de la plus récente à la plus ancienne', async () => {
        vi.stubEnv('IMAGE_WORKER_URL', '');
        vi.stubEnv('PUBLIC_R2_URL', '');
        const { findOwnPhotos } = await loadModule();
        const matches = findOwnPhotos(['m-31', 'NGC 224']);
        expect(matches.map((m) => m.slug)).toEqual(['andromede-2023', 'andromede-2019']);
        expect(matches[0]).toMatchObject({
            href: '/astrophotographies/andromede-2023',
            imagePath: '2023/m31.jpg',
            year: 2023,
            thumbnailUrl: undefined,
        });
    });

    it('ignore les alias trop courts et renvoie une liste vide sans alias exploitable', async () => {
        const { findOwnPhotos } = await loadModule();
        expect(findOwnPhotos(['M', 'ab'])).toEqual([]);
        expect(findOwnPhotos(['Inconnu 999'])).toEqual([]);
    });

    it('sert la version web de 400 px de la mini, avec le paramètre de version quand il existe', async () => {
        vi.stubEnv('PUBLIC_R2_URL', 'https://r2.test');
        const { findOwnPhotos } = await loadModule();
        const [recent, old] = findOwnPhotos(['M31']);
        expect(recent.thumbnailUrl).toBe('https://r2.test/web/astrophotographies/mini/2023/m31-w400.jpg');
        // POURQUOI : sans version web, la mini elle-même, jamais l'original brut (servi entier par le worker).
        expect(old.thumbnailUrl).toBe('https://r2.test/astrophotographies/mini/2019/m31.jpg?v=v2');
    });

    it('ne renvoie pas de vignette sans URL R2', async () => {
        vi.stubEnv('PUBLIC_R2_URL', '');
        const { findOwnPhotos } = await loadModule();
        const [match] = findOwnPhotos(['M 42']);
        expect(match.slug).toBe('orion');
        expect(match.thumbnailUrl).toBeUndefined();
    });
});
