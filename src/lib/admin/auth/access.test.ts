// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { authorizeAdminRequest, isAdminGranted, isLocalAdmin, requireAdmin } from './access';
import type { RemoteAdminConfig } from './config';
import { ADMIN_SESSION_COOKIE, signValue } from './session';

const NOW = 1_800_000_000;
const CONFIG = { adminUserId: 42, sessionSecret: 'k'.repeat(32) } as RemoteAdminConfig;

function requestWithSession(userId: number, expiresAt = NOW + 60): Request {
    const value = signValue({ userId, login: 'clodoweg', expiresAt }, CONFIG.sessionSecret);
    return new Request('https://dev.example.test/admin', { headers: { Cookie: `${ADMIN_SESSION_COOKIE}=${value}` } });
}

describe('authorizeAdminRequest', () => {
    it('accorde l’accès local sans session', () => {
        expect(authorizeAdminRequest(new Request('http://localhost/admin'), 'local', null, NOW)).toEqual({
            kind: 'granted',
            access: { mode: 'local' },
        });
    });

    it('répond not-found hors admin', () => {
        expect(authorizeAdminRequest(requestWithSession(42), 'disabled', CONFIG, NOW).kind).toBe('not-found');
        expect(authorizeAdminRequest(requestWithSession(42), 'remote', null, NOW).kind).toBe('not-found');
    });

    it('accorde l’accès distant à la session de l’administrateur', () => {
        const result = authorizeAdminRequest(requestWithSession(42), 'remote', CONFIG, NOW);
        expect(result).toMatchObject({ kind: 'granted', access: { mode: 'remote', session: { userId: 42 } } });
    });

    it.each([
        ['sans cookie', new Request('https://dev.example.test/admin')],
        ['avec un autre compte', requestWithSession(7)],
        ['avec une session expirée', requestWithSession(42, NOW - 1)],
    ])('demande le login %s', (_label, request) => {
        expect(authorizeAdminRequest(request, 'remote', CONFIG, NOW).kind).toBe('unauthenticated');
    });
});

describe('isAdminGranted, requireAdmin et isLocalAdmin', () => {
    afterEach(() => vi.unstubAllEnvs());

    it('se fient au verdict du middleware hors dev', () => {
        vi.stubEnv('DEV', false);
        expect(isAdminGranted({})).toBe(false);
        expect(isAdminGranted(undefined)).toBe(false);
        expect(requireAdmin({})?.status).toBe(404);
        const remote = {
            adminAccess: { mode: 'remote' as const, session: { userId: 42, login: 'a', expiresAt: NOW } },
        };
        expect(isAdminGranted(remote)).toBe(true);
        expect(requireAdmin(remote)).toBeNull();
        expect(isLocalAdmin(remote)).toBe(false);
        expect(isLocalAdmin({ adminAccess: { mode: 'local' } })).toBe(true);
        expect(isLocalAdmin({})).toBe(false);
    });

    it('restent ouverts en dev sans verdict (tests de routes)', () => {
        vi.stubEnv('DEV', true);
        expect(isAdminGranted({})).toBe(true);
        expect(isLocalAdmin(undefined)).toBe(true);
    });
});
