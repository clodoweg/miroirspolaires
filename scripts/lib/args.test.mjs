import { describe, it, expect } from 'vitest';
import { parseCliArgs } from './args.mjs';

const spec = { flags: { force: ['--force', '-f'], dryRun: ['--dry-run'] }, valueOptions: ['--only'] };

describe('parseCliArgs', () => {
    it('sépare options, alias, valeurs et positionnels', () => {
        expect(parseCliArgs(['blog', '-f', '--only=astro,blog', '--dry-run'], spec)).toEqual({
            flags: { force: true, dryRun: true },
            values: { '--only': 'astro,blog' },
            positionals: ['blog'],
        });
    });

    it('met les options absentes à false', () => {
        expect(parseCliArgs([], spec).flags).toEqual({ force: false, dryRun: false });
    });

    it('refuse une option inconnue au lieu de l’ignorer', () => {
        expect(() => parseCliArgs(['--dry-rnu'], spec)).toThrow('Option inconnue : --dry-rnu');
        expect(() => parseCliArgs(['--dry-run'], {})).toThrow('Option inconnue');
    });
});
