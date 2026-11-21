/**
 * Brouillon local des éditeurs (blog, voyages) : sauvegarde automatique dans le navigateur
 * des modifications non enregistrées, pour les retrouver après une fermeture d'onglet ou
 * un redémarrage du serveur de dev.
 *
 * POURQUOI `localStorage` : c'est un confort propre à ce navigateur, pas une donnée partagée ;
 * toute lecture ou écriture est protégée (stockage désactivé, quota, navigation privée).
 */
import { useEffect } from 'react';

const STORAGE_PREFIX = 'mp-admin-draft:';
/** Délai entre la dernière frappe et l'écriture du brouillon (ms). */
const AUTOSAVE_DELAY_MS = 800;

export interface LocalDraft<T> {
    /** Date ISO de la dernière écriture. */
    savedAt: string;
    value: T;
}

/**
 * Lit le brouillon local d'un article.
 * @param key Clé de l'article (ex. `blog/2026/la-route-des-fjords`).
 * @returns Le brouillon, ou `null` s'il n'existe pas ou est illisible.
 */
export function readLocalDraft<T>(key: string): LocalDraft<T> | null {
    try {
        const raw = window.localStorage.getItem(STORAGE_PREFIX + key);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as LocalDraft<T>;
        return parsed && typeof parsed.savedAt === 'string' && 'value' in parsed ? parsed : null;
    } catch {
        return null;
    }
}

/**
 * Écrit le brouillon local d'un article.
 * @param key Clé de l'article.
 * @param value Données à conserver (frontmatter + corps).
 */
export function writeLocalDraft<T>(key: string, value: T): void {
    try {
        const draft: LocalDraft<T> = { savedAt: new Date().toISOString(), value };
        window.localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(draft));
    } catch {
        // POURQUOI : stockage indisponible ou plein ; l'édition continue sans filet.
    }
}

/**
 * Supprime le brouillon local d'un article (après enregistrement ou abandon volontaire).
 * @param key Clé de l'article.
 */
export function clearLocalDraft(key: string): void {
    try {
        window.localStorage.removeItem(STORAGE_PREFIX + key);
    } catch {
        // POURQUOI : rien à nettoyer si le stockage est inaccessible.
    }
}

/**
 * Sauvegarde automatiquement `value` tant que l'article a des modifications non enregistrées.
 * @param key Clé de l'article, ou `null` si aucun article n'est ouvert.
 * @param value Données à conserver.
 * @param dirty L'article a-t-il des modifications non enregistrées ?
 */
export function useLocalDraftAutosave<T>(key: string | null, value: T, dirty: boolean): void {
    useEffect(() => {
        if (!key || !dirty) return;
        const timer = window.setTimeout(() => writeLocalDraft(key, value), AUTOSAVE_DELAY_MS);
        return () => window.clearTimeout(timer);
    }, [key, value, dirty]);
}
