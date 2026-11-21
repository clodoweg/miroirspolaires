// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';

class FakeChildProcess extends EventEmitter {
    stdout = new EventEmitter();
    stderr = new EventEmitter();
    pid = 4242;
    killed = false;
    kill = vi.fn((signal?: string) => {
        this.killed = true;
        return signal !== undefined;
    });
}

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn, default: { spawn } }));

import { GET } from './run';

let child: FakeChildProcess;

function callGet(query: string, signal?: AbortSignal) {
    const url = new URL(`http://localhost:4321/api/admin/scripts/run${query}`);
    const request = new Request(url, { signal });
    return GET({ url, request } as unknown as Parameters<typeof GET>[0]);
}

async function readAll(response: Response): Promise<string> {
    return new Response(response.body).text();
}

describe('GET /api/admin/scripts/run', () => {
    beforeEach(() => {
        vi.stubEnv('DEV', true);
        child = new FakeChildProcess();
        spawn.mockReset();
        spawn.mockReturnValue(child);
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('renvoie 404 hors du mode développement sans lancer de processus', async () => {
        vi.stubEnv('DEV', false);
        expect((await callGet('?id=sync-r2')).status).toBe(404);
        expect(spawn).not.toHaveBeenCalled();
    });

    it('exige un identifiant de script', async () => {
        const response = await callGet('');
        expect(response.status).toBe(400);
        expect(await response.text()).toBe('Missing id');
    });

    it('refuse un script non déclaré', async () => {
        const response = await callGet('?id=rm-rf');
        expect(response.status).toBe(404);
        expect(spawn).not.toHaveBeenCalled();
    });

    it('lance le script déclaré avec ses arguments et diffuse sa sortie en SSE', async () => {
        const response = await callGet('?id=sync-r2&arg=-i&arg=blog');
        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toBe('text/event-stream');
        expect(spawn).toHaveBeenCalledWith(
            'node',
            ['scripts/r2/upload_local_to_r2.js', '-i', 'blog'],
            expect.objectContaining({ cwd: process.cwd(), env: expect.objectContaining({ FORCE_COLOR: '0' }) }),
        );

        child.stdout.emit('data', Buffer.from('ligne 1\nligne 2'));
        child.stderr.emit('data', Buffer.from('attention'));
        child.emit('error', new Error('EPIPE'));
        child.emit('close', 0);

        const text = await readAll(response);
        expect(text).toContain(
            'event: start\ndata: {"id":"sync-r2","command":"node scripts/r2/upload_local_to_r2.js -i blog","pid":0}',
        );
        expect(text).toContain('"pid":4242');
        expect(text).toContain('event: stdout\ndata: ligne 1\ndata: ligne 2\n\n');
        expect(text).toContain('event: stderr\ndata: attention\n\n');
        expect(text).toContain('event: error\ndata: EPIPE\n\n');
        expect(text).toContain('event: exit\ndata: {"code":0}\n\n');
    });

    it('transmet un code de sortie non nul', async () => {
        const response = await callGet('?id=sync-r2');
        child.emit('close', 1);
        expect(await readAll(response)).toContain('event: exit\ndata: {"code":1}');
    });

    it('tue le processus quand le client interrompt la requête', async () => {
        const controller = new AbortController();
        const response = await callGet('?id=sync-r2', controller.signal);
        controller.abort();
        expect(child.kill).toHaveBeenCalledWith('SIGTERM');
        await readAll(response);
        child.emit('close', null);
        child.stdout.emit('data', Buffer.from('après fermeture'));
        expect(child.kill).toHaveBeenCalledTimes(1);
    });

    it('tue le processus quand le flux est annulé, une seule fois', async () => {
        const response = await callGet('?id=sync-r2');
        await response.body?.cancel();
        expect(child.kill).toHaveBeenCalledWith('SIGTERM');
        await response.body?.cancel().catch(() => undefined);
        expect(child.kill).toHaveBeenCalledTimes(1);
    });
});
