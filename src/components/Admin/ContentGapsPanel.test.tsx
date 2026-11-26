/**
 * Tests du panneau des textes manquants : rappel des commandes Claude Code, détail par contenu, état complet,
 * erreur de lecture et relecture après une mise à jour.
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ContentGapsPanel, { describeGaps } from './ContentGapsPanel';
import { WEB_IMAGES_CHANGED_EVENT } from './WebImagesReminder';

function mockGaps(body: unknown, status = 200) {
    const fetchMock = vi.fn(async () => Response.json(body, { status }));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('describeGaps', () => {
    it('décrit les descriptions SEO et les alts manquants', () => {
        expect(describeGaps({ missingAltCount: 2, missingSeo: ['a', 'b'] })).toBe(
            '2 descriptions SEO manquante(s) et 2 image(s) sans alt',
        );
        expect(describeGaps({ missingAltCount: 0, missingSeo: [] })).toBe('');
    });
});

describe('ContentGapsPanel', () => {
    it('donne les commandes et le détail par voyage', async () => {
        const fetchMock = mockGaps({
            missingAltCount: 3,
            missingAltsByEntry: { '2026/a': 3 },
            missingSeo: ['2025/b'],
        });
        render(<ContentGapsPanel scope="voyages" />);

        expect(await screen.findByText(/1 description SEO manquante/)).toBeInTheDocument();
        expect(screen.getByText('/generate-alts voyages')).toBeInTheDocument();
        expect(screen.getByText('/generate-seo voyages')).toBeInTheDocument();
        expect(screen.getByText('2026/a')).toBeInTheDocument();
        expect(screen.getByText('2025/b')).toBeInTheDocument();
        expect(screen.getByText('manquante')).toBeInTheDocument();
        expect(fetchMock).toHaveBeenCalledWith('/api/admin/content-gaps?scope=voyages');
    });

    it('indique quand tout est écrit', async () => {
        mockGaps({ missingAltCount: 0, missingAltsByEntry: {}, missingSeo: [] });
        render(<ContentGapsPanel scope="blog" />);
        expect(await screen.findByText(/Tous les alts et descriptions SEO sont écrits/)).toBeInTheDocument();
    });

    it("affiche l'erreur de lecture", async () => {
        mockGaps({ error: 'GitHub injoignable' }, 502);
        render(<ContentGapsPanel scope="blog" />);
        expect(await screen.findByText(/GitHub injoignable/)).toBeInTheDocument();
    });

    it('se relit après une mise à jour des images', async () => {
        const fetchMock = mockGaps({ missingAltCount: 0, missingAltsByEntry: {}, missingSeo: [] });
        render(<ContentGapsPanel scope="blog" />);
        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
        act(() => {
            window.dispatchEvent(new Event(WEB_IMAGES_CHANGED_EVENT));
        });
        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    });
});
