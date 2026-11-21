import { describe, it, expect } from 'vitest';
import type { CollectionEntry } from 'astro:content';
import type { Photo } from '@/lib/photos';
import { generatePhotoSchema, generateBlogSchema, generateSiteSchema, generateVideoSchema, toJsonLd } from './seo';

describe('SEO Utilities', () => {
    describe('generatePhotoSchema', () => {
        it('generates a valid ImageObject schema', () => {
            const photo = {
                title: 'Andromeda Galaxy',
                slug: 'm31',
                description: 'A beautiful spiral galaxy',
                year: 2023,
            };
            const result = generatePhotoSchema(photo as any, 'https://miroirspolaires.com/astrophotographies/m31.jpg');
            const schema = JSON.parse(result);

            expect(schema['@context']).toBe('https://schema.org/');
            expect(schema['@type']).toBe('ImageObject');
            expect(schema.name).toBe(photo.title);
        });
    });

    describe('generateBlogSchema', () => {
        it('generates a valid BlogPosting schema', () => {
            const post = {
                slug: 'my-astro-trip',
                data: {
                    title: 'My Astro Trip',
                    description: 'Trip to Norway',
                    date: '01/10/2023',
                },
            };
            const result = generateBlogSchema(post as any, 'https://miroirspolaires.com/blog/my-astro-trip.jpg');
            const schema = JSON.parse(result);

            expect(schema['@type']).toBe('BlogPosting');
            expect(schema.headline).toBe(post.data.title);
            expect(schema.datePublished).toBeDefined();
        });
    });
});

describe('toJsonLd', () => {
    it('empêche un </script> de fermer la balise JSON-LD tout en restant du JSON valide', async () => {
        const { toJsonLd } = await import('./seo');
        const payload = { name: 'Titre </script><script>alert(1)</script> & co ' };
        const serialized = toJsonLd(payload);
        expect(serialized).not.toContain('</script>');
        expect(serialized).not.toContain('<');
        expect(JSON.parse(serialized)).toEqual(payload);
    });
});

describe('toJsonLd', () => {
    it('échappe les caractères qui fermeraient la balise script et reste du JSON valide', () => {
        const value = { title: '</script><img src=x onerror=alert(1)> & co  ' };
        const serialized = toJsonLd(value);
        expect(serialized).not.toContain('<');
        expect(serialized).not.toContain('>');
        expect(serialized).not.toContain('&');
        expect(serialized).not.toContain(' ');
        expect(serialized).not.toContain(' ');
        expect(JSON.parse(serialized)).toEqual(value);
    });
});

describe('generatePhotoSchema (cas limites)', () => {
    const basePhoto = { title: 'M 42', description: 'Orion', year: 2021 } as unknown as Photo;

    it('renvoie une chaîne vide sans URL d’image', () => {
        expect(generatePhotoSchema(basePhoto)).toBe('');
    });

    it('rend absolue une URL relative et ajoute le slash manquant', () => {
        const withSlash = JSON.parse(generatePhotoSchema(basePhoto, '/assets/m42.jpg'));
        expect(withSlash.contentUrl).toBe('https://www.miroirspolaires.fr/assets/m42.jpg');
        const withoutSlash = JSON.parse(generatePhotoSchema(basePhoto, 'assets/m42.jpg'));
        expect(withoutSlash.url).toBe('https://www.miroirspolaires.fr/assets/m42.jpg');
    });

    it('liste le matériel présent dans exifData et date la publication', () => {
        const photo = {
            ...basePhoto,
            telescope: 'RedCat 51',
            camera: 'ASI2600MC',
            mount: 'EQ6-R',
        } as unknown as Photo;
        const schema = JSON.parse(generatePhotoSchema(photo, 'https://cdn.example.com/m42.jpg'));
        expect(schema.exifData.map((entry: { name: string }) => entry.name)).toEqual(['Telescope', 'Camera', 'Mount']);
        expect(schema.datePublished).toBe('2021-01-01');
        expect(schema.copyrightNotice).toBe('© 2021 Miroirs Polaires');
    });

    it('omet la date et prend l’année courante pour le copyright sans année', () => {
        const photo = { title: 'M 1', description: '' } as unknown as Photo;
        const schema = JSON.parse(generatePhotoSchema(photo, 'https://cdn.example.com/m1.jpg'));
        expect(schema.datePublished).toBeUndefined();
        expect(schema.copyrightNotice).toBe(`© ${new Date().getFullYear()} Miroirs Polaires`);
        expect(schema.exifData).toEqual([]);
    });
});

describe('generateBlogSchema (image et date)', () => {
    it('convertit la date jj/mm/aaaa et laisse image vide sans URL', () => {
        const entry = {
            id: '2023/aurores',
            data: { title: 'Aurores', description: 'Laponie', date: '15/02/2023' },
        } as unknown as CollectionEntry<'blog'>;
        const schema = JSON.parse(generateBlogSchema(entry));
        expect(schema.image).toEqual([]);
        expect(schema.datePublished).toBe(new Date('2023-02-15').toISOString());
        expect(schema.mainEntityOfPage['@id']).toBe('https://www.miroirspolaires.fr/blog/2023/aurores');
    });
});

describe('generateSiteSchema', () => {
    it('décrit la personne et le site dans un même graphe', () => {
        const schema = JSON.parse(generateSiteSchema());
        const types = schema['@graph'].map((node: { '@type': string }) => node['@type']);
        expect(types).toEqual(['Person', 'WebSite']);
        expect(schema['@graph'][1].publisher['@id']).toBe(schema['@graph'][0]['@id']);
    });
});

describe('generateVideoSchema', () => {
    function videoEntry(duration?: string) {
        return {
            id: 'la-lentille-de-nimrud',
            data: {
                title: 'La lentille de Nimrud',
                description: 'Histoire',
                date: '2024-03-01',
                videoUrl: 'https://www.youtube.com/embed/abc',
                duration,
            },
        } as unknown as CollectionEntry<'videos'>;
    }

    it.each([
        ['12:34', 'PT12M34S'],
        ['1:02:03', 'PT1H2M3S'],
        ['10:00', 'PT10M'],
    ])('convertit la durée %s en %s', (duration, expected) => {
        expect(JSON.parse(generateVideoSchema(videoEntry(duration))).duration).toBe(expected);
    });

    it.each([[undefined], ['abc:def'], ['1:2:3:4']])('omet une durée absente ou invalide (%s)', (duration) => {
        expect(JSON.parse(generateVideoSchema(videoEntry(duration))).duration).toBeUndefined();
    });

    it('rend la miniature absolue et l’omet en son absence', () => {
        const withThumb = JSON.parse(generateVideoSchema(videoEntry('1:00'), '/assets/videos/nimrud.jpg'));
        expect(withThumb.thumbnailUrl).toEqual(['https://www.miroirspolaires.fr/assets/videos/nimrud.jpg']);
        expect(withThumb.uploadDate).toBe(new Date('2024-03-01').toISOString());
        expect(withThumb.embedUrl).toBe('https://www.youtube.com/embed/abc');
        const withoutThumb = JSON.parse(generateVideoSchema(videoEntry('1:00')));
        expect(withoutThumb.thumbnailUrl).toBeUndefined();
    });
});
