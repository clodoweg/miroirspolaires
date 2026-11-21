import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    resolveImage,
    getImageConfig,
    imageExists,
    remoteAssetExists,
    buildOptimizedUrl,
    getLocalImageDimensions,
    toThumbUrl,
    getWebImageSet,
} from './imageService';
import type { ImageMetadata } from 'astro';

describe('Image Service', () => {
    beforeEach(() => {
        vi.stubEnv('FORCE_LOCAL_IMAGES', 'false');
        vi.stubEnv('PUBLIC_R2_URL', 'https://r2.example.com');
    });

    it('returns local path when FORCE_LOCAL_IMAGES is true', () => {
        vi.stubEnv('FORCE_LOCAL_IMAGES', 'true');
        const result = resolveImage('/assets/photo.jpg');
        expect(result).toBe('/assets/photo.jpg');
    });

    it('returns remote R2 URL for local assets in production', () => {
        const result = resolveImage('/assets/astrophotographies/m31.jpg');
        // resolveImage logic: if starts with /assets/astrophotographies/, rewrite to R2
        expect(result).toContain('https://r2.example.com/astrophotographies/m31.jpg');
    });

    it('preserves remote URLs as-is', () => {
        const remoteUrl = 'https://othersite.com/image.png';
        expect(resolveImage(remoteUrl)).toBe(remoteUrl);
    });
});

describe('getImageConfig', () => {
    afterEach(() => vi.unstubAllEnvs());

    it('returns FORCE_LOCAL_IMAGES=false and empty R2_URL by default', () => {
        vi.stubEnv('FORCE_LOCAL_IMAGES', 'false');
        vi.stubEnv('PUBLIC_R2_URL', '');
        const config = getImageConfig();
        expect(config.FORCE_LOCAL_IMAGES).toBe(false);
    });

    it('detects FORCE_LOCAL_IMAGES=true from process.env', () => {
        vi.stubEnv('FORCE_LOCAL_IMAGES', 'true');
        expect(getImageConfig().FORCE_LOCAL_IMAGES).toBe(true);
    });

    it('detects PUBLIC_FORCE_LOCAL_IMAGES=true from process.env', () => {
        vi.stubEnv('FORCE_LOCAL_IMAGES', 'false');
        vi.stubEnv('PUBLIC_FORCE_LOCAL_IMAGES', 'true');
        expect(getImageConfig().FORCE_LOCAL_IMAGES).toBe(true);
    });

    it('reads R2_URL from PUBLIC_R2_URL env var', () => {
        vi.stubEnv('PUBLIC_R2_URL', 'https://cdn.example.com');
        expect(getImageConfig().R2_URL).toBe('https://cdn.example.com');
    });
});

describe('imageExists', () => {
    it('returns false for null or undefined', () => {
        expect(imageExists(null)).toBe(false);
        expect(imageExists(undefined)).toBe(false);
    });

    it('returns false for an empty string', () => {
        expect(imageExists('')).toBe(false);
    });

    it('returns false for a path not present in the local glob (test env has no assets)', () => {
        expect(imageExists('/assets/astrophotographies/does-not-exist.jpg')).toBe(false);
        expect(imageExists('src/assets/missing.jpg')).toBe(false);
    });
});

