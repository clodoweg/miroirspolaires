// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildWikiIntro } from './wiki-intro.mjs';

describe('buildWikiIntro', () => {
    it('refuse un texte trop court ou absent', () => {
        expect(buildWikiIntro('Trop court.')).toBeNull();
        expect(buildWikiIntro(undefined)).toBeNull();
    });

    it('garde un texte de taille normale, sur une seule ligne', () => {
        const sentence = 'Une phrase assez longue pour dépasser le minimum demandé par le script de description.';
        expect(buildWikiIntro(`${sentence}\n\n${sentence}  `)).toBe(`${sentence} ${sentence}`);
    });

    it('coupe un texte long à la fin d’une phrase', () => {
        const sentence = 'Une phrase de longueur moyenne sur un objet du ciel profond. ';
        const result = buildWikiIntro(sentence.repeat(40));
        expect(result.length).toBeLessThanOrEqual(1000);
        expect(result.endsWith('profond.')).toBe(true);
    });

    it('coupe à un mot entier quand aucune phrase ne se termine', () => {
        const result = buildWikiIntro('mot '.repeat(400));
        expect(result.length).toBeLessThanOrEqual(1001);
        expect(result.endsWith('mot…')).toBe(true);
    });
});
