// @vitest-environment node
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { SCRIPTS, getScript, listRemoteScripts } from './scripts';

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
        // POURQUOI : sans argument, l'import des étoiles variables vide la table ; il a son propre workflow.
        expect(remote.map((script) => script.id)).not.toContain('update-variable-stars');
    });

    it('réserve à distance la mise à jour des photos en mode --ci, et seulement elle', () => {
        const remoteOnly = SCRIPTS.filter((script) => script.remoteOnly);
        expect(remoteOnly.map((script) => script.id)).toEqual(['update-photos-ci', 'update-photos-ci-force']);
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
