// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findBlogImagesWithoutAlt, findVoyageImagesWithoutAlt, getContentGaps } from './content-gaps.mjs';

let root: string;

function write(relativePath: string, content: string) {
    const filePath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
}

beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'content-gaps-'));
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('findBlogImagesWithoutAlt', () => {
    it('ne retient que les images sans alt', () => {
        const markdown = '![Un fjord](/assets/a.jpg)\n![](/assets/b.jpg)\n![ ](/assets/c.jpg)';
        expect(findBlogImagesWithoutAlt(markdown)).toEqual(['/assets/b.jpg', '/assets/c.jpg']);
    });
});

describe('findVoyageImagesWithoutAlt', () => {
    const markdown = [
        '---',
        'image: "../../../assets/voyages/2026/a/cover.jpg"',
        'gallery:',
        '  - "../../../assets/voyages/2026/a/cover.jpg"',
        '  - "../../../assets/voyages/2026/a/b.jpg"',
        '---',
        'Texte citant /assets/voyages/2026/a/c.jpg',
    ].join('\n');

    it('lit la couverture et la galerie, sans doublon ni image du corps', () => {
        expect(findVoyageImagesWithoutAlt(markdown, {})).toEqual([
            '/assets/voyages/2026/a/cover.jpg',
            '/assets/voyages/2026/a/b.jpg',
        ]);
    });

    it('ignore les images qui ont un alt', () => {
        const altData = { '/assets/voyages/2026/a/cover.jpg': 'Couverture', '/assets/voyages/2026/a/b.jpg': 'B' };
        expect(findVoyageImagesWithoutAlt(markdown, altData)).toEqual([]);
    });
});

describe('getContentGaps', () => {
    it('compte les alts du blog par article, sans jamais signaler de SEO', () => {
        write('src/content/blog/2026/a.md', '![](/assets/x.jpg)\n![](/assets/y.jpg)');
        write('src/content/blog/2026/b.md', '![Alt](/assets/z.jpg)');
        expect(getContentGaps('blog', root)).toEqual({
            missingAltCount: 2,
            missingAltsByEntry: { '2026/a': 2 },
            missingSeo: [],
        });
    });

    it('signale les alts et les descriptions SEO manquants des voyages', () => {
        write('src/content/voyages/2026/a.md', '---\nimage: "../../../assets/voyages/2026/a/c.jpg"\n---\n');
        write('src/content/voyages/2026/b.md', '---\nimage: "../../../assets/voyages/2026/b/c.jpg"\n---\n');
        write('src/data/alt.json', JSON.stringify({ '/assets/voyages/2026/b/c.jpg': 'Alt' }));
        write('src/data/seo.json', JSON.stringify({ 'voyages/2026/a': 'Description' }));
        expect(getContentGaps('voyages', root)).toEqual({
            missingAltCount: 1,
            missingAltsByEntry: { '2026/a': 1 },
            missingSeo: ['2026/b'],
        });
    });

    it('renvoie un état vide sans dossier de contenu, même si les JSON sont illisibles', () => {
        write('src/data/alt.json', 'pas du json');
        expect(getContentGaps('voyages', root)).toEqual({ missingAltCount: 0, missingAltsByEntry: {}, missingSeo: [] });
    });
});
