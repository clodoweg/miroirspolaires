// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
    ADMIN_SESSION_COOKIE,
    buildCookieHeader,
    readAdminSession,
    readCookie,
    signValue,
    verifySignedValue,
} from './session';

const SECRET = 's'.repeat(32);
const NOW = 1_800_000_000;

function requestWithCookie(cookie: string): Request {
    return new Request('https://dev.example.test/admin', { headers: { Cookie: cookie } });
}

describe('signValue et verifySignedValue', () => {
    it('relit une valeur signée et non expirée', () => {
        const value = signValue({ expiresAt: NOW + 10, user: 'a' }, SECRET);
        expect(verifySignedValue(value, SECRET, NOW)).toEqual({ expiresAt: NOW + 10, user: 'a' });
    });

    it('refuse une valeur expirée', () => {
        expect(verifySignedValue(signValue({ expiresAt: NOW }, SECRET), SECRET, NOW)).toBeNull();
    });

    it('refuse une signature d’un autre secret ou une charge modifiée', () => {
        const value = signValue({ expiresAt: NOW + 10, userId: 1 }, SECRET);
        expect(verifySignedValue(value, 't'.repeat(32), NOW)).toBeNull();
        const [, signature] = value.split('.');
        const forged = Buffer.from(JSON.stringify({ expiresAt: NOW + 10, userId: 2 })).toString('base64url');
        expect(verifySignedValue(`${forged}.${signature}`, SECRET, NOW)).toBeNull();
    });

    it.each([null, '', 'abc', 'a.b.c', 'a.'])('refuse la valeur mal formée %s', (value) => {
        expect(verifySignedValue(value, SECRET, NOW)).toBeNull();
    });

    it('refuse une charge signée qui n’est pas du JSON ou sans expiration', () => {
        const encoded = Buffer.from('pas du json').toString('base64url');
        const signature = signValue({ expiresAt: 0 }, SECRET).split('.')[1];
        expect(verifySignedValue(`${encoded}.${signature}`, SECRET, NOW)).toBeNull();
        expect(verifySignedValue(signValue({} as { expiresAt: number }, SECRET), SECRET, NOW)).toBeNull();
    });
});

describe('readCookie', () => {
    it('trouve un cookie parmi d’autres', () => {
        expect(readCookie(requestWithCookie('a=1; mp=2;b=3'), 'mp')).toBe('2');
        expect(readCookie(requestWithCookie('a=1; broken'), 'mp')).toBeNull();
        expect(readCookie(new Request('https://x.test'), 'mp')).toBeNull();
    });
});

describe('readAdminSession', () => {
    it('relit la session du cookie', () => {
        const value = signValue({ userId: 42, login: 'clodoweg', expiresAt: NOW + 60 }, SECRET);
        const session = readAdminSession(requestWithCookie(`${ADMIN_SESSION_COOKIE}=${value}`), SECRET, NOW);
        expect(session).toEqual({ userId: 42, login: 'clodoweg', expiresAt: NOW + 60 });
    });

    it('refuse une session sans identifiant valide', () => {
        const value = signValue({ userId: 'x', login: 'a', expiresAt: NOW + 60 } as never, SECRET);
        expect(readAdminSession(requestWithCookie(`${ADMIN_SESSION_COOKIE}=${value}`), SECRET, NOW)).toBeNull();
    });
});

describe('buildCookieHeader', () => {
    it('pose les attributs de sécurité', () => {
        expect(buildCookieHeader('mp', 'v', 60)).toBe('mp=v; Path=/; Max-Age=60; HttpOnly; Secure; SameSite=Lax');
    });
});
