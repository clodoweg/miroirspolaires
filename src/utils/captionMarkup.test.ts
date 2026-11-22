import { describe, it, expect, beforeEach } from 'vitest';
import { renderCaptionMarkup } from './captionMarkup';

describe('renderCaptionMarkup', () => {
    let target: HTMLElement;

    beforeEach(() => {
        target = document.createElement('figcaption');
        target.textContent = 'ancienne légende';
    });

    it('garde le texte et les liens produits par rehype-figure', () => {
        renderCaptionMarkup(target, 'Vue du <a href="https://fr.wikipedia.org/wiki/Fjord" id="x">fjord</a> au matin');
        expect(target.innerHTML).toBe('Vue du <a href="https://fr.wikipedia.org/wiki/Fjord">fjord</a> au matin');
    });

    it('garde la mise en forme simple et les liens relatifs', () => {
        renderCaptionMarkup(target, '<em>Aurore</em> <strong>verte</strong> <a href="/blog/2026/a/">voir</a>');
        expect(target.innerHTML).toBe('<em>Aurore</em> <strong>verte</strong> <a href="/blog/2026/a/">voir</a>');
    });

    it('retire scripts, gestionnaires et liens javascript:', () => {
        renderCaptionMarkup(
            target,
            '<img src=x onerror="window.__xss=1">Texte<script>window.__xss=2</script>' +
                '<a href="javascript:alert(1)" onclick="x()">lien</a><b onmouseover="y()">gras</b>',
        );
        expect(target.innerHTML).toBe('Texte<a>lien</a><b>gras</b>');
        expect(target.querySelector('img, script, [onclick], [onmouseover], [onerror]')).toBeNull();
    });

    it('réduit une balise non prévue à son texte', () => {
        renderCaptionMarkup(target, '<span class="c"><u>souligné</u> et <iframe src="https://x"></iframe>fin</span>');
        expect(target.innerHTML).toBe('souligné et fin');
    });
});
