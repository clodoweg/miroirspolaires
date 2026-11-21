/**
 * Enveloppe un composant racine d'île admin dans `AdminProviders` (toasts et confirmations).
 */
import type { ComponentType } from 'react';
import AdminProviders from '../AdminProviders';

/**
 * Crée le composant racine d'une île admin à partir de son composant interne.
 *
 * POURQUOI : chaque page Astro monte sa propre arborescence React ; le composant interne doit
 * être rendu sous les providers pour pouvoir appeler `useToast()` et `useConfirm()`.
 *
 * @param Inner - Composant interne.
 * @param displayName - Nom affiché dans les outils de développement React.
 * @returns Le composant racine, qui transmet ses props au composant interne.
 */
export function withAdminProviders<P extends object>(Inner: ComponentType<P>, displayName: string): ComponentType<P> {
    function WithAdminProviders(props: P) {
        return (
            <AdminProviders>
                <Inner {...props} />
            </AdminProviders>
        );
    }
    WithAdminProviders.displayName = displayName;
    return WithAdminProviders;
}
