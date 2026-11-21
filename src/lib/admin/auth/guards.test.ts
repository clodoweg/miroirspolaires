// @vitest-environment node
/**
 * Garde-fou : chaque page `/admin` et chaque route `/api/admin` revérifie l'accès.
 *
 * POURQUOI : le middleware est la première barrière ; si un fichier oubliait la seconde, il resterait
 * ouvert le jour où le middleware serait mal configuré.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

function listFiles(directory: string, extension: string): string[] {
    return readdirSync(path.join(ROOT, directory), { recursive: true, encoding: 'utf8' })
        .filter((file) => file.endsWith(extension) && !path.basename(file).startsWith('_'))
        .map((file) => path.join(directory, file));
}

describe('gardes de l’administration', () => {
    it.each(listFiles('src/pages/admin', '.astro'))('%s teste isAdminGranted et reste SSR', (file) => {
        const source = readFileSync(path.join(ROOT, file), 'utf8');
        expect(source).toContain('if (!isAdminGranted(Astro.locals))');
        expect(source).toContain('export const prerender = false');
    });

    it.each(listFiles('src/pages/api/admin', '.ts'))('%s appelle requireAdmin dans chaque handler', (file) => {
        const source = readFileSync(path.join(ROOT, file), 'utf8');
        const handlers = source.match(/export const (GET|POST|PUT|DELETE|PATCH): APIRoute/g) ?? [];
        expect(handlers.length).toBeGreaterThan(0);
        expect(source.match(/const blocked = requireAdmin\(locals\);/g)?.length).toBe(handlers.length);
        expect(source).toContain('export const prerender = false');
    });
});
