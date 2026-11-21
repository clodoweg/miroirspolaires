/**
 * Tests du choix des routes Aladin côté navigateur : ordre, délais et message d'indisponibilité.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    AladinUnavailableError,
    loadFirstAladinRoute,
    pickReachableSkyRoute,
    SCRIPT_FAILOVER_TIMEOUT_MS,
    SCRIPT_FINAL_TIMEOUT_MS,
} from './aladin-routes';
import type { UpstreamRoute } from '@/config/upstream-routes';

const route = (id: string): UpstreamRoute => ({
    id,
    label: id,
    baseUrl: `https://${id}.test/sky`,
    protocol: 'hips-tiles',
    enabled: true,
    priority: 1,
});

const never = () => new Promise<never>(() => {});

describe('loadFirstAladinRoute', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('garde la première route qui charge', async () => {
        const loadRoute = vi.fn().mockResolvedValue('A');
        await expect(loadFirstAladinRoute([route('cds'), route('local')], loadRoute)).resolves.toEqual({
            route: route('cds'),
            aladin: 'A',
        });
        expect(loadRoute).toHaveBeenCalledTimes(1);
    });

    it('passe à la suivante quand une route bloque sans erreur', async () => {
        const loadRoute = vi.fn().mockImplementationOnce(never).mockResolvedValue('A local');
        const loading = loadFirstAladinRoute([route('cds'), route('local')], loadRoute);
        await vi.advanceTimersByTimeAsync(SCRIPT_FAILOVER_TIMEOUT_MS);
        await expect(loading).resolves.toMatchObject({ route: { id: 'local' }, aladin: 'A local' });
    });

    it('laisse plus de temps à la dernière route', async () => {
        const loadRoute = vi.fn().mockImplementation(never);
        const loading = loadFirstAladinRoute([route('local')], loadRoute);
        const assertion = expect(loading).rejects.toBeInstanceOf(AladinUnavailableError);
        await vi.advanceTimersByTimeAsync(SCRIPT_FAILOVER_TIMEOUT_MS);
        expect(loadRoute).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(SCRIPT_FINAL_TIMEOUT_MS);
        await assertion;
    });

    it('explique l’échec quand aucune route ne répond', async () => {
        const loadRoute = vi.fn().mockRejectedValue(new Error('script bloqué'));
        await expect(loadFirstAladinRoute([route('cds')], loadRoute)).rejects.toThrow(
            'ni depuis Strasbourg ni depuis sa copie locale',
        );
    });
});

describe('pickReachableSkyRoute', () => {
    it('lit `properties` et garde la première route qui répond', async () => {
        const fetchFn = vi
            .fn()
            .mockRejectedValueOnce(new TypeError('Failed to fetch'))
            .mockResolvedValueOnce({ ok: false })
            .mockResolvedValueOnce({ ok: true });
        const picked = await pickReachableSkyRoute([route('cds'), route('esa'), route('china')], fetchFn);
        expect(picked.id).toBe('china');
        expect(fetchFn.mock.calls.map(([url]) => url)).toEqual([
            'https://cds.test/sky/properties',
            'https://esa.test/sky/properties',
            'https://china.test/sky/properties',
        ]);
    });

    it('signale l’absence de fond de ciel', async () => {
        const fetchFn = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
        await expect(pickReachableSkyRoute([route('cds')], fetchFn)).rejects.toThrow('aucun fond de ciel ne répond');
    });
});
