/**
 * Tests de la traduction des boutons de la base de données en options de job distant.
 */
import { describe, expect, it } from 'vitest';
import { argsToJobOptions } from './DatabasePanel';

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
