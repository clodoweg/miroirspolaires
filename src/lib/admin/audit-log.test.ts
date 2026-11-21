// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
    countAdminActionsSince,
    isAuditedRequest,
    listAdminActions,
    recordAdminAction,
    type AuditDatabase,
    type AuditEntry,
} from './audit-log';

/** Fausse base : garde les lignes insérées et répond aux trois requêtes du module. */
function fakeDatabase() {
    const rows: (AuditEntry & { id: number })[] = [];
    const execute = vi.fn(async (statement: { sql: string; args?: (string | number)[] } | string) => {
        const sql = typeof statement === 'string' ? statement : statement.sql;
        const args = typeof statement === 'string' ? [] : (statement.args ?? []);
        if (sql.startsWith('INSERT')) {
            const [at, actor, method, path, status] = args;
            rows.push({
                id: rows.length + 1,
                at: String(at),
                actor: String(actor),
                method: String(method),
                path: String(path),
                status: Number(status),
            });
        }
        if (sql.startsWith('SELECT COUNT')) {
            const [actor, since] = args;
            return { rows: [{ total: rows.filter((row) => row.actor === actor && row.at >= String(since)).length }] };
        }
        if (sql.startsWith('SELECT at')) {
            return { rows: [...rows].reverse().slice(0, Number(args[0])) };
        }
        return { rows: [] };
    });
    return { database: { execute } as AuditDatabase, rows, execute };
}

const ENTRY: AuditEntry = {
    at: '2026-11-10T10:00:00.000Z',
    actor: 'clodoweg',
    method: 'PUT',
    path: '/api/admin/posts/2026/a',
    status: 200,
};

describe('isAuditedRequest', () => {
    it('ne retient que les écritures de l’API admin', () => {
        expect(isAuditedRequest('PUT', '/api/admin/posts/2026/a')).toBe(true);
        expect(isAuditedRequest('POST', '/api/admin/uploads')).toBe(true);
        expect(isAuditedRequest('GET', '/api/admin/posts')).toBe(false);
        expect(isAuditedRequest('HEAD', '/api/admin/posts')).toBe(false);
        expect(isAuditedRequest('POST', '/api/auth/github/logout')).toBe(false);
    });
});

describe('journal d’audit', () => {
    it('crée la table une fois, enregistre, compte et relit les actions', async () => {
        const { database, execute } = fakeDatabase();
        await recordAdminAction(ENTRY, database);
        await recordAdminAction({ ...ENTRY, at: '2026-11-10T10:05:00.000Z', status: 409 }, database);
        await recordAdminAction({ ...ENTRY, actor: 'autre', at: '2026-11-10T10:06:00.000Z' }, database);

        const creates = execute.mock.calls.filter(([statement]) => String(statement).startsWith('CREATE TABLE'));
        expect(creates).toHaveLength(1);
        expect(await countAdminActionsSince('clodoweg', '2026-11-10T10:01:00.000Z', database)).toBe(1);
        const { entries } = await listAdminActions(2, database);
        expect(entries.map((entry) => entry.actor)).toEqual(['autre', 'clodoweg']);
        expect(entries[1].status).toBe(409);
    });

    it('borne la limite de lecture et tronque les chemins', async () => {
        const { database, execute, rows } = fakeDatabase();
        await recordAdminAction({ ...ENTRY, path: `/api/admin/${'x'.repeat(600)}` }, database);
        expect(rows[0].path).toHaveLength(500);
        await listAdminActions(10_000, database);
        await listAdminActions(0, database);
        const limits = execute.mock.calls
            .map(([statement]) => statement)
            .filter((statement) => typeof statement !== 'string' && statement.sql.startsWith('SELECT at'))
            .map((statement) => (statement as { args: number[] }).args[0]);
        expect(limits).toEqual([500, 1]);
    });

    it('n’échoue jamais : erreurs journalisées, compteur et lecture neutres', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const broken = { execute: vi.fn(async () => Promise.reject(new Error('Turso indisponible'))) } as AuditDatabase;
        await expect(recordAdminAction(ENTRY, broken)).resolves.toBeUndefined();
        expect(await countAdminActionsSince('clodoweg', ENTRY.at, broken)).toBeNull();
        expect(await listAdminActions(10, broken)).toEqual({
            entries: [],
            error: 'Lecture du journal impossible (Turso).',
        });
        vi.restoreAllMocks();
    });
});

describe('journal sans Turso', () => {
    it('se désactive si @/lib/db ne peut pas se charger', async () => {
        vi.resetModules();
        vi.doMock('@/lib/db', () => {
            throw new Error('TURSO_DATABASE_URL manquante');
        });
        const module = await import('./audit-log');
        await expect(module.recordAdminAction(ENTRY)).resolves.toBeUndefined();
        expect(await module.countAdminActionsSince('clodoweg', ENTRY.at)).toBeNull();
        expect((await module.listAdminActions()).error).toContain('Turso');
        vi.doUnmock('@/lib/db');
    });
});
