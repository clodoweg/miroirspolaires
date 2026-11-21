// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getAdminNavItem } from './navigation';

const hrefs = (mode: Parameters<typeof getAdminNavItem>[0]) =>
    getAdminNavItem(mode)?.children?.map((child) => child.href) ?? [];

describe('getAdminNavItem', () => {
    it('n’existe pas hors dev et hors Preview de la branche de contenu', () => {
        expect(getAdminNavItem('disabled')).toBeNull();
    });

    it('en local, liste les pages locales sans celles propres à l’admin distant', () => {
        expect(getAdminNavItem('local')?.label).toBe('Admin');
        expect(hrefs('local')).toContain('/admin/astrophotos');
        expect(hrefs('local')).not.toContain('/admin/publication');
    });

    it('à distance, ne liste que les pages servies par l’admin distant', () => {
        expect(hrefs('remote')).toEqual(
            expect.arrayContaining(['/admin', '/admin/blog', '/admin/publication', '/admin/journal', '/admin/scripts']),
        );
        expect(hrefs('remote')).not.toContain('/admin/astrophotos');

        // POURQUOI : une page absente de REMOTE_READY_PAGES afficherait « pas encore disponible » à distance.
        const layout = readFileSync(path.join(process.cwd(), 'src/layouts/AdminLayout.astro'), 'utf8');
        const block = layout.match(/REMOTE_READY_PAGES = new Set\(\[([\s\S]*?)\]\)/)?.[1] ?? '';
        const readyPages = [...block.matchAll(/"([a-z]+)"/g)].map(([, page]) => page);
        const pageOf = (href: string) => (href === '/admin' ? 'dashboard' : href.replace('/admin/', ''));
        expect(readyPages.length).toBeGreaterThan(0);
        for (const href of hrefs('remote')) expect(readyPages, href).toContain(pageOf(href));
    });
});
