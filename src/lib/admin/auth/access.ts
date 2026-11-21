/**
 * Contrôle d'accès à l'administration.
 *
 * Responsabilité : décider, pour une requête vers `/admin` ou `/api/admin`, si elle est autorisée
 * (`authorizeAdminRequest`, appelé par `src/middleware.ts`), puis permettre aux pages et aux routes de
 * revérifier ce verdict (`isAdminGranted`, `requireAdmin`).
 *
 * WARNING: sécurité. Défense en profondeur : le middleware vérifie la session et dépose le verdict dans
 * `locals.adminAccess` ; chaque page et chaque route refuse si ce verdict manque, sauf en mode `local`.
 * Si le middleware était un jour contourné, les routes resteraient fermées hors de `npm run dev`.
 */
import { getAdminAccessMode, type AdminAccessMode, type RemoteAdminConfig } from './config';
import { readAdminSession, type AdminSession } from './session';

export type AdminAccess = { mode: 'local' } | { mode: 'remote'; session: AdminSession };

export type AdminAuthorization =
    | { kind: 'granted'; access: AdminAccess }
    /** Admin absent de cet environnement (production, autre Preview) : répondre 404. */
    | { kind: 'not-found' }
    /** Admin distant sans session valide : page → login, API → 401. */
    | { kind: 'unauthenticated' };

/**
 * Autorise ou non une requête vers l'admin.
 *
 * @param request - Requête entrante.
 * @param mode - Mode d'accès de l'environnement.
 * @param config - Configuration de l'admin distant (requise en mode `remote`).
 * @param nowSeconds - Instant courant (secondes).
 * @returns Le verdict.
 */
export function authorizeAdminRequest(
    request: Request,
    mode: AdminAccessMode,
    config: RemoteAdminConfig | null,
    nowSeconds: number,
): AdminAuthorization {
    if (mode === 'local') return { kind: 'granted', access: { mode: 'local' } };
    if (mode !== 'remote' || !config) return { kind: 'not-found' };
    const session = readAdminSession(request, config.sessionSecret, nowSeconds);
    // POURQUOI : revérifier l'identifiant ici, et pas seulement au login, invalide les sessions
    // existantes si ADMIN_GITHUB_USER_ID change.
    if (!session || session.userId !== config.adminUserId) return { kind: 'unauthenticated' };
    return { kind: 'granted', access: { mode: 'remote', session } };
}

/**
 * Indique si la page ou la route courante peut servir l'admin.
 *
 * @param locals - `Astro.locals` ou `context.locals`.
 * @returns `true` si le middleware a accordé l'accès, ou en `npm run dev`.
 */
export function isAdminGranted(locals: App.Locals | undefined): boolean {
    if (locals?.adminAccess) return true;
    // POURQUOI : en dev, les tests de routes appellent les handlers sans passer par le middleware.
    return getAdminAccessMode() === 'local';
}

/**
 * Garde des routes `/api/admin/**`, à appeler en premier dans chaque handler.
 *
 * @param locals - `context.locals`.
 * @returns `null` si l'accès est accordé, sinon une réponse 404.
 */
export function requireAdmin(locals: App.Locals | undefined): Response | null {
    if (isAdminGranted(locals)) return null;
    return new Response('Not Found', { status: 404 });
}

/**
 * Indique si l'admin dispose de l'espace de travail local (disque du projet, `spawn`).
 *
 * POURQUOI : l'admin distant enregistre le contenu par commit (`getContentWriter()`), mais les images,
 * la synchronisation R2 et les scripts exigent encore le disque ; l'interface s'en sert pour masquer
 * ces actions à distance.
 *
 * @param locals - `Astro.locals` ou `context.locals`.
 * @returns `true` en mode local uniquement.
 */
export function isLocalAdmin(locals: App.Locals | undefined): boolean {
    return locals?.adminAccess ? locals.adminAccess.mode === 'local' : getAdminAccessMode() === 'local';
}
