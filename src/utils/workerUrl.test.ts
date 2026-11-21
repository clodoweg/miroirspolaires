import { describe, it, expect } from 'vitest';
import { composeWorkerUrl, DEFAULT_IMAGE_WORKER_URL } from './workerUrl';

describe('composeWorkerUrl', () => {
    it('produit le format w_,q_,f_ attendu par le worker et ses clés de cache', () => {
        expect(
            composeWorkerUrl(DEFAULT_IMAGE_WORKER_URL, 'astrophotographies/mini/2025/1.jpg', {
                width: 300,
                quality: 70,
            }),
        ).toBe('https://images.miroirspolaires.fr/w_300,q_70,f_jpeg/astrophotographies/mini/2025/1.jpg');
    });

    it('normalise les barres obliques et applique les défauts (q85, jpeg)', () => {
        expect(composeWorkerUrl('https://w.example/', '/blog/a.jpg', { width: 800 })).toBe(
            'https://w.example/w_800,q_85,f_jpeg/blog/a.jpg',
        );
    });
});
