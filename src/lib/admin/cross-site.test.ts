// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { isCrossSiteRequest } from './cross-site';

const URL_RUN = 'http://localhost:4321/api/admin/scripts/run?id=sync-r2';

function request(headers: Record<string, string>) {
    return new Request(URL_RUN, { headers });
}

describe('isCrossSiteRequest', () => {
    it('bloque une page tierce (img, fetch no-cors) selon Fetch Metadata', () => {
        expect(isCrossSiteRequest(request({ 'Sec-Fetch-Site': 'cross-site' }))).toBe(true);
        expect(isCrossSiteRequest(request({ 'Sec-Fetch-Site': 'same-site' }))).toBe(true);
    });

    it('laisse passer l’admin elle-même et la navigation directe', () => {
        expect(isCrossSiteRequest(request({ 'Sec-Fetch-Site': 'same-origin' }))).toBe(false);
        expect(isCrossSiteRequest(request({ 'Sec-Fetch-Site': 'none' }))).toBe(false);
    });

    it('se rabat sur Origin quand Fetch Metadata est absent', () => {
        expect(isCrossSiteRequest(request({ Origin: 'https://evil.example' }))).toBe(true);
        expect(isCrossSiteRequest(request({ Origin: 'http://localhost:4321' }))).toBe(false);
        expect(isCrossSiteRequest(request({ Origin: 'null' }))).toBe(true);
    });

    it('accepte un client hors navigateur sans en-tête', () => {
        expect(isCrossSiteRequest(request({}))).toBe(false);
    });
});
