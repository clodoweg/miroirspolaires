/**
 * Écriture des fichiers du dépôt par l'admin, sur le disque ou par un commit sur la branche de contenu.
 *
 * Responsabilité : appliquer un lot de modifications de fichiers texte (création, remplacement,
 * suppression) en une seule opération. En `npm run dev`, les fichiers sont écrits sur le disque ; sur
 * l'admin distant, le lot devient un commit atomique sur la branche de contenu (`dev`), fait par la
 * GitHub App, ce qui redéploie la Preview.
 *
 * Fournit aussi `computeRevision()`, l'empreinte Git d'un contenu, qui sert à refuser une sauvegarde
 * fondée sur une version périmée du fichier (modifié ailleurs entre l'ouverture et l'enregistrement).
 *
 * WARNING: effet distant. En mode `remote`, chaque appel à `commit` pousse sur la branche de contenu.
 */
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getAdminAccessMode, getRemoteAdminConfig } from '../auth/config';
import { GitHubApiError, type GitHubAppClient } from '../github/app-client';
import { jsonResponse, safeResolve } from '../shared';
import { getRemoteGitHubClient, splitSafeRelativePath } from './content-reader';

export interface FileChange {
    /** Chemin relatif à la racine du dépôt (séparateur `/`). */
    path: string;
    /** Nouveau contenu, ou `null` pour supprimer le fichier. */
    content: string | null;
}

export interface CommitResult {
    /** Empreinte du commit créé (admin distant), `null` sur le disque. */
    commitSha: string | null;
}

export interface ContentWriter {
    /**
     * Applique un lot de modifications.
     *
     * @param changes - Fichiers à écrire ou à supprimer.
     * @param message - Message du commit (ignoré sur le disque).
     * @returns L'empreinte du commit, le cas échéant.
     */
    commit(changes: FileChange[], message: string): Promise<CommitResult>;
}

/** Sauvegarde refusée : le fichier a changé depuis sa lecture par l'éditeur. */
export class ContentConflictError extends Error {
    constructor(readonly path: string) {
        super(`${path} a été modifié ailleurs depuis son ouverture`);
        this.name = 'ContentConflictError';
    }
}

/**
 * Empreinte Git (blob SHA-1) d'un contenu texte.
 *
 * POURQUOI l'empreinte Git plutôt qu'un hachage quelconque : elle est identique sur le disque et dans
 * l'API GitHub, et c'est celle que `listDir` renvoie à distance.
 *
 * @param content - Contenu UTF-8.
 * @returns L'empreinte hexadécimale (40 caractères).
 */
export function computeRevision(content: string): string {
    const data = Buffer.from(content, 'utf8');
    return createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex');
}

/**
 * Vérifie qu'un fichier n'a pas changé depuis la révision connue de l'éditeur.
 *
 * @param currentContent - Contenu actuel (`null` si le fichier n'existe pas).
 * @param expectedRevision - Révision envoyée par l'éditeur ; sans elle, aucun contrôle.
 * @param relativePath - Chemin du fichier (pour le message d'erreur).
 * @throws ContentConflictError si le fichier a changé ou disparu.
 */
export function assertRevision(
    currentContent: string | null,
    expectedRevision: string | undefined,
    relativePath: string,
): void {
    if (!expectedRevision) return;
    if (currentContent === null || computeRevision(currentContent) !== expectedRevision) {
        throw new ContentConflictError(relativePath);
    }
}

/**
 * Écrivain sur le disque.
 *
 * @param rootDirectory - Racine ; par défaut `process.cwd()`, évalué à chaque appel.
 * @returns L'écrivain.
 */
export function createFsContentWriter(rootDirectory?: string): ContentWriter {
    return {
        async commit(changes) {
            for (const change of changes) {
                const target = safeResolve(rootDirectory ?? process.cwd(), ...splitSafeRelativePath(change.path));
                if (change.content === null) {
                    await fs.rm(target, { force: true });
                } else {
                    // POURQUOI un fichier temporaire : le serveur de dev surveille certains fichiers
                    // (upstream-priority.json) et les relit aussitôt ; il ne doit jamais en voir une moitié.
                    await fs.mkdir(path.dirname(target), { recursive: true });
                    await fs.writeFile(`${target}.tmp`, change.content, 'utf-8');
                    await fs.rename(`${target}.tmp`, target);
                }
            }
            return { commitSha: null };
        },
    };
}

