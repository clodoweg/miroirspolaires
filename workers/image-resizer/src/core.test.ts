// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
    DEFAULT_ALLOWED_ORIGIN,
    MAX_RESIZE_BYTES,
    computeTargetSize,
    corsHeaders,
    getPassthroughReason,
    isPurgeAuthorized,
    parseImageRequest,
    resolveAllowedOrigin,
} from './core';

describe('resolveAllowedOrigin', () => {
    it.each([
        'https://miroirspolaires.fr',
        'https://www.miroirspolaires.fr',
        'http://localhost:4321',
        'https://psaltery.org',
        'https://www.psaltery.org',
    ])('accepte %s', (origin) => {
        expect(resolveAllowedOrigin(origin)).toBe(origin);
    });

    it.each([
        'https://miroirspolaires.fr.evil.com',
        'https://psaltery.org.attacker.net',
        'http://localhost:43210',
        'http://miroirspolaires.fr',
        'null',
        'pas une url',
    ])('refuse %s (ancien contrôle par startsWith)', (origin) => {
        expect(resolveAllowedOrigin(origin)).toBeNull();
    });

    it('renvoie null sans en-tête Origin', () => {
        expect(resolveAllowedOrigin(null)).toBeNull();
    });
});

describe('corsHeaders', () => {
    it('reflète une origine autorisée et ajoute Vary: Origin', () => {
        expect(corsHeaders('https://psaltery.org')).toEqual({
            'Access-Control-Allow-Origin': 'https://psaltery.org',
            Vary: 'Origin',
        });
    });

    it('renvoie le site par défaut pour une origine inconnue', () => {
        expect(corsHeaders('https://evil.example')['Access-Control-Allow-Origin']).toBe(DEFAULT_ALLOWED_ORIGIN);
    });
});

describe('isPurgeAuthorized', () => {
    it('refuse toute purge si PURGE_KEY n’est pas configuré (échec fermé)', async () => {
        expect(await isPurgeAuthorized('n’importe quoi', undefined)).toBe(false);
        expect(await isPurgeAuthorized('', '')).toBe(false);
    });

    it('refuse une clé absente ou différente, y compris de longueur différente', async () => {
        expect(await isPurgeAuthorized(null, 'secret')).toBe(false);
        expect(await isPurgeAuthorized('secreT', 'secret')).toBe(false);
        expect(await isPurgeAuthorized('secret-plus-long', 'secret')).toBe(false);
    });

    it('accepte la bonne clé', async () => {
        expect(await isPurgeAuthorized('s3cr3t-key', 's3cr3t-key')).toBe(true);
    });
});

describe('parseImageRequest', () => {
    const parse = (path: string) => parseImageRequest(new URL(`https://images.miroirspolaires.fr${path}`));

    it('lit le segment d’options et la clé', () => {
        expect(parse('/w_800,q_75,f_jpeg/blog/2026/slug/photo.jpg')).toEqual({
            key: 'blog/2026/slug/photo.jpg',
            options: { width: 800, height: 0, quality: 75, format: 'jpeg' },
        });
    });

    it('reconnaît un segment d’options qui ne commence pas par w_', () => {
        expect(parse('/q_60,f_jpeg/voyages/a.jpg').options.quality).toBe(60);
        expect(parse('/h_300/voyages/a.jpg').options.height).toBe(300);
    });

    it('ramène les valeurs invalides aux défauts et borne les extrêmes', () => {
        expect(parse('/w_abc,q_abc/a.jpg').options).toMatchObject({ width: 0, quality: 80 });
        expect(parse('/w_99999,h_-5,q_500/a.jpg').options).toMatchObject({ width: 4000, height: 0, quality: 100 });
        expect(parse('/w_800,q_0/a.jpg').options.quality).toBe(1);
    });

    it('produit toujours du JPEG sauf demande explicite de PNG', () => {
        expect(parse('/w_400,f_webp/a.jpg').options.format).toBe('jpeg');
        expect(parse('/w_400,f_png/a.png').options.format).toBe('png');
    });

    it('accepte les options en query string sans segment d’options', () => {
        expect(parse('/astrophotographies/2026/x.jpg?w=1200&q=70')).toEqual({
            key: 'astrophotographies/2026/x.jpg',
            options: { width: 1200, height: 0, quality: 70, format: 'jpeg' },
        });
    });

    it('décode les clés encodées (espaces, accents)', () => {
        expect(parse('/w_400/blog/2026/slug/vue%20du%20fjord%C3%A9.jpg').key).toBe('blog/2026/slug/vue du fjordé.jpg');
    });

    it('renvoie une clé vide pour un chemin sans fichier', () => {
        expect(parse('/w_400').key).toBe('');
    });
});

describe('getPassthroughReason', () => {
    it('sert tels quels les fichiers non image, les vignettes et les sources lourdes', () => {
        expect(getPassthroughReason('blog/2026/notes.md', 10)).toBe('not-image');
        expect(getPassthroughReason('astrophotographies/mini/2025/1.jpg', 10)).toBe('presized');
        expect(getPassthroughReason('voyages/2025/a/img-4-thumb.jpg', 10)).toBe('presized');
        expect(getPassthroughReason('voyages/2025/a/img-4.jpg', MAX_RESIZE_BYTES + 1)).toBe('too-heavy');
    });

    it('autorise le redimensionnement d’une image légère', () => {
        expect(getPassthroughReason('voyages/2025/a/img-4.jpg', MAX_RESIZE_BYTES)).toBeNull();
    });
});

describe('computeTargetSize', () => {
    const original = { width: 1600, height: 1000 };

    it('conserve le ratio quand seule la largeur est demandée', () => {
        expect(computeTargetSize(original, { width: 800, height: 0 })).toEqual({ width: 800, height: 500 });
    });

    it('conserve le ratio quand seule la hauteur est demandée', () => {
        expect(computeTargetSize(original, { width: 0, height: 500 })).toEqual({ width: 800, height: 500 });
    });

    it('n’agrandit jamais et ne fait rien si la taille est déjà bonne', () => {
        expect(computeTargetSize(original, { width: 4000, height: 0 })).toBeNull();
        expect(computeTargetSize(original, { width: 0, height: 0 })).toBeNull();
        expect(computeTargetSize(original, { width: 1600, height: 1000 })).toBeNull();
    });

    it('applique largeur et hauteur ensemble, bornées à l’original', () => {
        expect(computeTargetSize(original, { width: 400, height: 4000 })).toEqual({ width: 400, height: 1000 });
    });
});
