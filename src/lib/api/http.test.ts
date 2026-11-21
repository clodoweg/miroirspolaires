import { describe, it, expect, vi } from 'vitest';
import {
    jsonResponse,
    errorResponse,
    internalErrorResponse,
    parseBoundedInt,
    parseNumberInRange,
    parseBoundedString,
    parseDateParam,
    escapeLikePattern,
} from './http';

describe('jsonResponse', () => {
    it('sérialise le corps avec le statut et les en-têtes donnés', async () => {
        const response = jsonResponse({ ok: true }, { status: 201, headers: { 'Cache-Control': 'max-age=60' } });
        expect(response.status).toBe(201);
        expect(response.headers.get('Content-Type')).toContain('application/json');
        expect(response.headers.get('Cache-Control')).toBe('max-age=60');
        expect(await response.json()).toEqual({ ok: true });
    });
});

describe('errorResponse', () => {
    it('renvoie { error } sans cache', async () => {
        const response = errorResponse(400, 'Paramètre invalide');
        expect(response.status).toBe(400);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        expect(await response.json()).toEqual({ error: 'Paramètre invalide' });
    });
});

describe('internalErrorResponse', () => {
    it('journalise le détail mais ne le renvoie pas au client', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        const response = internalErrorResponse('route test', new Error('SQLITE_ERROR: no such column secret_col'));
        const body = await response.json();
        expect(response.status).toBe(500);
        expect(JSON.stringify(body)).not.toContain('secret_col');
        expect(consoleError).toHaveBeenCalledWith('[api] route test:', expect.any(Error));
        consoleError.mockRestore();
    });
});

describe('parseBoundedInt', () => {
    const options = { fallback: 50, min: 1, max: 100 };

    it('renvoie la valeur par défaut si absente ou non numérique', () => {
        expect(parseBoundedInt(null, options)).toBe(50);
        expect(parseBoundedInt('', options)).toBe(50);
        expect(parseBoundedInt('abc', options)).toBe(50);
    });

    it('plafonne les valeurs énormes et négatives (LIMIT -1 = illimité en SQLite)', () => {
        expect(parseBoundedInt('1000000', options)).toBe(100);
        expect(parseBoundedInt('-1', options)).toBe(1);
        expect(parseBoundedInt('0', options)).toBe(1);
    });

    it('tronque les décimales', () => {
        expect(parseBoundedInt('2.9', options)).toBe(2);
    });
});

describe('parseNumberInRange', () => {
    it('accepte une valeur dans les bornes', () => {
        expect(parseNumberInRange('45.5', { min: -90, max: 90 })).toBe(45.5);
    });

    it('rejette les valeurs hors bornes, invalides ou absentes', () => {
        expect(parseNumberInRange('999', { min: -90, max: 90 })).toBeUndefined();
        expect(parseNumberInRange('Infinity', { min: -90, max: 90 })).toBeUndefined();
        expect(parseNumberInRange('x', { min: -90, max: 90 })).toBeUndefined();
        expect(parseNumberInRange(null, { min: -90, max: 90 })).toBeUndefined();
    });
});

describe('parseBoundedString', () => {
    it('nettoie et tronque', () => {
        expect(parseBoundedString('  M31  ', 80)).toBe('M31');
        expect(parseBoundedString('a'.repeat(500), 10)).toHaveLength(10);
        expect(parseBoundedString(null, 10)).toBe('');
    });
});

describe('parseDateParam', () => {
    it('distingue absente, valide et invalide', () => {
        expect(parseDateParam(null)).toBeNull();
        expect(parseDateParam('2026-10-27')?.toISOString()).toBe('2026-10-27T00:00:00.000Z');
        expect(parseDateParam('pas une date')).toBeUndefined();
    });
});

describe('escapeLikePattern', () => {
    it('neutralise les jokers LIKE et la barre oblique inverse', () => {
        expect(escapeLikePattern('100%_\\x')).toBe('100\\%\\_\\\\x');
        expect(escapeLikePattern('M 31')).toBe('M 31');
    });
});
