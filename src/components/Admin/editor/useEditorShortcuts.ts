/**
 * Raccourcis et garde-fous communs aux éditeurs : Ctrl+S (ou Cmd+S) pour enregistrer,
 * avertissement du navigateur avant de quitter avec des modifications non enregistrées.
 */
import { useEffect, useRef } from 'react';

/**
 * Branche Ctrl/Cmd+S sur l'enregistrement et l'avertissement de sortie de page.
 * @param onSave Enregistre l'article (appelé seulement si `canSave`).
 * @param options.canSave Un article est ouvert et aucun enregistrement n'est en cours.
 * @param options.dirty Des modifications ne sont pas enregistrées.
 */
export function useEditorShortcuts(onSave: () => void, { canSave, dirty }: { canSave: boolean; dirty: boolean }) {
    // POURQUOI : `onSave` change à chaque rendu ; l'écouteur lit toujours la dernière version.
    const onSaveRef = useRef(onSave);
    useEffect(() => {
        onSaveRef.current = onSave;
    });

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 's') {
                event.preventDefault();
                if (canSave) onSaveRef.current();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [canSave]);

    useEffect(() => {
        if (!dirty) return;
        const onBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            // POURQUOI : certains navigateurs exigent encore `returnValue` pour afficher l'alerte.
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }, [dirty]);
}
