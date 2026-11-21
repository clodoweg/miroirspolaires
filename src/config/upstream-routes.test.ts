/**
 * Tests du registre des routes amont : cohérence du registre et application du choix enregistré.
 */

import { describe, it, expect } from 'vitest';
import {
    CDS_DOWN_PRESET,
    getActiveRoutes,
    resolveServiceRoutes,
    UPSTREAM_SERVICE_IDS,
    UPSTREAM_SERVICES,
} from './upstream-routes';

const idsOf = (routes: { id: string }[]) => routes.map((route) => route.id);

describe('registre', () => {
    it.each(UPSTREAM_SERVICE_IDS)('%s : ids uniques et CDS en premier par défaut', (serviceId) => {
        const ids = UPSTREAM_SERVICES[serviceId].routes.map((route) => route.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(resolveServiceRoutes(serviceId)[0].id).toMatch(/^cds/);
    });

    it.each(UPSTREAM_SERVICE_IDS)('%s : le préréglage nomme chaque route et met le CDS en dernier', (serviceId) => {
        const { order } = CDS_DOWN_PRESET[serviceId];
        expect([...order].sort()).toEqual(UPSTREAM_SERVICES[serviceId].routes.map((route) => route.id).sort());
        expect(order.at(-1)).toMatch(/^cds/);
    });

    it('signale les routes en HTTP simple', () => {
        for (const serviceId of UPSTREAM_SERVICE_IDS) {
            for (const route of UPSTREAM_SERVICES[serviceId].routes) {
                expect(Boolean(route.isInsecure)).toBe(route.baseUrl.startsWith('http://'));
            }
        }
    });
});

describe('resolveServiceRoutes', () => {
    it('suit l’ordre enregistré et applique les désactivations', () => {
        const routes = resolveServiceRoutes('simbad', { order: ['idia', 'cds', 'harvard'], disabled: ['cds'] });
        expect(idsOf(routes)).toEqual(['idia', 'cds', 'harvard']);
        expect(routes.map((route) => route.enabled)).toEqual([true, false, true]);
    });

    it('ignore un id inconnu et place une route absente à la suite', () => {
        const routes = resolveServiceRoutes('simbad', { order: ['ancienne', 'idia'], disabled: [] });
        expect(idsOf(routes)).toEqual(['idia', 'cds', 'harvard']);
    });
});

describe('getActiveRoutes', () => {
    it('lit le fichier versionné sans renvoyer de route désactivée', () => {
        const routes = getActiveRoutes('vizier');
        expect(routes.length).toBeGreaterThan(0);
        expect(routes.every((route) => route.enabled)).toBe(true);
    });
});
