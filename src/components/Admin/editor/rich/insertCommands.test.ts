/**
 * Tests du catalogue d'insertion (menu « / ») et des helpers YouTube.
 */
import { describe, expect, it } from 'vitest';
import { buildYoutubeEmbed, filterInsertCommands, parseYoutubeId } from './insertCommands';

describe('filterInsertCommands', () => {
    it('filtre sans tenir compte des accents ni de la casse', () => {
        expect(filterInsertCommands('separ').map((c) => c.id)).toEqual(['horizontalRule']);
        expect(filterInsertCommands('VIDÉO').map((c) => c.id)).toEqual(['youtube']);
        expect(filterInsertCommands('')).toHaveLength(12);
    });
});

describe('parseYoutubeId', () => {
    it.each([
        ['https://www.youtube.com/watch?v=6sbrnOWqQSI', '6sbrnOWqQSI'],
        ['https://youtu.be/6sbrnOWqQSI?t=3', '6sbrnOWqQSI'],
        ['https://www.youtube.com/embed/6sbrnOWqQSI', '6sbrnOWqQSI'],
        ['https://www.youtube.com/shorts/6sbrnOWqQSI', '6sbrnOWqQSI'],
        ['6sbrnOWqQSI', '6sbrnOWqQSI'],
        ['https://vimeo.com/123', null],
    ])('%s → %s', (input, expected) => {
        expect(parseYoutubeId(input)).toBe(expected);
    });

    it('produit le même gabarit que les articles existants', () => {
        const html = buildYoutubeEmbed('6sbrnOWqQSI', 'Vol "test"');
        expect(html).toContain('src="https://www.youtube.com/embed/6sbrnOWqQSI"');
        expect(html).toContain('title="Vol &quot;test&quot;"');
        expect(html.startsWith('<div style="padding:56.25% 0 0 0;position:relative;">')).toBe(true);
    });
});
