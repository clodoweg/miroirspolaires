import type { APIRoute } from 'astro';
import { spawn } from 'node:child_process';
import { requireAdmin } from '@/lib/admin/shared';
import { getScript } from '@/lib/admin/scripts';
import { isLocalAdmin } from '@/lib/admin/auth/access';

export const prerender = false;

/**
 * Spawns the requested script and streams stdout/stderr as Server-Sent Events.
 * GET so EventSource-style consumers can connect; aborting the request kills the child.
 */
export const GET: APIRoute = async ({ url, request, locals }) => {
    const blocked = requireAdmin(locals);
    if (blocked) return blocked;
    // WARNING: spawn() n'a de sens qu'en local. Défense en profondeur : le middleware ferme déjà cette
    // route sur l'admin distant.
    if (!isLocalAdmin(locals)) return new Response('Scripts disponibles seulement en npm run dev', { status: 501 });
    const id = url.searchParams.get('id');
    if (!id) return new Response('Missing id', { status: 400 });
    const script = getScript(id);
    if (!script) return new Response('Unknown script', { status: 404 });
    if (script.remoteOnly) return new Response('Script réservé à l’admin distant (GitHub Actions)', { status: 400 });

    const enc = new TextEncoder();
    let proc: ReturnType<typeof spawn> | null = null;

    const stream = new ReadableStream({
        start(controller) {
            const send = (event: string, data: string) => {
                const payload = data
                    .split('\n')
                    .map((l) => `data: ${l}`)
                    .join('\n');
                try {
                    controller.enqueue(enc.encode(`event: ${event}\n${payload}\n\n`));
                } catch {
                    /* closed */
                }
            };

            const extraArgs = url.searchParams.getAll('arg');
            const finalArgs = [...script.args, ...extraArgs];

            send('start', JSON.stringify({ id: script.id, command: [script.command, ...finalArgs].join(' '), pid: 0 }));

            proc = spawn(script.command, finalArgs, {
                cwd: process.cwd(),
                env: { ...process.env, FORCE_COLOR: '0' },
            });

            send(
                'start',
                JSON.stringify({
                    id: script.id,
                    command: [script.command, ...finalArgs].join(' '),
                    pid: proc.pid ?? 0,
                }),
            );

            proc.stdout?.on('data', (chunk: Buffer) => send('stdout', chunk.toString('utf-8')));
            proc.stderr?.on('data', (chunk: Buffer) => send('stderr', chunk.toString('utf-8')));
            proc.on('error', (err) => send('error', err.message));
            proc.on('close', (code) => {
                send('exit', JSON.stringify({ code }));
                // POURQUOI: Laisser 50ms au flux ReadableStream pour flusher l'événement 'exit'
                // vers le client avant la fermeture définitive de la connexion SSE.
                setTimeout(() => {
                    try {
                        controller.close();
                    } catch {
                        /* already closed */
                    }
                }, 50);
            });

            request.signal.addEventListener('abort', () => {
                if (proc && !proc.killed) proc.kill('SIGTERM');
                try {
                    controller.close();
                } catch {
                    /* already closed */
                }
            });
        },
        cancel() {
            if (proc && !proc.killed) proc.kill('SIGTERM');
        },
    });

    return new Response(stream, {
        status: 200,
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
        },
    });
};
