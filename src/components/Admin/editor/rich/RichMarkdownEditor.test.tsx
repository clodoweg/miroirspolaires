/**
 * Tests du composant RichMarkdownEditor : rendu du Markdown, insertion, bascule en mode source.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import RichMarkdownEditor, { type RichMarkdownEditorHandle } from './RichMarkdownEditor';

const BODY =
    '## Jour 1\n\nArrivée à **Ilulissat**.\n\n![Icebergs](/assets/blog/2026/x/a.jpg)\n![Baie](/assets/blog/2026/x/b.jpg)\n';

function renderEditor(value = BODY) {
    const onChange = vi.fn();
    const ref = createRef<RichMarkdownEditorHandle>();
    const utils = render(
        <RichMarkdownEditor
            ref={ref}
            value={value}
            onChange={onChange}
            resolveImageSrc={(src) => src.replace('/assets/blog/', '/api/admin/images/')}
        />,
    );
    return { ...utils, onChange, ref };
}

describe('RichMarkdownEditor', () => {
    it('affiche le titre, le texte et la galerie sans signaler de modification', async () => {
        const { container, onChange } = renderEditor();
        await waitFor(() => expect(container.querySelector('.rich-editor h2')).toHaveTextContent('Jour 1'));
        expect(container.querySelector('.rich-editor strong')).toHaveTextContent('Ilulissat');
        await waitFor(() => expect(screen.getByText(/Galerie · 2 images/)).toBeInTheDocument());
        const images = Array.from(container.querySelectorAll('.rich-image-group img')).map((img) =>
            img.getAttribute('src'),
        );
        expect(images).toEqual(['/api/admin/images/2026/x/a.jpg', '/api/admin/images/2026/x/b.jpg']);
        expect(onChange).not.toHaveBeenCalled();
    });

    it('insère un fragment Markdown et renvoie le nouveau corps', async () => {
        const { container, onChange, ref } = renderEditor('Texte.\n');
        await waitFor(() => expect(container.querySelector('.rich-editor p')).toBeInTheDocument());
        act(() => ref.current?.insertMarkdown('![360:Fjord](/assets/blog/2026/x/pano.jpg)\n'));
        await waitFor(() => expect(onChange).toHaveBeenCalled());
        const markdown = onChange.mock.calls.at(-1)?.[0] as string;
        expect(markdown).toContain('![360:Fjord](/assets/blog/2026/x/pano.jpg)');
        expect(markdown).toContain('Texte.');
    });

    it('bascule en Markdown source et édite le texte brut', async () => {
        const { onChange } = renderEditor();
        fireEvent.click(screen.getByRole('button', { name: 'Markdown' }));
        const textarea = screen.getByLabelText("Markdown source de l'article") as HTMLTextAreaElement;
        expect(textarea.value).toBe(BODY);
        fireEvent.change(textarea, { target: { value: '# Nouveau\n' } });
        expect(onChange).toHaveBeenCalledWith('# Nouveau\n');
    });

    it('ouvre le panneau d’une image pour modifier alt et légende', async () => {
        const { onChange } = renderEditor();
        const button = await screen.findByRole('button', { name: "Modifier l'image a.jpg" });
        fireEvent.click(button);
        fireEvent.change(screen.getByPlaceholderText("Légende affichée sous l'image"), {
            target: { value: 'Le premier iceberg' },
        });
        await waitFor(() => expect(onChange).toHaveBeenCalled());
        expect(onChange.mock.calls.at(-1)?.[0]).toContain(
            '![Icebergs](/assets/blog/2026/x/a.jpg)\nLe premier iceberg\n![Baie](/assets/blog/2026/x/b.jpg)',
        );
    });
});