describe('remoteAssetExists', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    it('returns false immediately when FORCE_LOCAL_IMAGES is true', async () => {
        vi.stubEnv('FORCE_LOCAL_IMAGES', 'true');
        vi.stubEnv('PUBLIC_R2_URL', 'https://cdn.example.com');
        expect(await remoteAssetExists('astrophotographies/m31.jpg')).toBe(false);
    });

    it('returns false when R2_URL is not set', async () => {
        vi.stubEnv('FORCE_LOCAL_IMAGES', 'false');
        vi.stubEnv('PUBLIC_R2_URL', '');
        expect(await remoteAssetExists('astrophotographies/m31.jpg')).toBe(false);
    });

    it('returns true when remote HEAD request succeeds', async () => {
        vi.stubEnv('FORCE_LOCAL_IMAGES', 'false');
        vi.stubEnv('PUBLIC_R2_URL', 'https://cdn.example.com');
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

        expect(await remoteAssetExists('astrophotographies/m31.jpg')).toBe(true);
    });

    it('returns false when remote HEAD request fails with non-ok status', async () => {
        vi.stubEnv('FORCE_LOCAL_IMAGES', 'false');
        vi.stubEnv('PUBLIC_R2_URL', 'https://cdn.example.com');
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

        expect(await remoteAssetExists('astrophotographies/m31.jpg')).toBe(false);
    });

    it('returns false and does not throw on network error', async () => {
        vi.stubEnv('FORCE_LOCAL_IMAGES', 'false');
        vi.stubEnv('PUBLIC_R2_URL', 'https://cdn.example.com');
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Connection refused')));

        expect(await remoteAssetExists('astrophotographies/m31.jpg')).toBe(false);
    });
});

describe('buildOptimizedUrl', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('bypasses worker for pre-sized mini astrophotography thumbnails', () => {
        vi.stubEnv('IMAGE_WORKER_URL', 'https://images.example.com');
        vi.stubEnv('PUBLIC_R2_URL', 'https://pub-r2.example.com');

        const miniUrl = 'https://pub-r2.example.com/astrophotographies/mini/2025/1043288_raw.jpg?v=20250328';
        const result = buildOptimizedUrl(miniUrl, { width: 600, quality: 70, format: 'jpeg' });
        expect(result).toBe(miniUrl);
    });

    it('bypasses worker for pre-sized -thumb blog/voyage thumbnails', () => {
        vi.stubEnv('IMAGE_WORKER_URL', 'https://images.example.com');
        vi.stubEnv('PUBLIC_R2_URL', 'https://pub-r2.example.com');

        const thumbUrl = 'https://pub-r2.example.com/blog/2026/voyage-thumb.jpg';
        const result = buildOptimizedUrl(thumbUrl, { width: 800 });
        expect(result).toBe(thumbUrl);
    });

    it('composes worker URL for full resolution images', () => {
        vi.stubEnv('IMAGE_WORKER_URL', 'https://images.example.com');
        vi.stubEnv('PUBLIC_R2_URL', 'https://pub-r2.example.com');

        const rawUrl = 'https://pub-r2.example.com/astrophotographies/2025/1043288_raw.jpg';
        const result = buildOptimizedUrl(rawUrl, { width: 1000, quality: 80, format: 'jpeg' });
        expect(result).toBe('https://images.example.com/w_1000,q_80,f_jpeg/astrophotographies/2025/1043288_raw.jpg');
    });

    it('returns empty string when inputPath is empty', () => {
        expect(buildOptimizedUrl('')).toBe('');
    });
});

