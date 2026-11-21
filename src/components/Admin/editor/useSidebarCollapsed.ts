/**
 * État replié de la colonne latérale des éditeurs, partagé et persistant via localStorage.
 */
import { useCallback, useState } from 'react';

const STORAGE_KEY = 'admin_sidebar_collapsed';

/**
 * Lit et persiste l'état replié de la colonne latérale des éditeurs.
 *
 * POURQUOI : replier la colonne libère de la place pour la rédaction Markdown ; la préférence
 * est mémorisée sous la clé `admin_sidebar_collapsed`, commune au blog et aux voyages.
 *
 * @returns Un couple `[collapsed, setCollapsed]` ; `setCollapsed` écrit aussi dans localStorage.
 */
export function useSidebarCollapsed(): [boolean, (collapsed: boolean) => void] {
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem(STORAGE_KEY) === 'true';
        }
        return false;
    });

    const handleToggleSidebar = useCallback((collapsed: boolean) => {
        setIsSidebarCollapsed(collapsed);
        if (typeof window !== 'undefined') {
            localStorage.setItem(STORAGE_KEY, String(collapsed));
        }
    }, []);

    return [isSidebarCollapsed, handleToggleSidebar];
}
