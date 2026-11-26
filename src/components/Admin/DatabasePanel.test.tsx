/**
 * Tests de la traduction des boutons de la base de données en options de job distant (catalogues, import VSX).
 */
import { describe, expect, it } from 'vitest';
import { getScript, buildScriptArgs } from '@/lib/admin/scripts';
import { argsToJobOptions, variableStarsJobOptions } from './DatabasePanel';

describe('argsToJobOptions', () => {
    it('traduit les arguments connus en options déclarées', () => {
        expect(argsToJobOptions(['--missing'])).toEqual({ missing: true });
        expect(argsToJobOptions(['--only=messier,caldwell', '--force', '--dry-run'])).toEqual({
            only: ['messier', 'caldwell'],
            force: true,
            dryRun: true,
        });
    });

    it('ignore les arguments inconnus : le serveur ne recevra que des options déclarées', () => {
        expect(argsToJobOptions(['--fresh', '--max-mag', '14'])).toEqual({});
        expect(argsToJobOptions([])).toEqual({});
    });
});

describe('variableStarsJobOptions', () => {
    const script = getScript('update-variable-stars-ci')!;

    it('complète sans effacer par défaut', () => {
        expect(variableStarsJobOptions(['--no-clean'], 15)).toEqual({ maxMag: 15 });
        expect(buildScriptArgs(script, variableStarsJobOptions([], 25))).toEqual(['--max-mag', '25']);
    });

    it('ajoute --fresh pour tout réimporter, avec des options acceptées par le serveur', () => {
        expect(buildScriptArgs(script, variableStarsJobOptions(['--fresh'], 12.5))).toEqual([
            '--fresh',
            '--max-mag',
            '12.5',
        ]);
    });
});
