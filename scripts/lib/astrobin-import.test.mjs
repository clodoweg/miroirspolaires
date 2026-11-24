// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    findIncompletePhotos,
    findIncompletePhotosWith,
    needsCopy,
    planAltYearMigration,
    planAstrobinImport,
} from './astrobin-import.mjs';

let root;
let source;
let target;

function write(filePath, content = 'x') {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
}

beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'astrobin-import-'));
    source = path.join(root, 'source');
    target = path.join(root, 'target');
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('needsCopy', () => {
    it('copie un fichier absent, de taille différente ou plus récent, pas un fichier à jour', () => {
        const from = path.join(root, 'from');
        const to = path.join(root, 'to');
        write(from, 'abc');
        expect(needsCopy(from, to)).toBe(true);
        write(to, 'abcd');
        expect(needsCopy(from, to)).toBe(true);
        write(to, 'abc');
        const now = new Date();
        fs.utimesSync(from, now, now);
        fs.utimesSync(to, now, now);
        expect(needsCopy(from, to)).toBe(false);
        fs.utimesSync(from, now, new Date(now.getTime() + 60_000));
        expect(needsCopy(from, to)).toBe(true);
    });
});

describe('planAstrobinImport', () => {
    const rows = [{ ID: '10', Uploaded: '2026-01-02' }];

    it("retient les fichiers de l'année du CSV et écarte l'ancienne année et les ID inconnus", () => {
        write(path.join(source, '2026/10_raw.jpg'));
        write(path.join(source, 'annotations/2026/10_annotation.svg'));
        write(path.join(source, 'skyplots/2026/10_skyplot.jpg'));
        write(path.join(source, '2024/10_raw.jpg'));
        write(path.join(source, '2026/99_raw.jpg'));
        write(path.join(source, '2026/.DS_Store'));

        const { copies, ignoredCount } = planAstrobinImport(source, target, rows);

        expect(copies.map((copy) => path.relative(target, copy.target)).sort()).toEqual([
            '2026/10_raw.jpg',
            'annotations/2026/10_annotation.svg',
            'skyplots/2026/10_skyplot.jpg',
        ]);
        expect(ignoredCount).toBe(2);
    });

    it('ne touche jamais au dossier mini', () => {
        write(path.join(source, 'mini/2026/10_raw.jpg'));
        expect(planAstrobinImport(source, target, rows).copies).toEqual([]);
    });
});

describe('findIncompletePhotos', () => {
    const row = { ID: '10', Title: 'M31', Uploaded: '2026-01-02' };

    it('signale chaque élément manquant, rien pour une photo complète', () => {
        expect(findIncompletePhotos([row], target, {}, {})).toEqual([
            { id: '10', title: 'M31', missing: ['raw', 'mini', 'annotation', 'alt', 'seo'] },
        ]);

        write(path.join(target, '2026/10_raw.jpg'));
        write(path.join(target, 'mini/2026/10_raw.jpg'));
        write(path.join(target, 'annotations/2026/10_annotation.svg'));
        expect(
            findIncompletePhotos(
                [row],
                target,
                { '/assets/astrophotographies/2026/10_raw.jpg': 'alt' },
                { 'astrophotographies/m31-10': 'seo' },
            ),
        ).toEqual([]);
    });
});

describe('findIncompletePhotosWith', () => {
    const row = { ID: '10', Title: 'M31', Uploaded: '2026-01-02' };

    it('vérifie les fichiers par la fonction fournie, avec les clés relatives à astrophotographies/', async () => {
        const asked = [];
        const fileExists = async (key) => {
            asked.push(key);
            return key !== 'mini/2026/10_raw.jpg';
        };
        expect(await findIncompletePhotosWith([row], fileExists, {}, { 'astrophotographies/m31-10': 'seo' })).toEqual([
            { id: '10', title: 'M31', missing: ['mini', 'alt'] },
        ]);
        expect(asked).toEqual(['2026/10_raw.jpg', 'mini/2026/10_raw.jpg', 'annotations/2026/10_annotation.svg']);
    });

    it('ne renvoie rien pour une photo complète', async () => {
        const result = await findIncompletePhotosWith(
            [row],
            async () => true,
            { '/assets/astrophotographies/2026/10_raw.jpg': 'alt' },
            { 'astrophotographies/m31-10': 'seo' },
        );
        expect(result).toEqual([]);
    });
});

describe('planAltYearMigration', () => {
    const previousRows = [
        { ID: '10', Uploaded: '2025-12-30' },
        { ID: '11', Uploaded: '2026-01-02' },
    ];

    it("renomme les clés du raw et des skyplots d'une photo dont l'année a changé, sans toucher aux autres", () => {
        const rows = [
            { ID: '10', Uploaded: '2026-01-05' },
            { ID: '11', Uploaded: '2026-01-02' },
        ];
        const altData = {
            '/assets/astrophotographies/2025/10_raw.jpg': 'raw',
            '/assets/astrophotographies/skyplots/2025/10_skyplot.jpg': 'skyplot',
            '/assets/astrophotographies/2025/100_raw.jpg': 'autre photo, même début d’ID',
            '/assets/astrophotographies/2026/11_raw.jpg': 'inchangée',
        };
        expect(planAltYearMigration(previousRows, rows, altData)).toEqual([
            ['/assets/astrophotographies/2025/10_raw.jpg', '/assets/astrophotographies/2026/10_raw.jpg'],
            [
                '/assets/astrophotographies/skyplots/2025/10_skyplot.jpg',
                '/assets/astrophotographies/skyplots/2026/10_skyplot.jpg',
            ],
        ]);
    });

    it("n'écrase pas une clé déjà présente, ignore les nouvelles photos et une année invalide", () => {
        const altData = {
            '/assets/astrophotographies/2025/10_raw.jpg': 'ancien',
            '/assets/astrophotographies/2026/10_raw.jpg': 'déjà là',
        };
        expect(planAltYearMigration(previousRows, [{ ID: '10', Uploaded: '2026-01-05' }], altData)).toEqual([]);
        expect(planAltYearMigration(previousRows, [{ ID: '12', Uploaded: '2026-01-05' }], altData)).toEqual([]);
        expect(planAltYearMigration(previousRows, [{ ID: '10', Uploaded: '' }], altData)).toEqual([]);
    });
});
