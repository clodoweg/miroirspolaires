/**
 * Mode d'accès à l'administration et configuration de l'admin distant.
 *
 * Responsabilité : décider où l'admin est actif et lire la configuration de l'admin distant
 * (GitHub App, session) depuis les variables d'environnement.
 *
 * Trois modes :
 *  - `local` : `npm run dev`. Aucun login, lecture et écriture sur le disque (comportement historique).
 *  - `remote` : déploiement Preview Vercel de la branche de contenu (`dev` par défaut), avec toute la
 *    configuration présente. Login GitHub obligatoire, contenu lu par l'API GitHub.
 *  - `disabled` : partout ailleurs, production comprise. `/admin` et `/api/admin` répondent 404.
 *
 * WARNING: sécurité. La production (`VERCEL_ENV=production`) est toujours `disabled`, même si les
 * variables y étaient définies par erreur : l'admin ne doit jamais s'ouvrir sur le site public.
 */

/** Source de variables d'environnement (sous-ensemble de `process.env`). */
export type EnvSource = Record<string, string | undefined>;

export type AdminAccessMode = 'local' | 'remote' | 'disabled';

export interface RemoteAdminConfig {
    /** Branche dont le déploiement Preview porte l'admin, et où le contenu est lu et écrit. */
    contentBranch: string;
    /** Branche de production, cible de « Mettre en production » (PR contenu → production). */
    productionBranch: string;
    repository: { owner: string; name: string };
    appId: string;
    /** Clé privée PEM de la GitHub App (PKCS#1 ou PKCS#8). */
    privateKey: string;
    installationId: string;
    clientId: string;
    clientSecret: string;
    /** Identifiant numérique GitHub du seul compte autorisé. */
    adminUserId: number;
    sessionSecret: string;
}

export const DEFAULT_CONTENT_BRANCH = 'dev';
export const DEFAULT_PRODUCTION_BRANCH = 'main';
const MIN_SESSION_SECRET_LENGTH = 32;

/**
 * Lit la configuration de l'admin distant.
 *
 * POURQUOI : le dépôt vient des variables système de Vercel (`VERCEL_GIT_REPO_OWNER`,
 * `VERCEL_GIT_REPO_SLUG`), surchargeables par `ADMIN_GITHUB_REPOSITORY` (`owner/nom`).
 *
 * @param env - Variables d'environnement.
 * @returns La configuration, ou `null` si une valeur manque ou est invalide.
 */
export function readRemoteAdminConfig(env: EnvSource): RemoteAdminConfig | null {
    const [repoOwner, repoName] = (env.ADMIN_GITHUB_REPOSITORY ?? '').split('/');
    const owner = repoOwner || env.VERCEL_GIT_REPO_OWNER;
    const name = repoName || env.VERCEL_GIT_REPO_SLUG;
    const adminUserId = Number(env.ADMIN_GITHUB_USER_ID);
    const sessionSecret = env.ADMIN_SESSION_SECRET ?? '';
    const required = [
        owner,
        name,
        env.GITHUB_APP_ID,
        env.GITHUB_APP_PRIVATE_KEY,
        env.GITHUB_APP_INSTALLATION_ID,
        env.GITHUB_APP_CLIENT_ID,
        env.GITHUB_APP_CLIENT_SECRET,
    ];
    if (required.some((value) => !value?.trim())) return null;
    if (!Number.isSafeInteger(adminUserId) || adminUserId <= 0) return null;
    if (sessionSecret.length < MIN_SESSION_SECRET_LENGTH) return null;

    return {
        contentBranch: env.ADMIN_CONTENT_BRANCH?.trim() || DEFAULT_CONTENT_BRANCH,
        productionBranch: env.ADMIN_PRODUCTION_BRANCH?.trim() || DEFAULT_PRODUCTION_BRANCH,
        repository: { owner: owner as string, name: name as string },
        appId: (env.GITHUB_APP_ID as string).trim(),
        privateKey: normalizePrivateKey(env.GITHUB_APP_PRIVATE_KEY as string),
        installationId: (env.GITHUB_APP_INSTALLATION_ID as string).trim(),
        clientId: (env.GITHUB_APP_CLIENT_ID as string).trim(),
        clientSecret: (env.GITHUB_APP_CLIENT_SECRET as string).trim(),
        adminUserId,
        sessionSecret,
    };
}

/**
 * Rétablit les retours à la ligne d'une clé PEM collée sur une seule ligne.
 *
 * POURQUOI : selon l'outil, la clé arrive dans Vercel avec de vrais retours à la ligne ou avec des `\n`
 * littéraux ; `node:crypto` refuse la seconde forme.
 *
 * @param raw - Valeur de la variable d'environnement.
 * @returns La clé PEM avec de vrais retours à la ligne.
 */
export function normalizePrivateKey(raw: string): string {
    return raw.trim().replace(/\\n/g, '\n');
}

/**
 * Détermine le mode d'accès à l'admin.
 *
 * @param isDev - `import.meta.env.DEV`.
 * @param env - Variables d'environnement (système Vercel comprises).
 * @returns `local` en dev, `remote` sur la Preview de la branche de contenu configurée, `disabled` sinon.
 */
export function resolveAdminAccessMode(isDev: boolean, env: EnvSource): AdminAccessMode {
    if (isDev) return 'local';
    if (env.VERCEL_ENV !== 'preview') return 'disabled';
    const config = readRemoteAdminConfig(env);
    if (!config) return 'disabled';
    return env.VERCEL_GIT_COMMIT_REF === config.contentBranch ? 'remote' : 'disabled';
}

/**
 * Mode d'accès du processus courant.
 *
 * POURQUOI : `process.env` est lu à chaque appel (et non au chargement du module) : les variables
 * système de Vercel ne sont fiables qu'à l'exécution, et les tests les modifient avec `vi.stubEnv`.
 *
 * @returns Le mode d'accès.
 */
export function getAdminAccessMode(): AdminAccessMode {
    return resolveAdminAccessMode(import.meta.env.DEV === true, process.env);
}

/**
 * Configuration de l'admin distant du processus courant.
 *
 * @returns La configuration.
 * @throws Si l'admin distant n'est pas configuré : n'appeler qu'en mode `remote`.
 */
export function getRemoteAdminConfig(): RemoteAdminConfig {
    const config = readRemoteAdminConfig(process.env);
    if (!config) throw new Error('Admin distant non configuré');
    return config;
}
