/**
 * Diagnostic de l'accès de l'admin distant au dépôt GitHub.
 *
 * Responsabilité : vérifier pas à pas le jeton d'installation, l'accès au dépôt, la branche de contenu
 * et la lecture d'un dossier, puis traduire chaque échec en piste de correction. Sert la route
 * `GET /api/admin/diagnostics`.
 *
 * WARNING: sécurité. Le résultat ne contient que des statuts HTTP, le dépôt et la branche, jamais un
 * jeton, une clé ou un identifiant d'App.
 */
import type { RemoteAdminConfig } from '../auth/config';
import { GitHubApiError, type GitHubAppClient } from './app-client';

export interface DiagnosticStep {
    step: 'installation-token' | 'repository' | 'branch' | 'content';
    ok: boolean;
    /** Statut HTTP de GitHub, ou 0 si l'appel n'a pas abouti. */
    status: number;
    hint?: string;
}

export interface RemoteAccessDiagnostic {
    repository: string;
    branch: string;
    ok: boolean;
    steps: DiagnosticStep[];
}

const TOKEN_HINTS: Record<number, string> = {
    401: 'GitHub refuse le JWT de l’App : vérifier GITHUB_APP_ID et GITHUB_APP_PRIVATE_KEY (clé de cette App, contenu complet du .pem).',
    404: 'Installation introuvable : vérifier GITHUB_APP_INSTALLATION_ID (nombre à la fin de l’URL de la page de l’installation).',
};

/**
 * Teste l'accès de l'admin distant au dépôt, en s'arrêtant à la première étape en échec.
 *
 * @param client - Client GitHub App configuré.
 * @param config - Configuration de l'admin distant.
 * @returns Le résultat de chaque étape tentée.
 */
export async function diagnoseRemoteAccess(
    client: GitHubAppClient,
    config: RemoteAdminConfig,
): Promise<RemoteAccessDiagnostic> {
    const repository = `${config.repository.owner}/${config.repository.name}`;
    const branch = config.contentBranch;
    const steps: DiagnosticStep[] = [];
    const finish = () => ({ repository, branch, ok: steps.every((step) => step.ok), steps });

    try {
        await client.getInstallationToken();
        steps.push({ step: 'installation-token', ok: true, status: 201 });
    } catch (error) {
        const status = error instanceof GitHubApiError ? error.status : 0;
        steps.push({
            step: 'installation-token',
            ok: false,
            status,
            hint:
                TOKEN_HINTS[status] ??
                'Jeton d’installation impossible : vérifier la clé privée (format PEM) et la configuration de l’App.',
        });
        return finish();
    }

    const checks: { step: DiagnosticStep['step']; path: string; hint: string }[] = [
        {
            step: 'repository',
            path: client.repoPath,
            hint: `Dépôt ${repository} inaccessible : installer l’App sur ce dépôt (Only select repositories) et vérifier la permission Contents.`,
        },
        {
            step: 'branch',
            path: `${client.repoPath}/branches/${encodeURIComponent(branch)}`,
            hint: `Branche ${branch} introuvable : vérifier ADMIN_CONTENT_BRANCH.`,
        },
        {
            step: 'content',
            path: `${client.repoPath}/contents/src/content/blog?ref=${encodeURIComponent(branch)}`,
            hint: 'Lecture du contenu refusée : donner à l’App la permission Contents (Read), puis accepter la mise à jour des permissions sur l’installation.',
        },
    ];
    for (const check of checks) {
        const response = await client.request(check.path);
        steps.push({
            step: check.step,
            ok: response.ok,
            status: response.status,
            ...(response.ok ? {} : { hint: check.hint }),
        });
        if (!response.ok) break;
    }
    return finish();
}
