/**
 * Colonne latérale repliable des éditeurs de contenu (liste des articles ou des voyages).
 */
import type { ReactNode } from 'react';

interface EditorSidebarProps {
    collapsed: boolean;
    children: ReactNode;
}

/**
 * Colonne collante affichée à partir de `lg`, qui se replie en largeur nulle.
 *
 * POURQUOI : la colonne se replie avec une transition de largeur, d'opacité et de marge ;
 * la marge négative (`lg:-mr-6`) annule le gap du conteneur flex pour que le panneau
 * d'édition occupe toute la largeur.
 *
 * @param props.collapsed - Colonne repliée.
 * @param props.children - Contenu de la colonne (généralement `PostList`).
 * @returns La colonne rendue.
 */
export default function EditorSidebar({ collapsed, children }: EditorSidebarProps) {
    return (
        <aside
            className={`hidden shrink-0 transition-all duration-300 ease-in-out lg:sticky lg:top-16 lg:block lg:max-h-[calc(100vh-5rem)] ${collapsed ? 'pointer-events-none w-0 overflow-hidden opacity-0 lg:-mr-6 lg:w-0' : 'lg:w-[300px]'}`}
        >
            {children}
        </aside>
    );
}
