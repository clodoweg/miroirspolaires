/**
 * @file useVariableStarSuggestions.ts
 * @description Suggestions d'autocomplétion de la recherche d'étoiles variables.
 *
 * Responsabilité : proposer immédiatement les constellations correspondantes (calcul local),
 * puis, après 300 ms sans frappe, les compléter par les étoiles renvoyées par /api/variable-stars.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { constellations } from '@/lib/constellations';
import { foldAccents } from '@/utils/normalize';
import type { VariableStar } from '@/lib/objects/variable-stars';

export interface SearchSuggestion {
    value: string;
    label?: string;
}

/**
 * Hook des suggestions de recherche.
 *
 * @returns Les suggestions courantes et le gestionnaire de saisie à brancher sur la barre de recherche.
 */
export function useVariableStarSuggestions(): {
    suggestions: SearchSuggestion[];
    handleSearchInputChange: (val: string) => void;
} {
    const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
    const suggestionsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const handleSearchInputChange = useCallback((val: string) => {
        if (suggestionsTimeoutRef.current) {
            clearTimeout(suggestionsTimeoutRef.current);
        }

        const cleanVal = val.trim();
        if (cleanVal.length < 2) {
            setSuggestions([]);
            return;
        }

        // Trouver les constellations correspondantes localement
        const matchingConstellations: SearchSuggestion[] = [];
        const lowerVal = foldAccents(cleanVal);
        for (const name of Object.values(constellations)) {
            const normName = foldAccents(name);
            if (normName.includes(lowerVal)) {
                matchingConstellations.push({ value: name, label: 'Constellation' });
            }
        }

        // Afficher immédiatement les constellations trouvées localement pour plus de réactivité
        setSuggestions(matchingConstellations.slice(0, 8));

        suggestionsTimeoutRef.current = setTimeout(() => {
            const params = new URLSearchParams({
                page: '1',
                limit: '8',
                search: cleanVal,
            });
            fetch(`/api/variable-stars?${params.toString()}`)
                .then((res) => {
                    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
                    return res.json();
                })
                .then((data: { stars: VariableStar[] }) => {
                    if (data && Array.isArray(data.stars)) {
                        const starSuggestions = data.stars.map((s) => ({ value: s.name, label: 'Étoile variable' }));
                        const combined: SearchSuggestion[] = [];
                        const seenValues = new Set<string>();

                        [...matchingConstellations, ...starSuggestions].forEach((item) => {
                            if (!seenValues.has(item.value)) {
                                seenValues.add(item.value);
                                combined.push(item);
                            }
                        });

                        setSuggestions(combined.slice(0, 8));
                    }
                })
                .catch((err) => {
                    console.error('Erreur suggestions:', err);
                    if (matchingConstellations.length > 0) {
                        setSuggestions(matchingConstellations.slice(0, 8));
                    }
                });
        }, 300);
    }, []);

    useEffect(() => {
        return () => {
            if (suggestionsTimeoutRef.current) {
                clearTimeout(suggestionsTimeoutRef.current);
            }
        };
    }, []);

    return { suggestions, handleSearchInputChange };
}
