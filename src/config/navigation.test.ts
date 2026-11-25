// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { getAdminNavItem } from './navigation';

const hrefs = (mode: Parameters<typeof getAdminNavItem>[0]) =>
    getAdminNavItem(mode)?.children?.map((child) => child.href) ?? [];

describe('getAdminNavItem', () => {
    it('n’existe pas hors dev et hors Preview de la branche de contenu', () => {
        expect(getAdminNavItem('disabled')).toBeNull();
    });

    it('en local, propose les raccourcis locaux sans ceux propres à l’admin distant', () => {
        expect(getAdminNavItem('local')?.label).toBe('Admin');
        expect(hrefs('local')).toEqual(['/admin', '/admin/astrophotos', '/admin/blog', '/admin/voyages']);
    });

    it('à distance, ne propose que des pages servies par l’admin distant', () => {
        expect(hrefs('remote')).toEqual([
            '/admin',
            '/admin/astrophotos',
            '/admin/blog',
            '/admin/voyages',
            '/admin/publication',
        ]);
    });
});
