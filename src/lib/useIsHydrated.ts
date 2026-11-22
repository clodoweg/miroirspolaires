/**
 * Indique si un îlot React est hydraté (rendu dans le navigateur).
 *
 * Responsabilité : différer après l'hydratation le rendu d'un sous-arbre qui n'a de sens que côté
 * client (WebGL, WASM, `lazy()`), sans écart entre le HTML serveur et le premier rendu client.
 */
import { useSyncExternalStore } from 'react';

const subscribeNever = () => () => {};

/**
 * Renvoie `false` au rendu serveur et pendant l'hydratation, puis `true`.
 *
 * POURQUOI : un `lazy()` rendu côté serveur dans un `<Suspense>` fait insérer par React des scripts inline
 * (`$RB`, `$RC("…")`) dont le contenu dépend de la page : la CSP ne peut pas les autoriser par empreinte.
 * Avec `useSyncExternalStore`, React utilise `getServerSnapshot` (false) pour l'hydratation, puis refait
 * le rendu avec `getSnapshot` (true) : pas d'avertissement d'hydratation.
 *
 * @returns `true` une fois l'îlot hydraté.
 */
export function useIsHydrated(): boolean {
    return useSyncExternalStore(
        subscribeNever,
        () => true,
        () => false,
    );
}
