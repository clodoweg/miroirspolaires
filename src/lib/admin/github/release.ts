/**
 * Mise en production depuis l'admin distant : PR de la branche de contenu vers la branche de production.
 *
 * Responsabilité : dire ce que la branche de contenu (`dev`) a de plus que la production (`main`), ouvrir
 * la PR correspondante, résumer sa CI, puis la fusionner quand la CI est verte.
 *
 * WARNING: effet sur la production. Fusionner la PR déploie le site public ; la fusion est refusée tant
 * que la CI de la tête de la PR n'est pas entièrement verte, et se fait sur l'empreinte vue par
 * l'administrateur (`expectedHeadSha`), pour ne jamais publier un commit arrivé entre-temps.
 */
import { jsonResponse } from '../shared';
import { GitHubApiError, type GitHubAppClient } from './app-client';

export type ChecksState = 'none' | 'pending' | 'success' | 'failure';

export interface ReleaseCommit {
    sha: string;
    message: string;
    author: string;
    date: string;
}

export interface ReleasePullRequest {
    number: number;
    url: string;
    headSha: string;
    /** `null` tant que GitHub calcule la fusionnabilité. */
    mergeable: boolean | null;
    checks: ChecksState;
}

export interface ReleaseStatus {
    contentBranch: string;
    productionBranch: string;
    /** Nombre de commits de la branche de contenu absents de la production. */
    ahead: number;
    /** Les commits les plus récents en premier (50 au plus). */
    commits: ReleaseCommit[];
    pullRequest: ReleasePullRequest | null;
}

export interface ReleaseBranches {
    contentBranch: string;
    productionBranch: string;
}

/** Fusion refusée : CI pas verte, PR non fusionnable ou tête changée depuis l'affichage. */
export class ReleaseNotReadyError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ReleaseNotReadyError';
    }
}

const MAX_LISTED_COMMITS = 50;

async function readJson<T>(response: Response, context: string): Promise<T> {
    if (!response.ok) throw new GitHubApiError(response.status, `${context} : ${response.status}`);
    return (await response.json()) as T;
}

/**
 * Vérifications qui doivent figurer parmi les check runs avant toute mise en production : le job `verify`
 * de `.github/workflows/ci.yml` (lint, types, tests, build).
 *
 * POURQUOI : juste après l'ouverture de la PR, GitHub n'a souvent enregistré que la vérification de Vercel.
 * Sans cette liste, l'admin affichait « CI verte » avant même le démarrage de `verify`.
 */
export const REQUIRED_CHECK_NAMES = ['verify'];

type CheckRun = { name?: string; status?: string; conclusion?: string | null; started_at?: string | null };

/**
 * Garde, pour chaque nom, le check run le plus récent.
 *
 * POURQUOI : un même commit porte la CI du push sur dev et celle de la PR, toutes deux nommées `verify`.
 * Seule la dernière compte : une ancienne réussite ne doit pas masquer une exécution en cours ou en échec.
 */
function latestRunPerName(runs: CheckRun[]): CheckRun[] {
    const latest = new Map<string, CheckRun>();
    runs.forEach((run, index) => {
        const key = run.name ?? `#${index}`;
        const current = latest.get(key);
        if (!current || String(run.started_at ?? '') > String(current.started_at ?? '')) latest.set(key, run);
    });
    return [...latest.values()];
}

/**
 * Résume les vérifications (check runs) d'un commit.
 *
 * @param runs - Check runs renvoyés par GitHub.
 * @param requiredNames - Vérifications attendues ; tant que l'une manque, la CI est considérée en cours.
 * @param notBefore - Date d'ouverture de la PR : une vérification attendue lancée avant (CI du push sur dev)
 *   ne compte pas, celle de la PR doit apparaître.
 * @returns `none` sans vérification, `pending` si l'une tourne encore ou si une vérification attendue n'est
 *   pas encore apparue, `failure` si l'une échoue, sinon `success`.
 */
export function summarizeChecks(
    runs: CheckRun[],
    requiredNames: readonly string[] = REQUIRED_CHECK_NAMES,
    notBefore?: string | null,
): ChecksState {
    if (runs.length === 0) return 'none';
    const latest = latestRunPerName(runs);
    if (latest.some((run) => run.status !== 'completed')) return 'pending';
    const isFreshRequiredRun = (name: string) =>
        latest.some(
            (run) => run.name === name && (!notBefore || (run.started_at != null && run.started_at >= notBefore)),
        );
    if (requiredNames.some((name) => !isFreshRequiredRun(name))) return 'pending';
    const passing = new Set(['success', 'neutral', 'skipped']);
    return latest.every((run) => passing.has(String(run.conclusion))) ? 'success' : 'failure';
}

async function findOpenPullRequest(client: GitHubAppClient, branches: ReleaseBranches): Promise<number | null> {
    const owner = client.repoPath.split('/')[2];
    const query = new URLSearchParams({
        state: 'open',
        base: branches.productionBranch,
        head: `${decodeURIComponent(owner)}:${branches.contentBranch}`,
    });
    const pulls = await readJson<{ number: number }[]>(
        await client.request(`${client.repoPath}/pulls?${query.toString()}`),
        'Liste des PR',
    );
    return pulls[0]?.number ?? null;
}

