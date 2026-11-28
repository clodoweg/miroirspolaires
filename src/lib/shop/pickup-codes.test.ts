// @vitest-environment node
import { createClient } from '@libsql/client';
import { describe, expect, it } from 'vitest';
import {
    PICKUP_CODE_VALIDITY_DAYS,
    PICKUP_REQUEST_LIMITS,
    approvePickupRequest,
    attachCheckoutSession,
    closePickupRequest,
    createPickupRequest,
    findUsablePickupCode,
    generatePickupCode,
    getPickupRequest,
    isPickupRequestRateLimited,
    listPickupRequests,
    markPickupCodeUsed,
    normalizePickupCode,
    resolvePickupDatabase,
    type PickupDatabase,
} from './pickup-codes';

function memoryDatabase(): PickupDatabase {
    return createClient({ url: ':memory:' }) as unknown as PickupDatabase;
}

const NOW = new Date('2026-11-28T10:00:00Z');
const INPUT = { name: 'Camille', email: 'camille@example.org', place: 'Lyon', message: '', clientHash: 'h1' };

describe('generatePickupCode / normalizePickupCode', () => {
    it('tire des codes au format MP-XXXX-XXXX sans caractère ambigu', () => {
        const codes = new Set(Array.from({ length: 200 }, generatePickupCode));
        expect(codes.size).toBe(200);
        for (const code of codes) expect(code).toMatch(/^MP-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
    });

    it.each([
        ['mp-7k4q-x9rt', 'MP-7K4Q-X9RT'],
        [' MP 7K4Q X9RT ', 'MP-7K4Q-X9RT'],
        ['7K4QX9RT', 'MP-7K4Q-X9RT'],
    ])('remet en forme %s', (raw, expected) => {
        expect(normalizePickupCode(raw)).toBe(expected);
    });

    it.each([[''], ['MP-7K4Q'], ['MP-7K4Q-X9R0'], ['MP-7K4Q-X9RT-AAAA'], [42], [null]])('refuse %s', (raw) => {
        expect(normalizePickupCode(raw)).toBeNull();
    });
});

describe('cycle de vie d’une demande (SQL réel, base en mémoire)', () => {
    it('crée, liste puis accepte une demande avec un code valable 30 jours', async () => {
        const database = memoryDatabase();
        const created = await createPickupRequest(INPUT, NOW, database);
        expect(created.status).toBe('pending');
        expect(await listPickupRequests(10, database)).toEqual([created]);

        const approved = await approvePickupRequest(created.id, NOW, database);
        expect(approved?.status).toBe('approved');
        expect(normalizePickupCode(approved?.code)).toBe(approved?.code);
        expect(new Date(approved!.expiresAt!).getTime() - NOW.getTime()).toBe(PICKUP_CODE_VALIDITY_DAYS * 86_400_000);
        // POURQUOI : une seconde acceptation ne doit pas changer le code déjà envoyé.
        expect(await approvePickupRequest(created.id, NOW, database)).toBeNull();
    });

    it('ne retrouve un code que s’il est accepté et non expiré', async () => {
        const database = memoryDatabase();
        const created = await createPickupRequest(INPUT, NOW, database);
        expect(await getPickupRequest('inconnu', database)).toBeNull();
        const approved = await approvePickupRequest(created.id, NOW, database);
        const code = approved!.code!;
        expect((await findUsablePickupCode(code, NOW, database))?.id).toBe(created.id);
        const later = new Date(NOW.getTime() + (PICKUP_CODE_VALIDITY_DAYS + 1) * 86_400_000);
        expect(await findUsablePickupCode(code, later, database)).toBeNull();
        expect(await findUsablePickupCode('MP-AAAA-AAAA', NOW, database)).toBeNull();
    });

    it('refuse une demande en attente et révoque un code accepté', async () => {
        const database = memoryDatabase();
        const pending = await createPickupRequest(INPUT, NOW, database);
        expect((await closePickupRequest(pending.id, NOW, database))?.status).toBe('rejected');
        expect(await closePickupRequest(pending.id, NOW, database)).toBeNull();

        const other = await createPickupRequest({ ...INPUT, email: 'b@example.org' }, NOW, database);
        const approved = await approvePickupRequest(other.id, NOW, database);
        expect((await closePickupRequest(other.id, NOW, database))?.status).toBe('revoked');
        expect(await findUsablePickupCode(approved!.code!, NOW, database)).toBeNull();
    });

    it('rattache la session Stripe puis consomme le code une seule fois', async () => {
        const database = memoryDatabase();
        const created = await createPickupRequest(INPUT, NOW, database);
        const approved = await approvePickupRequest(created.id, NOW, database);
        await attachCheckoutSession(created.id, 'cs_test_1', database);
        expect((await getPickupRequest(created.id, database))?.stripeSessionId).toBe('cs_test_1');

        expect(await markPickupCodeUsed(created.id, 'cs_test_1', NOW, database)).toBe(true);
        // POURQUOI : Stripe peut renvoyer le même événement ; le rejouer reste un succès.
        expect(await markPickupCodeUsed(created.id, 'cs_test_1', NOW, database)).toBe(true);
        expect(await markPickupCodeUsed(created.id, 'cs_test_2', NOW, database)).toBe(false);
        expect(await findUsablePickupCode(approved!.code!, NOW, database)).toBeNull();
        expect((await getPickupRequest(created.id, database))?.usedAt).toBe(NOW.toISOString());
    });

    it('plafonne les demandes par e-mail et par client', async () => {
        const database = memoryDatabase();
        expect(await isPickupRequestRateLimited(INPUT.email, 'h1', NOW, database)).toBe(false);
        for (let index = 0; index < PICKUP_REQUEST_LIMITS.perEmailPerDay; index++) {
            await createPickupRequest({ ...INPUT, clientHash: `h-${index}` }, NOW, database);
        }
        expect(await isPickupRequestRateLimited(INPUT.email, 'autre', NOW, database)).toBe(true);
        const tomorrow = new Date(NOW.getTime() + 25 * 3_600_000);
        expect(await isPickupRequestRateLimited(INPUT.email, 'autre', tomorrow, database)).toBe(false);

        for (let index = 0; index < PICKUP_REQUEST_LIMITS.perClientPerHour; index++) {
            await createPickupRequest({ ...INPUT, email: `x${index}@example.org`, clientHash: 'robot' }, NOW, database);
        }
        expect(await isPickupRequestRateLimited('neuf@example.org', 'robot', NOW, database)).toBe(true);
    });

    it('retire un code en cas de collision sur la contrainte UNIQUE', async () => {
        const real = memoryDatabase();
        let collisions = 1;
        const flaky: PickupDatabase = {
            execute: async (statement) => {
                if (
                    typeof statement !== 'string' &&
                    statement.sql.includes("SET status = 'approved'") &&
                    collisions > 0
                ) {
                    collisions--;
                    throw new Error('SQLITE_CONSTRAINT: UNIQUE constraint failed');
                }
                return real.execute(statement);
            },
        };
        const created = await createPickupRequest(INPUT, NOW, flaky);
        expect((await approvePickupRequest(created.id, NOW, flaky))?.status).toBe('approved');
    });

    it('propage une erreur SQL autre qu’une collision', async () => {
        const real = memoryDatabase();
        const broken: PickupDatabase = {
            execute: async (statement) => {
                if (typeof statement !== 'string' && statement.sql.includes("SET status = 'approved'")) {
                    throw new Error('disque plein');
                }
                return real.execute(statement);
            },
        };
        const created = await createPickupRequest(INPUT, NOW, broken);
        await expect(approvePickupRequest(created.id, NOW, broken)).rejects.toThrow('disque plein');
    });

    it('renvoie la base injectée telle quelle', async () => {
        const database = memoryDatabase();
        expect(await resolvePickupDatabase(database)).toBe(database);
    });
});
