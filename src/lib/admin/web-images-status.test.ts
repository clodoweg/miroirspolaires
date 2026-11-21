// @vitest-environment node
/**
 * Tests du rappel des versions web : liste des sources (partagée avec generate-web-images.mjs) et
 * comptage des images absentes du manifeste.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { listWebImageSources, getDisplayWidth } from './web-image-sources.mjs';
import { getWebImagesStatus } from './web-images-status';

let root: string;
let assets: string;

async function writeImage(relativePath: string, width: number, height: number) {
    const filePath = path.join(assets, relativePath);
    mkdirSync(path.dirname(filePath), { recursive: true });
    await sharp({ create: { width, height, channels: 3, background: '#336699' } })
        .jpeg()
        .toFile(filePath);
}

beforeAll(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'mp-web-images-'));
    assets = path.join(root, 'assets');
    await writeImage('blog/2026/trip/photo.jpg', 1600, 1000);
    await writeImage('blog/2026/trip/photo-thumb.jpg', 800, 500);
    await writeImage('blog/2026/trip/etroite.jpg', 300, 200);
    await writeImage('blog/.admin-trash/vieille.jpg', 1600, 1000);
    await writeImage('voyages/2025/norvege/fjord.jpg', 2000, 1300);
    await writeImage('astrophotographies/mini/2026/123_raw.jpg', 1600, 1067);
    await writeImage('astrophotographies/2026/123_raw.jpg', 4000, 2667);
    writeFileSync(path.join(assets, 'blog/2026/trip/notes.txt'), 'pas une image');
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('listWebImageSources', () => {
    it('liste les sources de chaque dossier, sans miniatures, fichiers cachés ni originaux bruts', () => {
        const keys = listWebImageSources(assets, ['astro', 'blog', 'voyages']).map((source) => source.key);
        expect(keys.sort()).toEqual([
            'astrophotographies/mini/2026/123_raw.jpg',
            'blog/2026/trip/etroite.jpg',
            'blog/2026/trip/photo.jpg',
            'voyages/2025/norvege/fjord.jpg',
        ]);
    });

    it('renvoie une liste vide pour un dossier absent', () => {
        expect(listWebImageSources(path.join(root, 'absent'), ['blog'])).toEqual([]);
    });

    it('lit la largeur affichée', async () => {
        expect(await getDisplayWidth(path.join(assets, 'blog/2026/trip/photo.jpg'))).toBe(1600);
    });
});

describe('getWebImagesStatus', () => {
    it('compte les images absentes du manifeste, sauf celles trop étroites', async () => {
        const manifestPath = path.join(root, 'web-images.json');
        writeFileSync(manifestPath, JSON.stringify({ 'blog/2026/trip/photo.jpg': [400, 800, 1200] }));
        const status = await getWebImagesStatus(assets, manifestPath);
        expect(status).toEqual({
            total: 4,
            pending: 2,
            totalByScope: { astro: 1, blog: 2, voyages: 1 },
            pendingByScope: { astro: 1, blog: 0, voyages: 1 },
            pendingSamples: ['astrophotographies/mini/2026/123_raw.jpg', 'voyages/2025/norvege/fjord.jpg'],
        });
    });

    it('considère toutes les images en attente sans manifeste lisible', async () => {
        const status = await getWebImagesStatus(assets, path.join(root, 'absent.json'));
        expect(status.pending).toBe(3);
    });
});
