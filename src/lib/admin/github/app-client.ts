/**
 * Client minimal de l'API GitHub authentifié comme GitHub App (jeton d'installation).
 *
 * Responsabilité : signer le JWT de l'App (RS256), obtenir et mettre en cache le jeton d'installation,
 * puis appeler l'API REST du dépôt configuré. Sans dépendance (pas d'Octokit) : `fetch` et `node:crypto`.
 *
 * WARNING: sécurité. La clé privée et les jetons ne doivent jamais sortir de ce module (ni logs, ni
 * réponses). Le jeton d'installation donne accès en écriture au dépôt.
 */
import { createPrivateKey, createSign } from 'node:crypto';

const API_ROOT = 'https://api.github.com';
const API_VERSION = '2022-11-28';
/** Marge avant expiration à partir de laquelle le jeton d'installation est renouvelé. */
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

export interface GitHubAppClientOptions {
    appId: string;
    privateKey: string;
    installationId: string;
    owner: string;
    repo: string;
    fetchImpl?: typeof fetch;
    now?: () => number;
}

export class GitHubApiError extends Error {
    constructor(
        readonly status: number,
        message: string,
    ) {
        super(message);
        this.name = 'GitHubApiError';
    }
}

/**
 * Signe le JWT d'authentification de la GitHub App.
 *
 * POURQUOI `iat` 60 s dans le passé : GitHub refuse un JWT émis « dans le futur » si les horloges
 * divergent légèrement ; durée totale 9 min, sous le plafond de 10 min.
 *
 * @param appId - Identifiant de l'App.
 * @param privateKeyPem - Clé privée PEM (PKCS#1 ou PKCS#8).
 * @param nowSeconds - Instant courant (secondes).
 * @returns Le JWT compact.
 */
export function createAppJwt(appId: string, privateKeyPem: string, nowSeconds: number): string {
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
        iat: nowSeconds - 60,
        exp: nowSeconds + 8 * 60,
        iss: appId,
    })}`;
    const signature = createSign('RSA-SHA256').update(unsigned).sign(createPrivateKey(privateKeyPem), 'base64url');
    return `${unsigned}.${signature}`;
}

/** Client de l'API GitHub limité au dépôt et à l'installation configurés. */
export class GitHubAppClient {
    private readonly fetchImpl: typeof fetch;
    private readonly now: () => number;
    private cachedToken: { value: string; expiresAt: number } | null = null;

    constructor(private readonly options: GitHubAppClientOptions) {
        this.fetchImpl = options.fetchImpl ?? fetch;
        this.now = options.now ?? Date.now;
    }

    /** Chemin `/repos/<owner>/<repo>` du dépôt configuré. */
    get repoPath(): string {
        return `/repos/${encodeURIComponent(this.options.owner)}/${encodeURIComponent(this.options.repo)}`;
    }

    /**
     * Jeton d'installation, renouvelé 5 min avant son expiration (durée de vie GitHub : 1 h).
     *
     * @returns Le jeton.
     */
    async getInstallationToken(): Promise<string> {
        if (this.cachedToken && this.cachedToken.expiresAt - TOKEN_REFRESH_MARGIN_MS > this.now()) {
            return this.cachedToken.value;
        }
        const jwt = createAppJwt(this.options.appId, this.options.privateKey, Math.floor(this.now() / 1000));
        const response = await this.fetchImpl(
            `${API_ROOT}/app/installations/${encodeURIComponent(this.options.installationId)}/access_tokens`,
            { method: 'POST', headers: this.headers(jwt) },
        );
        const body = (await response.json().catch(() => null)) as { token?: string; expires_at?: string } | null;
        if (!response.ok || !body?.token || !body.expires_at) {
            throw new GitHubApiError(response.status, `Jeton d'installation refusé (${response.status})`);
        }
        this.cachedToken = { value: body.token, expiresAt: Date.parse(body.expires_at) };
        return body.token;
    }

    /**
     * Appelle l'API REST avec le jeton d'installation.
     *
     * @param apiPath - Chemin commençant par `/` (ex. `${client.repoPath}/contents/x`).
     * @param init - Options `fetch` ; `accept` remplace le type de média par défaut.
     * @returns La réponse brute (le statut reste à vérifier par l'appelant).
     */
    async request(apiPath: string, init: RequestInit & { accept?: string } = {}): Promise<Response> {
        const token = await this.getInstallationToken();
        const { accept, headers, ...rest } = init;
        return this.fetchImpl(`${API_ROOT}${apiPath}`, {
            ...rest,
            headers: { ...this.headers(token, accept), ...(headers as Record<string, string> | undefined) },
        });
    }

    private headers(bearer: string, accept = 'application/vnd.github+json'): Record<string, string> {
        return {
            Accept: accept,
            Authorization: `Bearer ${bearer}`,
            'X-GitHub-Api-Version': API_VERSION,
            'User-Agent': 'miroirspolaires-admin',
        };
    }
}