describe('resolveImage (résolution locale et R2)', () => {
    beforeEach(() => {
        vi.stubEnv('FORCE_LOCAL_IMAGES', 'false');
        vi.stubEnv('PUBLIC_FORCE_LOCAL_IMAGES', 'false');
        vi.stubEnv('PUBLIC_R2_URL', 'https://r2.example.com/');
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it('renvoie une chaîne vide pour un chemin vide', () => {
        expect(resolveImage('')).toBe('');
    });

    it('résout localement un dossier versionné même avec R2 configuré', () => {
        expect(resolveImage('../../assets/index/hero.jpg')).toBe('/src/assets/index/hero.jpg');
    });

    it('sert la variante mini locale des images de l’accueil', () => {
        expect(resolveImage('assets/index/hero.jpg', true)).toBe('/src/assets/index/mini/hero.jpg');
    });

    it('accepte un chemin déjà préfixé par src/', () => {
        expect(resolveImage('/src/assets/a-propos/julien-telescope.jpg')).toBe(
            '/src/assets/a-propos/julien-telescope.jpg',
        );
    });

    it('préfixe src/assets/ un chemin nu résolu localement et renvoie l’entrée si introuvable', () => {
        vi.stubEnv('PUBLIC_R2_URL', '');
        expect(resolveImage('blog/2025/inexistant.jpg')).toBe('blog/2025/inexistant.jpg');
        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('/src/assets/blog/2025/inexistant.jpg'));
    });

    it('signale une mini astrophoto introuvable localement sans planter', () => {
        vi.stubEnv('FORCE_LOCAL_IMAGES', 'true');
        expect(resolveImage('assets/astrophotographies/1900/absente.jpg', true)).toBe(
            'assets/astrophotographies/1900/absente.jpg',
        );
        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('astrophotographies/mini/1900/absente.jpg'));
    });

    it('construit l’URL R2 sans slash final en double, avec version', () => {
        expect(resolveImage('src/assets/blog/2025/photo.jpg', false, 'abc')).toBe(
            'https://r2.example.com/blog/2025/photo.jpg?v=abc',
        );
    });

    it('redirige vers la variante mini sur R2 pour une astrophoto', () => {
        expect(resolveImage('assets/astrophotographies/2025/42_raw.jpg', true)).toBe(
            'https://r2.example.com/astrophotographies/mini/2025/42_raw.jpg',
        );
    });

    it('ne redirige pas les annotations ni une image déjà mini', () => {
        expect(resolveImage('assets/astrophotographies/annotations/42.jpg', true)).toBe(
            'https://r2.example.com/astrophotographies/annotations/42.jpg',
        );
        expect(resolveImage('assets/astrophotographies/mini/2025/42.jpg', true)).toBe(
            'https://r2.example.com/astrophotographies/mini/2025/42.jpg',
        );
    });

    it('n’applique pas la mini sur R2 si elle n’est pas demandée', () => {
        expect(resolveImage('voyages/2024/islande/cover.jpg', true)).toBe(
            'https://r2.example.com/voyages/2024/islande/cover.jpg',
        );
    });
});

describe('getLocalImageDimensions', () => {
    it('renvoie null pour une entrée vide', () => {
        expect(getLocalImageDimensions(undefined)).toBeNull();
        expect(getLocalImageDimensions('')).toBeNull();
    });

    it('lit les dimensions précalculées quelle que soit la forme du chemin', () => {
        const expected = { width: 2749, height: 2062 };
        expect(getLocalImageDimensions('astrophotographies/2015/150785_raw.jpg')).toEqual(expected);
        expect(getLocalImageDimensions('../assets/astrophotographies/2015/150785_raw.jpg')).toEqual(expected);
        expect(getLocalImageDimensions('/src/assets/astrophotographies/2015/150785_raw.jpg')).toEqual(expected);
    });

    it('réutilise les dimensions de l’original pour une variante mini', () => {
        expect(getLocalImageDimensions('assets/astrophotographies/mini/2015/150785_raw.jpg')).toEqual({
            width: 2749,
            height: 2062,
        });
    });

    it('renvoie null pour une image inconnue', () => {
        expect(getLocalImageDimensions('blog/1900/inconnue.jpg')).toBeNull();
    });
});

describe('imageExists (assets versionnés)', () => {
    it('trouve un asset versionné quelle que soit la forme du chemin', () => {
        expect(imageExists('assets/index/hero.jpg')).toBe(true);
        expect(imageExists('../../assets/index/hero.jpg')).toBe(true);
        expect(imageExists('index/mini/hero.jpg')).toBe(true);
        expect(imageExists('/src/assets/a-propos/julien-telescope.jpg')).toBe(true);
    });
});

describe('toThumbUrl', () => {
    it('insère -thumb avant l’extension d’une URL', () => {
        expect(toThumbUrl('https://r2.example.com/blog/2025/photo.JPG')).toBe(
            'https://r2.example.com/blog/2025/photo-thumb.JPG',
        );
    });

    it('laisse intacte une chaîne sans extension et un ImageMetadata', () => {
        expect(toThumbUrl('https://r2.example.com/blog/photo')).toBe('https://r2.example.com/blog/photo');
        const meta = { src: '/x.jpg', width: 1, height: 1, format: 'jpg' } as ImageMetadata;
        expect(toThumbUrl(meta)).toBe(meta);
    });
});

