// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runSteps } from './pipeline-runner.mjs';

let root;
let marker;

function writeScript(name, body) {
    const filePath = path.join(root, name);
    fs.writeFileSync(filePath, body);
    return filePath;
}

beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-runner-'));
    marker = path.join(root, 'marker');
    vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
});

describe('runSteps', () => {
    it("relève l'étape en échec et lance quand même les suivantes", async () => {
        const failing = writeScript('failing.mjs', 'process.exit(1);');
        const writing = writeScript(
            'writing.mjs',
            `import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(marker)}, 'ok');`,
        );

        const failures = await runSteps(
            [
                { label: 'Échec', args: [failing] },
                { label: 'Suite', args: [writing] },
            ],
            false,
        );

        expect(failures).toEqual(['Échec']);
        expect(fs.existsSync(marker)).toBe(true);
    });

    it('en simulation, lance dryRunArgs et saute les étapes qui n’en ont pas', async () => {
        const writing = writeScript(
            'writing.mjs',
            `import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(marker)}, process.argv[2]);`,
        );

        const failures = await runSteps(
            [
                { label: 'Sans simulation', args: [writing, 'reel'] },
                { label: 'Avec simulation', args: [writing, 'reel'], dryRunArgs: [writing, 'simule'] },
            ],
            true,
        );

        expect(failures).toEqual([]);
        expect(fs.readFileSync(marker, 'utf8')).toBe('simule');
    });
});
