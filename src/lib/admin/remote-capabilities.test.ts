import { describe, expect, it } from 'vitest';
import { isAvailableRemotely } from './remote-capabilities';

describe('isAvailableRemotely', () => {
    it.each([
        ['GET', '/api/admin/posts'],
        ['GET', '/api/admin/posts/2026/aurores-tromso'],
        ['HEAD', '/api/admin/voyages'],
        ['GET', '/api/admin/voyages/2011/islande'],
        ['GET', '/api/admin/lighthouse/report'],
        ['GET', '/api/admin/upstream'],
        ['GET', '/api/admin/cache/status'],
        ['GET', '/api/admin/diagnostics'],
        ['GET', '/api/admin/content-gaps'],
        ['GET', '/api/admin/astrophotos/recent'],
    ])('ouvre %s %s', (method, pathname) => {
        expect(isAvailableRemotely(method, pathname)).toBe(true);
    });

    it.each([
        ['POST', '/api/admin/posts'],
        ['PUT', '/api/admin/posts/2026/aurores'],
        ['DELETE', '/api/admin/voyages/2011/islande'],
        ['PUT', '/api/admin/upstream'],
        ['GET', '/api/admin/images/2026/aurores'],
        ['GET', '/api/admin/voyages-images/2025/troms/cover.jpg'],
        ['PUT', '/api/admin/images/2026/aurores/a.jpg'],
        ['DELETE', '/api/admin/voyages-images/2025/troms/a.jpg'],
        ['POST', '/api/admin/uploads'],
        ['POST', '/api/admin/uploads/finalize'],
        ['POST', '/api/admin/astrophotos/update'],
        ['GET', '/api/admin/release'],
        ['POST', '/api/admin/release'],
        ['POST', '/api/admin/release/merge'],
        ['GET', '/api/admin/jobs'],
        ['POST', '/api/admin/jobs'],
        ['GET', '/api/admin/jobs/0f0e8a3c-1234-4abc-9def-0123456789ab'],
        ['POST', '/api/admin/jobs/0f0e8a3c-1234-4abc-9def-0123456789ab/cancel'],
    ])('ouvre l’écriture par commit %s %s', (method, pathname) => {
        expect(isAvailableRemotely(method, pathname)).toBe(true);
    });

    it.each([
        ['PATCH', '/api/admin/posts/2026/aurores'],
        ['POST', '/api/admin/upstream/probe'],
        ['GET', '/api/admin/scripts/run'],
        ['GET', '/api/admin/jobs/../x'],
        ['GET', '/api/admin/posts/2026/../../x'],
        ['GET', '/api/admin/r2/status'],
        ['POST', '/api/admin/images/2026/aurores'],
        ['POST', '/api/admin/images/2026/aurores/sync'],
        ['GET', '/api/admin/images/2026/aurores/sync'],
        ['GET', '/api/admin/images/2026/aurores/a%20b.jpg'],
        ['POST', '/api/admin/preview'],
        ['POST', '/api/admin/astrophotos/upload'],
    ])('ferme %s %s', (method, pathname) => {
        expect(isAvailableRemotely(method, pathname)).toBe(false);
    });
});
