// @vitest-environment node
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createAppJwt, GitHubApiError, GitHubAppClient } from './app-client';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PRIVATE_PEM = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();
const NOW_MS = 1_800_000_000_000;

function decodePart(part: string) {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

describe('createAppJwt', () => {
    it('signe un JWT RS256 vérifiable, émis 60 s dans le passé', () => {
        const jwt = createAppJwt('123', PRIVATE_PEM, 1000);
        const [header, payload, signature] = jwt.split('.');
        expect(decodePart(header)).toEqual({ alg: 'RS256', typ: 'JWT' });
        expect(decodePart(payload)).toEqual({ iat: 940, exp: 1480, iss: '123' });
        const valid = createVerify('RSA-SHA256')
            .update(`${header}.${payload}`)
            .verify(publicKey, signature, 'base64url');
        expect(valid).toBe(true);
    });
});

describe('GitHubAppClient', () => {
    function makeClient(fetchImpl: typeof fetch, now = () => NOW_MS) {
        return new GitHubAppClient({
            appId: '123',
            privateKey: PRIVATE_PEM,
            installationId: '456',
            owner: 'clodoweg',
            repo: 'miroirs polaires',
            fetchImpl,
            now,
        });
    }

    it('obtient, met en cache puis renouvelle le jeton d’installation', async () => {
        let clock = NOW_MS;
        const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
            if (String(input).endsWith('/access_tokens')) {
                return Response.json({ token: `tok-${clock}`, expires_at: new Date(clock + 3600_000).toISOString() });
            }
            return new Response('ok');
        }) as unknown as typeof fetch;
        const client = makeClient(fetchImpl, () => clock);

        await client.request('/x');
        await client.request('/y');
        expect(vi.mocked(fetchImpl).mock.calls.filter(([url]) => String(url).endsWith('/access_tokens'))).toHaveLength(
            1,
        );
        const [, init] = vi.mocked(fetchImpl).mock.calls[1];
        expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer tok-${NOW_MS}`);

        clock += 56 * 60 * 1000;
        await client.request('/z');
        expect(vi.mocked(fetchImpl).mock.calls.filter(([url]) => String(url).endsWith('/access_tokens'))).toHaveLength(
            2,
        );
    });

    it('transmet le type de média demandé et encode le dépôt', async () => {
        const fetchImpl = vi.fn(async (input: RequestInfo | URL) =>
            String(input).endsWith('/access_tokens')
                ? Response.json({ token: 't', expires_at: new Date(NOW_MS + 3600_000).toISOString() })
                : new Response('raw'),
        ) as unknown as typeof fetch;
        const client = makeClient(fetchImpl);
        expect(client.repoPath).toBe('/repos/clodoweg/miroirs%20polaires');
        await client.request('/r', { accept: 'application/vnd.github.raw+json' });
        const [url, init] = vi.mocked(fetchImpl).mock.calls[1];
        expect(url).toBe('https://api.github.com/r');
        expect((init?.headers as Record<string, string>).Accept).toBe('application/vnd.github.raw+json');
    });

    it('lève une GitHubApiError si GitHub refuse le jeton', async () => {
        const client = makeClient(vi.fn(async () => new Response('{}', { status: 401 })) as unknown as typeof fetch);
        await expect(client.getInstallationToken()).rejects.toBeInstanceOf(GitHubApiError);
    });
});