async function readJson<T>(response: Response, context: string): Promise<T> {
    if (!response.ok) throw new GitHubApiError(response.status, `${context} : ${response.status}`);
    return (await response.json()) as T;
}

/**
 * Écrivain par commit sur une branche (API Git Data : arbre, commit, mise à jour de la référence).
 *
 * POURQUOI une seule nouvelle tentative : si la branche avance entre la lecture de sa tête et la mise à
 * jour de la référence (autre sauvegarde, push local), GitHub refuse le non-fast-forward (422). Le lot
 * est alors rejoué sur la nouvelle tête ; les fichiers concernés restent protégés par `assertRevision`.
 *
 * @param client - Client GitHub App.
 * @param branch - Branche cible.
 * @returns L'écrivain.
 */
export function createGitHubContentWriter(client: GitHubAppClient, branch: string): ContentWriter {
    const refPath = `${client.repoPath}/git/refs/heads/${encodeURIComponent(branch)}`;

    async function attempt(changes: FileChange[], message: string): Promise<{ sha: string } | 'retry'> {
        const ref = await readJson<{ object: { sha: string } }>(await client.request(refPath), 'Lecture de la branche');
        const headSha = ref.object.sha;
        const headCommit = await readJson<{ tree: { sha: string } }>(
            await client.request(`${client.repoPath}/git/commits/${headSha}`),
            'Lecture du commit de tête',
        );
        const tree = await readJson<{ sha: string }>(
            await client.request(`${client.repoPath}/git/trees`, {
                method: 'POST',
                body: JSON.stringify({
                    base_tree: headCommit.tree.sha,
                    tree: changes.map((change) => ({
                        path: splitSafeRelativePath(change.path).join('/'),
                        mode: '100644',
                        type: 'blob',
                        ...(change.content === null ? { sha: null } : { content: change.content }),
                    })),
                }),
            }),
            'Création de l’arbre',
        );
        const commit = await readJson<{ sha: string }>(
            await client.request(`${client.repoPath}/git/commits`, {
                method: 'POST',
                body: JSON.stringify({ message, tree: tree.sha, parents: [headSha] }),
            }),
            'Création du commit',
        );
        const update = await client.request(refPath, {
            method: 'PATCH',
            body: JSON.stringify({ sha: commit.sha, force: false }),
        });
        if (update.status === 422) return 'retry';
        await readJson(update, 'Mise à jour de la branche');
        return { sha: commit.sha };
    }

    return {
        async commit(changes, message) {
            if (changes.length === 0) return { commitSha: null };
            const first = await attempt(changes, message);
            const result = first === 'retry' ? await attempt(changes, message) : first;
            if (result === 'retry') throw new GitHubApiError(422, 'La branche a avancé pendant l’enregistrement');
            return { commitSha: result.sha };
        },
    };
}

let remoteWriter: ContentWriter | null = null;

/**
 * Écrivain adapté au mode d'accès courant.
 *
 * @returns L'écrivain GitHub (commit sur la branche de contenu) en mode `remote`, le disque sinon.
 */
export function getContentWriter(): ContentWriter {
    if (getAdminAccessMode() !== 'remote') return createFsContentWriter();
    remoteWriter ??= createGitHubContentWriter(getRemoteGitHubClient(), getRemoteAdminConfig().contentBranch);
    return remoteWriter;
}

/**
 * Traduit l'échec d'un enregistrement en réponse HTTP.
 *
 * @param error - Erreur levée par `writePost`, `writeVoyage` ou `ContentWriter.commit`.
 * @returns 409 pour un conflit de révision, 502 si GitHub a refusé le commit.
 * @throws L'erreur d'origine si elle n'est ni l'une ni l'autre.
 */
export function toWriteErrorResponse(error: unknown): Response {
    if (error instanceof ContentConflictError) {
        return jsonResponse(
            { error: 'conflict', message: 'Ce fichier a été modifié ailleurs depuis son ouverture. Rechargez-le.' },
            409,
        );
    }
    if (error instanceof GitHubApiError) {
        console.error('[admin] commit refusé par GitHub', error);
        return jsonResponse({ error: 'GitHub a refusé l’enregistrement, réessayez.' }, 502);
    }
    throw error;
}
