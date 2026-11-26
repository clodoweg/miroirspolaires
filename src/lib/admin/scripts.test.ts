// @vitest-environment node
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
    SCRIPTS,
    buildScriptArgs,
    getScript,
    hasDestructiveOption,
    listRemoteScripts,
    ScriptOptionsError,
} from './scripts';

describe('SCRIPTS (console de scripts de l’admin)', () => {
    it('ne lance le mode destructif du transfert R2 que depuis mirror-r2', () => {
        const destructive = SCRIPTS.filter((script) => script.args.includes('--delete-first')).map(
            (script) => script.id,
        );
        expect(destructive).toEqual(['mirror-r2']);
        expect(getScript('sync-r2')?.args).toEqual(['scripts/r2/upload_local_to_r2.js']);
    });

    it('référence uniquement des scripts présents dans le dépôt', () => {
        for (const script of SCRIPTS) {
            const file = script.args.find((arg) => arg.startsWith('scripts/'));
            expect(file, script.id).toBeDefined();
            expect(fs.existsSync(path.resolve(process.cwd(), file!)), file).toBe(true);
        }
    });

    it("n'expose dans /admin/infra/scripts aucun script partagé sans domaine", () => {
        const sharedScripts = ['pipeline/generate-mini.mjs'];
        const targetedScripts = ['r2/', 'build/generate-web-images.mjs'];
        for (const script of SCRIPTS.filter((entry) => !entry.needsTarget)) {
            const file = script.args[0];
            if (sharedScripts.some((name) => file.endsWith(name))) {
                expect(
                    script.args.some((arg) => arg.startsWith('--only=')),
                    script.id,
                ).toBe(true);
            }
            expect(
                targetedScripts.some((name) => file.includes(name)),
                script.id,
            ).toBe(false);
        }
    });

    it('a des identifiants uniques et renvoie undefined pour un id inconnu', () => {
        const ids = SCRIPTS.map((script) => script.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(getScript('rm -rf')).toBeUndefined();
    });

    it('réserve au dev les scripts destructifs ou qui lisent src/assets', () => {
        // POURQUOI : ces scripts ne pourront jamais tourner sur l'admin distant (pas de disque de travail).
        for (const id of ['mirror-r2', 'update-photos', 'sync-r2', 'download-r2', 'upload-missing-r2']) {
            expect(getScript(id)?.devOnly, id).toBe(true);
        }
        expect(getScript('update-exoplanets')?.devOnly).toBeUndefined();
    });

    it('n’ouvre à distance que des scripts sans cible, ni destructifs, ni locaux', () => {
        const remote = listRemoteScripts();
        expect(remote.length).toBeGreaterThan(0);
        for (const script of remote) {
            expect(script.devOnly, script.id).toBeUndefined();
            expect(script.needsTarget, script.id).toBeUndefined();
            expect(script.command, script.id).toBe('node');
        }
        // POURQUOI : sans argument, l'import des étoiles variables vide la table ; seule sa variante --no-clean est ouverte.
        expect(remote.map((script) => script.id)).not.toContain('update-variable-stars');
        expect(getScript('update-variable-stars-ci')?.args).toEqual([
            'scripts/pipeline/update-variable-stars.mjs',
            '--no-clean',
        ]);
    });

    it('réserve à distance la mise à jour des photos en mode --ci et l’import VSX sans effacement', () => {
        const remoteOnly = SCRIPTS.filter((script) => script.remoteOnly);
        expect(remoteOnly.map((script) => script.id)).toEqual([
            'update-photos-ci',
            'update-photos-ci-force',
            'update-variable-stars-ci',
        ]);
        expect(getScript('update-photos-ci')).toMatchObject({
            remote: true,
            args: ['scripts/pipeline/update-photos.mjs', '--ci'],
        });
        expect(getScript('update-photos-ci-force')).toMatchObject({
            remote: true,
            args: ['scripts/pipeline/update-photos.mjs', '--ci', '--force-media'],
        });
        // POURQUOI : la version locale garde son comportement (lit src/assets/ et ../astrobin).
        expect(getScript('update-photos')).toMatchObject({
            devOnly: true,
            args: ['scripts/pipeline/update-photos.mjs'],
        });
    });
});

describe('buildScriptArgs', () => {
    const catalogues = getScript('update-catalogues')!;
    const crossmatch = getScript('crossmatch-variable-stars')!;

    it('traduit les options dans l’ordre déclaré', () => {
        expect(
            buildScriptArgs(catalogues, { dryRun: true, only: ['messier', 'caldwell', 'messier'], missing: false }),
        ).toEqual(['--only=messier,caldwell', '--dry-run']);
        expect(buildScriptArgs(crossmatch, { maxMag: 14.5, batchSize: 2000 })).toEqual([
            '--max-mag',
            '14.5',
            '--batch-size',
            '2000',
        ]);
        expect(buildScriptArgs(catalogues, undefined)).toEqual([]);
        expect(buildScriptArgs(catalogues, { only: [] })).toEqual([]);
    });

    it.each([
        ['un objet attendu', ['--reset']],
        ['une option inconnue', { reset: true }],
        ['une valeur hors motif', { only: ['../x'] }],
        ['une liste trop longue', { only: Array.from({ length: 51 }, (_, i) => `c${i}`) }],
        ['un drapeau mal typé', { missing: 'true' }],
    ])('refuse %s', (_label, values) => {
        expect(() => buildScriptArgs(catalogues, values)).toThrow(ScriptOptionsError);
    });

    it.each([{ maxMag: 0 }, { maxMag: Number.NaN }, { batchSize: 100.5 }, { batchSize: '2000' }])(
        'refuse le nombre %j',
        (values) => {
            expect(() => buildScriptArgs(crossmatch, values)).toThrow(ScriptOptionsError);
        },
    );

    it('repère les options destructives cochées', () => {
        expect(hasDestructiveOption(crossmatch, { reset: true })).toBe(true);
        expect(hasDestructiveOption(crossmatch, { reset: false, maxMag: 12 })).toBe(false);
    });

    it('ne déclare d’options que sur des scripts lançables à distance ou locaux connus', () => {
        for (const script of SCRIPTS) {
            for (const option of script.options ?? []) expect(option.flag.startsWith('--'), `${script.id}`).toBe(true);
        }
    });
});