describe('remoteAssetExists (normalisation et journalisation)', () => {
    beforeEach(() => {
        vi.stubEnv('FORCE_LOCAL_IMAGES', 'false');
        vi.stubEnv('PUBLIC_FORCE_LOCAL_IMAGES', 'false');
        vi.stubEnv('PUBLIC_R2_URL', 'https://cdn.example.com/');
    });
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it.each([
        ['src/assets/blog/a.jpg', 'https://cdn.example.com/blog/a.jpg'],
        ['../assets/blog/a.jpg', 'https://cdn.example.com/blog/a.jpg'],
        ['voyages/b.jpg', 'https://cdn.example.com/voyages/b.jpg'],
    ])('interroge R2 en HEAD pour %s', async (input, expectedUrl) => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true });
        vi.stubGlobal('fetch', fetchMock);
        expect(await remoteAssetExists(input)).toBe(true);
        expect(fetchMock).toHaveBeenCalledWith(expectedUrl, expect.objectContaining({ method: 'HEAD' }));
    });

    it('renvoie false pour un chemin vide sans appel réseau', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        expect(await remoteAssetExists('')).toBe(false);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('journalise une erreur inattendue mais pas un timeout', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const timeout = Object.assign(new Error('délai'), { name: 'TimeoutError' });
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeout));
        expect(await remoteAssetExists('blog/a.jpg')).toBe(false);
        expect(warn).not.toHaveBeenCalled();

        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')));
        expect(await remoteAssetExists('blog/a.jpg')).toBe(false);
        expect(warn).toHaveBeenCalledTimes(1);
    });
});

describe('buildOptimizedUrl (chemins relatifs et URL du worker)', () => {
    beforeEach(() => {
        vi.stubEnv('IMAGE_WORKER_URL', 'https://images.example.com');
        vi.stubEnv('PUBLIC_R2_URL', 'https://pub-r2.example.com');
    });
    afterEach(() => vi.unstubAllEnvs());

    it('applique les valeurs par défaut (2400 px, q85, jpeg) sur un chemin relatif', () => {
        expect(buildOptimizedUrl('../../assets/voyages/2024/a.jpg')).toBe(
            'https://images.example.com/w_2400,q_85,f_jpeg/voyages/2024/a.jpg',
        );
        expect(buildOptimizedUrl('src/assets/blog/b.jpg', { width: 400 })).toBe(
            'https://images.example.com/w_400,q_85,f_jpeg/blog/b.jpg',
        );
        expect(buildOptimizedUrl('blog/c.jpg', { width: 800, quality: 60 })).toBe(
            'https://images.example.com/w_800,q_60,f_jpeg/blog/c.jpg',
        );
    });

    it('sert directement depuis R2 une miniature donnée en chemin relatif', () => {
        expect(buildOptimizedUrl('assets/blog/2025/photo-thumb.jpg', { width: 800 })).toBe(
            'https://pub-r2.example.com/blog/2025/photo-thumb.jpg',
        );
        vi.stubEnv('PUBLIC_R2_URL', '');
        expect(buildOptimizedUrl('assets/blog/2025/photo-thumb.jpg', { width: 800 })).toBe(
            '/blog/2025/photo-thumb.jpg',
        );
    });

    it('remplace la transformation d’une URL déjà passée par le worker', () => {
        expect(
            buildOptimizedUrl('https://images.example.com/w_400,q_80,f_jpeg/blog/a.jpg', { width: 1200, quality: 75 }),
        ).toBe('https://images.example.com/w_1200,q_75,f_jpeg/blog/a.jpg');
    });

    it('renvoie l’URL R2 d’une miniature passée par le worker', () => {
        expect(buildOptimizedUrl('https://images.example.com/w_400,q_80,f_jpeg/blog/a-thumb.jpg', { width: 800 })).toBe(
            'https://pub-r2.example.com/blog/a-thumb.jpg',
        );
        vi.stubEnv('PUBLIC_R2_URL', '');
        expect(buildOptimizedUrl('https://images.example.com/w_400,q_80,f_jpeg/blog/a-thumb.jpg', { width: 800 })).toBe(
            '/blog/a-thumb.jpg',
        );
    });

    it('laisse intacte une URL externe', () => {
        expect(buildOptimizedUrl('https://autre.example.org/img.jpg', { width: 800 })).toBe(
            'https://autre.example.org/img.jpg',
        );
    });

    it('se replie sur R2 direct, ou sur la clé seule, sans worker configuré', () => {
        vi.stubEnv('IMAGE_WORKER_URL', '');
        expect(buildOptimizedUrl('blog/a.jpg', { width: 800 })).toBe('https://pub-r2.example.com/blog/a.jpg');
        vi.stubEnv('PUBLIC_R2_URL', '');
        expect(buildOptimizedUrl('blog/a.jpg', { width: 800 })).toBe('/blog/a.jpg');
    });
});

