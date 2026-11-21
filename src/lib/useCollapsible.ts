import { useState, useEffect } from 'react';

/**
 * Persists a collapsed/expanded boolean in localStorage.
 * Falls back to `defaultExpanded` on first visit or SSR.
 */
export function useCollapsible(storageKey: string, defaultExpanded = true) {
    const [expanded, setExpanded] = useState(() => {
        if (typeof window === 'undefined') return defaultExpanded;
        const stored = localStorage.getItem(`collapsible:${storageKey}`);
        return stored !== null ? stored === 'true' : defaultExpanded;
    });

    useEffect(() => {
        localStorage.setItem(`collapsible:${storageKey}`, String(expanded));
    }, [expanded, storageKey]);

    return [expanded, setExpanded] as const;
}
