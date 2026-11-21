/**
 * Tests de la bascule entre routes : ordre, délais, coupe-circuit et messages d'erreur.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    CIRCUIT_OPEN_MS,
    FAILOVER_TIMEOUT_MS,
    getLastUsedRouteId,
    resetUpstreamCircuits,
    UpstreamHttpError,
    UpstreamUnavailableError,
    withUpstreamFailover,
} from './failover';

const { activeRoutes } = vi.hoisted(() => ({ activeRoutes: { current: [] as Record<string, unknown>[] } }));

vi.mock('@/config/upstream-routes', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/config/upstream-routes')>()),
    getActiveRoutes: () => activeRoutes.current,
}));

const routeA = { id: 'a', label: 'A', baseUrl: 'https://a', protocol: 'tap-adql', enabled: true, priority: 1 };
const routeB = { id: 'b', label: 'B', baseUrl: 'https://b', protocol: 'tap-adql', enabled: true, priority: 2 };
const OPTIONS = { finalTimeoutMs: 25_000 };

function timeoutError(): Error {
    return Object.assign(new Error('délai dépassé'), { name: 'TimeoutError' });
}

describe('withUpstreamFailover', () => {
    beforeEach(() => {
        resetUpstreamCircuits();
        activeRoutes.current = [routeA, routeB];
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('s’arrête à la première route qui répond et la retient', async () => {
        const attempt = vi.fn().mockResolvedValue('ok');
        expect(await withUpstreamFailover('simbad', attempt, OPTIONS)).toBe('ok');
        expect(attempt).toHaveBeenCalledTimes(1);
        expect(getLastUsedRouteId('simbad')).toBe('a');
    });

    it('suit l’ordre du registre avec un délai court sauf pour le dernier recours', async () => {
        const attempt = vi.fn().mockRejectedValueOnce(new Error('panne')).mockResolvedValue('ok');
        await withUpstreamFailover('simbad', attempt, OPTIONS);
        expect(attempt.mock.calls.map(([route, timeoutMs]) => [route.id, timeoutMs])).toEqual([
            ['a', FAILOVER_TIMEOUT_MS],
            ['b', OPTIONS.finalTimeoutMs],
        ]);
        expect(getLastUsedRouteId('simbad')).toBe('b');
    });

    it('préfère le délai propre à une route', async () => {
        activeRoutes.current = [{ ...routeA, timeoutMs: 1_234 }];
        const attempt = vi.fn().mockResolvedValue('ok');
        await withUpstreamFailover('simbad', attempt, OPTIONS);
        expect(attempt.mock.calls[0][1]).toBe(1_234);
    });

    it('échoue vite quand aucune route n’est active', async () => {
        activeRoutes.current = [];
        const attempt = vi.fn();
        await expect(withUpstreamFailover('sesame', attempt, OPTIONS)).rejects.toThrow(
            'Sesame indisponible : aucune route active',
        );
        expect(attempt).not.toHaveBeenCalled();
    });

    it('détaille chaque route dans l’erreur finale', async () => {
        const attempt = vi
            .fn()
            .mockRejectedValueOnce(new UpstreamHttpError('TAP', 502))
            .mockRejectedValueOnce(new Error('coupé'));
        const failure = withUpstreamFailover('simbad', attempt, OPTIONS);
        await expect(failure).rejects.toBeInstanceOf(UpstreamUnavailableError);
        await expect(failure).rejects.toThrow('A : TAP 502 ; B : coupé');
    });

    describe('coupe-circuit', () => {
        it('saute une route tombée, puis la retente après le délai', async () => {
            const attempt = vi.fn().mockRejectedValueOnce(new Error('panne')).mockResolvedValue('ok');
            await withUpstreamFailover('simbad', attempt, OPTIONS);

            attempt.mockClear();
            await withUpstreamFailover('simbad', attempt, OPTIONS);
            expect(attempt.mock.calls.map(([route]) => route.id)).toEqual(['b']);

            vi.advanceTimersByTime(CIRCUIT_OPEN_MS);
            attempt.mockClear();
            await withUpstreamFailover('simbad', attempt, OPTIONS);
            expect(attempt.mock.calls.map(([route]) => route.id)).toEqual(['a']);
        });

        it('sépare les services', async () => {
            await withUpstreamFailover(
                'simbad',
                vi.fn().mockRejectedValueOnce(new Error('panne')).mockResolvedValue('ok'),
                OPTIONS,
            );
            const attempt = vi.fn().mockResolvedValue('ok');
            await withUpstreamFailover('vizier', attempt, OPTIONS);
            expect(attempt.mock.calls[0][0].id).toBe('a');
        });

        it('ne s’ouvre pas sur une erreur 4xx, mais s’ouvre sur 429 et 5xx', async () => {
            const firstRouteAfter = async (error: Error) => {
                resetUpstreamCircuits();
                await withUpstreamFailover(
                    'simbad',
                    vi.fn().mockRejectedValueOnce(error).mockResolvedValue('ok'),
                    OPTIONS,
                );
                const attempt = vi.fn().mockResolvedValue('ok');
                await withUpstreamFailover('simbad', attempt, OPTIONS);
                return attempt.mock.calls[0][0].id;
            };
            expect(await firstRouteAfter(new UpstreamHttpError('TAP', 400))).toBe('a');
            expect(await firstRouteAfter(new UpstreamHttpError('TAP', 429))).toBe('b');
            expect(await firstRouteAfter(new UpstreamHttpError('TAP', 503))).toBe('b');
        });

        it('ne s’ouvre pas sur l’expiration d’une route ambiguë', async () => {
            activeRoutes.current = [{ ...routeA, hasAmbiguousTimeout: true }, routeB];
            await withUpstreamFailover(
                'sesame',
                vi.fn().mockRejectedValueOnce(timeoutError()).mockResolvedValue('ok'),
                OPTIONS,
            );
            const attempt = vi.fn().mockResolvedValue('ok');
            await withUpstreamFailover('sesame', attempt, OPTIONS);
            expect(attempt.mock.calls[0][0].id).toBe('a');
        });

        it('s’ouvre sur une vraie panne d’une route ambiguë', async () => {
            activeRoutes.current = [{ ...routeA, hasAmbiguousTimeout: true }, routeB];
            await withUpstreamFailover(
                'sesame',
                vi.fn().mockRejectedValueOnce(new Error('coupé')).mockResolvedValue('ok'),
                OPTIONS,
            );
            const attempt = vi.fn().mockResolvedValue('ok');
            await withUpstreamFailover('sesame', attempt, OPTIONS);
            expect(attempt.mock.calls[0][0].id).toBe('b');
        });

        it('tente la route tombée le plus tôt quand tous les circuits sont ouverts', async () => {
            const allDown = vi.fn().mockRejectedValue(new Error('panne'));
            activeRoutes.current = [routeA];
            await expect(withUpstreamFailover('simbad', allDown, OPTIONS)).rejects.toThrow();
            vi.advanceTimersByTime(1_000);
            activeRoutes.current = [routeB];
            await expect(withUpstreamFailover('simbad', allDown, OPTIONS)).rejects.toThrow();

            activeRoutes.current = [routeA, routeB];
            const attempt = vi.fn().mockResolvedValue('ok');
            await withUpstreamFailover('simbad', attempt, OPTIONS);
            expect(attempt.mock.calls.map(([route]) => route.id)).toEqual(['a']);
        });
    });
});
