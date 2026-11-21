import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PhotoList from './PhotoList';
import type { Photo } from '../../lib/photos';

function makePhoto(overrides: Partial<Photo>): Photo {
    return {
        id: 1,
        slug: 'm31',
        title: 'Galaxie d’Andromède',
        constellation: 'Andromède',
        year: 2025,
        raVal: 10.68,
        decVal: 41.27,
        imagePath: '2025/1_raw.jpg',
        ...overrides,
    } as Photo;
}

describe('PhotoList', () => {
    it('affiche les photos géolocalisées et ignore celles sans coordonnées', () => {
        render(
            <PhotoList
                photos={[makePhoto({}), makePhoto({ id: 2, title: 'Sans coordonnées', raVal: null })]}
                onSelectPhoto={vi.fn()}
            />,
        );
        expect(screen.getByRole('button', { name: /Galaxie d’Andromède/ })).toBeInTheDocument();
        expect(screen.queryByText('Sans coordonnées')).not.toBeInTheDocument();
    });

    it('sélectionne une photo au clic', () => {
        const onSelectPhoto = vi.fn();
        render(<PhotoList photos={[makePhoto({})]} onSelectPhoto={onSelectPhoto} />);
        fireEvent.click(screen.getByRole('button', { name: /Galaxie/ }));
        expect(onSelectPhoto).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
    });

    it('affiche le slug en texte, sans l’interpréter comme du HTML, si la vignette échoue', () => {
        const slug = '<img src=x onerror="window.__xss=1">';
        render(<PhotoList photos={[makePhoto({ slug })]} onSelectPhoto={vi.fn()} />);
        fireEvent.error(screen.getByRole('img'));
        expect(screen.getByText(slug)).toBeInTheDocument();
        expect(document.querySelector('img[src="x"]')).toBeNull();
    });
});
