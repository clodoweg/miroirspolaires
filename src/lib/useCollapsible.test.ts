/**
 * Tests du hook useCollapsible : lecture de l'état initial depuis localStorage
 * et persistance de chaque changement.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useCollapsible } from './useCollapsible';

describe('useCollapsible', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('utilise la valeur par défaut (déplié) à la première visite et la persiste', () => {
        const { result } = renderHook(() => useCollapsible('filtres'));
        expect(result.current[0]).toBe(true);
        expect(localStorage.getItem('collapsible:filtres')).toBe('true');
    });

    it('respecte une valeur par défaut repliée', () => {
        const { result } = renderHook(() => useCollapsible('panneau', false));
        expect(result.current[0]).toBe(false);
        expect(localStorage.getItem('collapsible:panneau')).toBe('false');
    });

    it('restaure la valeur stockée en priorité sur la valeur par défaut', () => {
        localStorage.setItem('collapsible:legende', 'false');
        const { result } = renderHook(() => useCollapsible('legende', true));
        expect(result.current[0]).toBe(false);
    });

    it('persiste le nouvel état après un basculement', () => {
        const { result } = renderHook(() => useCollapsible('details'));
        act(() => result.current[1](false));
        expect(result.current[0]).toBe(false);
        expect(localStorage.getItem('collapsible:details')).toBe('false');
    });
});