async function readPullRequest(client: GitHubAppClient, number: number): Promise<ReleasePullRequest> {
    const pull = await readJson<{
        number: number;
        html_url: string;
        head: { sha: string };
        mergeable: boolean | null;
        created_at?: string;
    }>(await client.request(`${client.repoPath}/pulls/${number}`), 'Lecture de la PR');
    const checks = await readJson<{ check_runs: CheckRun[] }>(
        await client.request(`${client.repoPath}/commits/${pull.head.sha}/check-runs?per_page=100`),
        'Lecture de la CI',
    );
    return {
        number: pull.number,
        url: pull.html_url,
        headSha: pull.head.sha,
        mergeable: pull.mergeable,
        checks: summarizeChecks(checks.check_runs, REQUIRED_CHECK_NAMES, pull.created_at),
    };
}

/**
 * État de la mise en production : commits en attente et PR ouverte éventuelle.
 *
 * @param client - Client GitHub App.
 * @param branches - Branches de contenu et de production.
 * @returns L'état.
 */
export async function getReleaseStatus(client: GitHubAppClient, branches: ReleaseBranches): Promise<ReleaseStatus> {
    const comparison = await readJson<{
        ahead_by: number;
        commits: { sha: string; commit: { message: string; author?: { name?: string; date?: string } } }[];
    }>(
        await client.request(
            `${client.repoPath}/compare/${encodeURIComponent(branches.productionBranch)}...${encodeURIComponent(branches.contentBranch)}`,
        ),
        'Comparaison des branches',
    );
    const pullNumber = await findOpenPullRequest(client, branches);
    return {
        ...branches,
        ahead: comparison.ahead_by,
        commits: comparison.commits
            .slice(-MAX_LISTED_COMMITS)
            .reverse()
            .map(({ sha, commit }) => ({
                sha,
                message: commit.message.split('\n')[0],
                author: commit.author?.name ?? '',
                date: commit.author?.date ?? '',
            })),
        pullRequest: pullNumber === null ? null : await readPullRequest(client, pullNumber),
    };
}

/**
 * Ouvre la PR de mise en production, ou renvoie celle qui est déjà ouverte.
 *
 * @param client - Client GitHub App.
 * @param branches - Branches de contenu et de production.
 * @param requestedBy - Login GitHub de l'administrateur (mentionné dans la description).
 * @returns La PR.
 * @throws ReleaseNotReadyError si la branche de contenu n'a rien de nouveau.
 */
export async function openReleasePullRequest(
    client: GitHubAppClient,
    branches: ReleaseBranches,
    requestedBy: string,
): Promise<ReleasePullRequest> {
    const existing = await findOpenPullRequest(client, branches);
    if (existing !== null) return readPullRequest(client, existing);

    const status = await getReleaseStatus(client, branches);
    if (status.ahead === 0) throw new ReleaseNotReadyError('Rien à mettre en production.');
    const list = status.commits.map((commit) => `- ${commit.message} (${commit.sha.slice(0, 7)})`).join('\n');
    const created = await readJson<{ number: number }>(
        await client.request(`${client.repoPath}/pulls`, {
            method: 'POST',
            body: JSON.stringify({
                title: `chore: release ${branches.contentBranch} to production`,
                head: branches.contentBranch,
                base: branches.productionBranch,
                body: `Mise en production demandée depuis l'admin par ${requestedBy}.\n\n${status.ahead} commit(s) :\n\n${list}`,
            }),
        }),
        'Création de la PR',
    );
    return readPullRequest(client, created.number);
}

/**
 * Fusionne la PR de mise en production si sa CI est verte et que sa tête n'a pas bougé.
 *
 * @param client - Client GitHub App.
 * @param pullNumber - Numéro de la PR.
 * @param expectedHeadSha - Tête de la PR vue par l'administrateur.
 * @returns L'empreinte du commit de fusion.
 * @throws ReleaseNotReadyError si la CI n'est pas verte, la PR non fusionnable ou la tête différente.
 */
export async function mergeReleasePullRequest(
    client: GitHubAppClient,
    pullNumber: number,
    expectedHeadSha: string,
): Promise<{ sha: string }> {
    const pull = await readPullRequest(client, pullNumber);
    if (pull.headSha !== expectedHeadSha) {
        throw new ReleaseNotReadyError('De nouveaux commits sont arrivés : rechargez avant de publier.');
    }
    if (pull.checks !== 'success') throw new ReleaseNotReadyError('La CI de la PR n’est pas entièrement verte.');
    if (pull.mergeable === false) throw new ReleaseNotReadyError('GitHub signale un conflit sur la PR.');

    const response = await client.request(`${client.repoPath}/pulls/${pullNumber}/merge`, {
        method: 'PUT',
        body: JSON.stringify({ merge_method: 'merge', sha: expectedHeadSha }),
    });
    if (response.status === 405 || response.status === 409) {
        throw new ReleaseNotReadyError('GitHub refuse la fusion pour l’instant : rechargez puis réessayez.');
    }
    return readJson<{ sha: string }>(response, 'Fusion de la PR');
}

/**
 * Traduit l'échec d'une opération de mise en production en réponse HTTP.
 *
 * @param error - Erreur levée par une fonction de ce module.
 * @returns 409 si la mise en production n'est pas prête, 502 si GitHub refuse.
 * @throws L'erreur d'origine dans les autres cas.
 */
export function toReleaseErrorResponse(error: unknown): Response {
    if (error instanceof ReleaseNotReadyError) return jsonResponse({ error: error.message }, 409);
    if (error instanceof GitHubApiError) {
        console.error('[admin-release] GitHub', error);
        return jsonResponse({ error: 'GitHub a refusé l’opération, réessayez.' }, 502);
    }
    throw error;
}
