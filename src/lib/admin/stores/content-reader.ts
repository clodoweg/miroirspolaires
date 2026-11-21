/**
 * Lecture des fichiers du dépôt par l'admin, sur le disque ou par l'API GitHub.
 *
 * Responsabilité : offrir une même interface de lecture (`readText`, `listDir`) aux helpers de l'admin,
 * qu'ils tournent en `npm run dev` (disque, `process.cwd()`) ou sur l'admin distant (branche de contenu
 * lue par l'API GitHub). `getContentReader()` choisit l'implémentation selon le mode d'accès.
 *
 * POURQUOI lire la branche par l'API plutôt que les fichiers du déploiement : après une modification,
 * la Preview met quelques minutes à se reconstruire ; l'admin doit voir l'état réel de la branche.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getAdminAccessMode, getRemoteAdminConfig } from '../auth/config';
import { GitHubApiError, GitHubAppClient } from '../github/app-client';
import { safeResolve } from '../shared';

export interface ContentDirEntry {
    name: string;
    type: 'file' | 'dir';
    /** Empreinte Git du fichier, quand la source la connaît (cache de lecture). */
    sha?: string;
}

export interface ContentReader {
    /**
     * Lit un fichier texte.
     *
     * @param relativePath - Chemin relatif à la racine (séparateur `/`).
     * @param knownSha - Empreinte Git déjà connue (issue de `listDir`), pour réutiliser le cache.
     * @returns Le contenu, ou `null` si le fichier n'existe pas.
     */
    readText(relativePath: string, knownSha?: string): Promise<string | null>;
    /**
     * Liste un dossier.
     *
     * @param relativePath - Chemin relatif à la racine (`''` pour la racine).
     * @returns Les entrées, ou `null` si le dossier n'existe pas.
     */
    listDir(relativePath: string): Promise<ContentDirEntry[] | null>;
}

const SAFE_SEGMENT_RE = /^[A-Za-z0-9._~-]+$/;

/**
 * Valide un chemin relatif lu par l'admin.
 *
 * WARNING: sécurité. Refuse `..`, les chemins absolus et les caractères spéciaux : le chemin est
 * concaténé à une URL de l'API GitHub ou résolu sur le disque.
 *
 * @param relativePath - Chemin à valider.
 * @returns Les segments du chemin.
 * @throws Si un segment est invalide.
 */
export function splitSafeRelativePath(relativePath: string): string[] {
    if (relativePath === '') return [];
    const segments = relativePath.split('/');
    for (const segment of segments) {
        if (!SAFE_SEGMENT_RE.test(segment) || segment === '.' || segment === '..') {
            throw new Error(`Chemin refusé : ${relativePath}`);
        }
    }
    return segments;
}

/**
 * Lecteur sur le disque.
 *
 * @param rootDirectory - Racine ; par défaut `process.cwd()`, évalué à chaque appel (les tests sur disque
 *   changent le dossier courant).
 * @returns Le lecteur.
 */
export function createFsContentReader(rootDirectory?: string): ContentReader {
    const resolve = (relativePath: string) =>
        safeResolve(rootDirectory ?? process.cwd(), ...splitSafeRelativePath(relativePath));
    return {
        async readText(relativePath) {
            try {
                return await fs.readFile(resolve(relativePath), 'utf-8');
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
                throw error;
            }
        },
        async listDir(relativePath) {
            const directory = resolve(relativePath);
            let dirents;
            try {
                dirents = await fs.readdir(directory, { withFileTypes: true });
            } catch (error) {
                const code = (error as NodeJS.ErrnoException).code;
                if (code === 'ENOENT' || code === 'ENOTDIR') return null;
                throw error;
            }
            return dirents
                .filter((dirent) => dirent.isFile() || dirent.isDirectory())
                .map((dirent) => ({ name: dirent.name, type: dirent.isDirectory() ? 'dir' : 'file' }));
        },
    };
}

/**
 * Lecteur d'une branche par l'API « contents » de GitHub.
 *
 * POURQUOI un cache par empreinte : une empreinte Git désigne un contenu immuable. Lister un dossier
 * coûte un appel, puis seuls les fichiers modifiés depuis la dernière lecture sont retéléchargés tant
 * que l'instance de la fonction reste chaude.
 *
 * @param client - Client GitHub App.
 * @param branch - Branche lue.
 * @param blobCache - Cache empreinte → contenu (partagé entre requêtes de la même instance).
 * @returns Le lecteur.
 */
export function createGitHubContentReader(
    client: GitHubAppClient,
    branch: string,
    blobCache: Map<string, string> = new Map(),
): ContentReader {
    const contentsPath = (relativePath: string) => {
        const encoded = splitSafeRelativePath(relativePath).map(encodeURIComponent).join('/');
        return `${client.repoPath}/contents/${encoded}?ref=${encodeURIComponent(branch)}`;
    };
    return {
        async readText(relativePath, knownSha) {
            if (knownSha && blobCache.has(knownSha)) return blobCache.get(knownSha) as string;
            const response = await client.request(contentsPath(relativePath), {
                accept: 'application/vnd.github.raw+json',
            });
            if (response.status === 404) return null;
            if (!response.ok)
                throw new GitHubApiError(response.status, `Lecture de ${relativePath} : ${response.status}`);
            const text = await response.text();
            if (knownSha) blobCache.set(knownSha, text);
            return text;
        },
        async listDir(relativePath) {
            const response = await client.request(contentsPath(relativePath));
            if (response.status === 404) return null;
            if (!response.ok)
                throw new GitHubApiError(response.status, `Liste de ${relativePath} : ${response.status}`);
            const body = (await response.json()) as unknown;
            if (!Array.isArray(body)) return null;
            return body
                .filter((item) => item?.type === 'file' || item?.type === 'dir')
                .map((item) => ({ name: String(item.name), type: item.type, sha: String(item.sha) }));
        },
    };
}

let remoteClient: GitHubAppClient | null = null;
let remoteReader: ContentReader | null = null;
const remoteBlobCache = new Map<string, string>();

/**
 * Client GitHub App de l'admin distant, partagé par l'instance (le jeton d'installation y est en cache).
 *
 * @returns Le client.
 * @throws Si l'admin distant n'est pas configuré : n'appeler qu'en mode `remote`.
 */
export function getRemoteGitHubClient(): GitHubAppClient {
    if (!remoteClient) {
        const config = getRemoteAdminConfig();
        remoteClient = new GitHubAppClient({
            appId: config.appId,
            privateKey: config.privateKey,
            installationId: config.installationId,
            owner: config.repository.owner,
            repo: config.repository.name,
        });
    }
    return remoteClient;
}

/**
 * Lecteur adapté au mode d'accès courant.
 *
 * @returns Le lecteur GitHub (branche de contenu) en mode `remote`, le lecteur disque sinon.
 */
export function getContentReader(): ContentReader {
    if (getAdminAccessMode() !== 'remote') return createFsContentReader();
    if (!remoteReader) {
        remoteReader = createGitHubContentReader(
            getRemoteGitHubClient(),
            getRemoteAdminConfig().contentBranch,
            remoteBlobCache,
        );
    }
    return remoteReader;
}

/**
 * Convertit un chemin absolu du projet en chemin relatif lisible par un `ContentReader`.
 *
 * @param absolutePath - Chemin sous `process.cwd()`.
 * @returns Le chemin relatif avec des `/`.
 */
export function toProjectRelativePath(absolutePath: string): string {
    return path.relative(process.cwd(), absolutePath).split(path.sep).join('/');
}
