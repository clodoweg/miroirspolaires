/**
 * Tests de la cellule « Annotation » de la liste des astrophotos : origine, date, nombre d'objets et dernier essai.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import AstroAnnotationCell from './AstroAnnotationCell';

describe('AstroAnnotationCell', () => {
    it('affiche un calque Miroirs Polaires avec sa date et son nombre d’objets', () => {
        const { container } = render(
            <AstroAnnotationCell
                hasAnnotation
                annotation={{
                    kind: 'miroirs',
                    updatedAt: '2026-11-27T10:00:00Z',
                    objectCount: 9,
                    wcsSource: 'astrobin',
                }}
                annotationRun={{ at: '2026-11-27T10:00:00Z', status: 'ok', objects: 9 }}
                annotationRunCount={2}
                annotationPath="R2 : astrophotographies/annotations/2024/1_annotation.svg"
            />,
        );
        expect(screen.getByText('Miroirs')).toBeInTheDocument();
        expect(screen.getByText('27/11/2026 · 9 obj.')).toBeInTheDocument();
        expect(screen.queryByText(/Échec/)).not.toBeInTheDocument();
        const details = container.firstElementChild?.getAttribute('title') ?? '';
        expect(details).toContain('Origine : Miroirs Polaires');
        expect(details).toContain('Astrométrie : résolution d’AstroBin');
        expect(details).toContain('Dernier passage : Réussi le 27/11/2026 : 9 objet(s)');
        expect(details).toContain('2 passages enregistrés');
        expect(details).toContain('R2 : astrophotographies/annotations/2024/1_annotation.svg');
    });

    it('signale l’ancien SVG d’AstroBin resté en ligne après un échec', () => {
        const { container } = render(
            <AstroAnnotationCell
                hasAnnotation
                annotation={{ kind: 'astrobin', updatedAt: '2025-03-01T08:00:00Z' }}
                annotationRun={{ at: '2026-11-26T16:07:40Z', status: 'failed', reason: 'HTTP Error 429' }}
            />,
        );
        expect(screen.getByText('AstroBin')).toBeInTheDocument();
        expect(screen.getByText('01/03/2025')).toBeInTheDocument();
        expect(screen.getByText(/Échec le/)).toHaveTextContent('Échec le 26/11');
        expect(container.firstElementChild?.getAttribute('title')).toContain(
            'Dernier passage : Échec le 26/11/2026 : HTTP Error 429',
        );
    });

    it('distingue le repli local, l’origine inconnue et l’absence de calque', () => {
        const { rerender } = render(<AstroAnnotationCell hasAnnotation annotation={{ kind: 'astrobin-local' }} />);
        expect(screen.getByText('AstroBin local')).toBeInTheDocument();
        rerender(<AstroAnnotationCell hasAnnotation />);
        expect(screen.getByText('Inconnue')).toBeInTheDocument();
        rerender(
            <AstroAnnotationCell
                hasAnnotation={false}
                annotationRun={{ at: '2026-11-27T10:00:00Z', status: 'skipped', reason: 'aucune solution' }}
            />,
        );
        expect(screen.getByText('Absente')).toBeInTheDocument();
        expect(screen.getByText(/Ignorée le/)).toHaveTextContent('Ignorée le 27/11');
    });
});
