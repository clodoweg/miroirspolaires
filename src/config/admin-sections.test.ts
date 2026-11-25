// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    ADMIN_PAGES,
    ADMIN_SECTIONS,
    getAdminPage,
    getAdminPageTitle,
    getAdminSectionOf,
    isAdminPageAvailable,
    resolveLegacyAdminHref,
} from './admin-sections';

const PAGES_DIR = path.join(process.cwd(), 'src/pages');

/** Fichier Astro qui sert une URL de l'admin (`/admin/x` → `admin/x.astro` ou `admin/x/index.astro`). */
function pageFileFor(href: string): string | null {
    const base = path.join(PAGES_DIR, href);
    if (existsSync(`${base}.astro`)) return `${base}.astro`;
    if (existsSync(path.join(base, 'index.astro'))) return path.join(base, 'index.astro');
    return null;
}

function listAdminPageFiles(dir = path.join(PAGES_DIR, 'admin')): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return listAdminPageFiles(full);
        return entry.name.endsWith('.astro') ? [full] : [];
    });
}

describe('registre des pages de l’admin', () => {
    it('a des identifiants et des URL uniques', () => {
        const ids = ADMIN_PAGES.map((page) => page.id);
        const hrefs = ADMIN_PAGES.map((page) => page.href);
        expect(new Set(ids).size).toBe(ids.length);
        expect(new Set(hrefs).size).toBe(hrefs.length);
    });

    it('pointe chaque entrée vers une page qui existe et qui déclare le bon `active`', () => {
        for (const page of ADMIN_PAGES) {
            const file = pageFileFor(page.href);
            expect(file, page.href).not.toBeNull();
            expect(readFileSync(file as string, 'utf8'), page.href).toContain(`active="${page.id}"`);
        }
    });

    it('référence toutes les pages de src/pages/admin, sauf l’aperçu et la redirection', () => {
        const registered = new Set(ADMIN_PAGES.map((page) => pageFileFor(page.href)));
        const ignored = new Set(['apercu.astro', '[...legacy].astro']);
        for (const file of listAdminPageFiles()) {
            if (ignored.has(path.basename(file))) continue;
            expect(registered.has(file), path.relative(PAGES_DIR, file)).toBe(true);
        }
    });

    it('ne réutilise jamais une URL actuelle comme ancienne URL', () => {
        const current = new Set(ADMIN_PAGES.map((page) => page.href));
        for (const legacy of ADMIN_PAGES.flatMap((page) => page.legacyHrefs ?? [])) {
            expect(current.has(legacy), legacy).toBe(false);
        }
    });

    it('rattache chaque page à une section, sauf le tableau de bord', () => {
        expect(getAdminSectionOf('dashboard')).toBeUndefined();
        expect(getAdminSectionOf('upstream')?.id).toBe('donnees');
        const sectioned = ADMIN_SECTIONS.flatMap((section) => section.pages).length;
        expect(sectioned).toBe(ADMIN_PAGES.length - 1);
    });

    it('lève une erreur pour un identifiant inconnu', () => {
        expect(() => getAdminPage('inconnu' as never)).toThrow();
    });
});

describe('getAdminPageTitle', () => {
    it('préfixe le groupe quand la page en a un', () => {
        expect(getAdminPageTitle(getAdminPage('blog-images'))).toBe('Blog › Images & textes');
        expect(getAdminPageTitle(getAdminPage('upstream'))).toBe('Routes CDS');
    });
});

describe('isAdminPageAvailable', () => {
    it('suit la disponibilité déclarée', () => {
        expect(isAdminPageAvailable(getAdminPage('blog'), 'remote')).toBe(true);
        expect(isAdminPageAvailable(getAdminPage('r2'), 'remote')).toBe(false);
        expect(isAdminPageAvailable(getAdminPage('publication'), 'local')).toBe(false);
        expect(isAdminPageAvailable(getAdminPage('publication'), 'remote')).toBe(true);
    });
});

describe('resolveLegacyAdminHref', () => {
    it('redirige les anciennes URL, avec ou sans / final', () => {
        expect(resolveLegacyAdminHref('/admin/seo')).toBe('/admin/qualite/seo');
        expect(resolveLegacyAdminHref('/admin/upstream/')).toBe('/admin/donnees/routes-cds');
        expect(resolveLegacyAdminHref('/admin/scripts')).toBe('/admin/infra/scripts');
    });

    it('ignore les URL inconnues ou actuelles', () => {
        expect(resolveLegacyAdminHref('/admin/inconnue')).toBeNull();
        expect(resolveLegacyAdminHref('/admin/qualite/seo')).toBeNull();
        expect(resolveLegacyAdminHref('/admin')).toBeNull();
    });
});