vi.mock('@/data/web-images.json', () => ({
    default: {
        'blog/2026/trip/photo.jpg': [400, 800, 1200],
        'astrophotographies/mini/2026/1279982_raw.jpg': [400, 800, 1200],
    },
}));

describe('versions web pré-générées', () => {
    beforeEach(() => {
        vi.stubEnv('IMAGE_WORKER_URL', 'https://images.example.com');
        vi.stubEnv('PUBLIC_R2_URL', 'https://pub-r2.example.com');
    });
    afterEach(() => vi.unstubAllEnvs());

    it('renvoie le srcset R2 d’une image du manifeste, depuis un chemin, une URL R2 ou worker', () => {
        const expected =
            'https://pub-r2.example.com/web/blog/2026/trip/photo-w400.jpg 400w, ' +
            'https://pub-r2.example.com/web/blog/2026/trip/photo-w800.jpg 800w, ' +
            'https://pub-r2.example.com/web/blog/2026/trip/photo-w1200.jpg 1200w';
        expect(getWebImageSet('../../../assets/blog/2026/trip/photo.jpg')?.srcset).toBe(expected);
        expect(getWebImageSet('https://pub-r2.example.com/blog/2026/trip/photo.jpg')?.srcset).toBe(expected);
        expect(getWebImageSet('https://images.example.com/w_800,q_80,f_jpeg/blog/2026/trip/photo.jpg')?.srcset).toBe(
            expected,
        );
    });

    it('termine le srcset d’une mini par la mini elle-même et applique la version', () => {
        const set = getWebImageSet('https://pub-r2.example.com/astrophotographies/mini/2026/1279982_raw.jpg', 'v9');
        expect(set?.candidates.map((candidate) => candidate.width)).toEqual([400, 800, 1200, 1313]);
        expect(set?.pick(1300)).toBe('https://pub-r2.example.com/astrophotographies/mini/2026/1279982_raw.jpg?v=v9');
        expect(set?.pick(500)).toBe(
            'https://pub-r2.example.com/web/astrophotographies/mini/2026/1279982_raw-w800.jpg?v=v9',
        );
    });

    it('renvoie null hors manifeste ou sans URL R2', () => {
        expect(getWebImageSet('blog/2026/trip/autre.jpg')).toBeNull();
        expect(getWebImageSet('')).toBeNull();
        vi.stubEnv('PUBLIC_R2_URL', '');
        expect(getWebImageSet('blog/2026/trip/photo.jpg')).toBeNull();
    });

    it('buildOptimizedUrl sert la version web jusqu’à 1200 px et garde le worker au-delà', () => {
        expect(buildOptimizedUrl('../../../assets/blog/2026/trip/photo.jpg', { width: 600 })).toBe(
            'https://pub-r2.example.com/web/blog/2026/trip/photo-w800.jpg',
        );
        expect(buildOptimizedUrl('../../../assets/blog/2026/trip/photo.jpg', { width: 2400, quality: 85 })).toBe(
            'https://images.example.com/w_2400,q_85,f_jpeg/blog/2026/trip/photo.jpg',
        );
    });
});
