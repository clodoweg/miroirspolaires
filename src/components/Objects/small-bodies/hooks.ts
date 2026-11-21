/**
 * Hooks React communs aux visualiseurs de comètes et d'astéroïdes
 *
 * Responsabilité : chargement du catalogue depuis l'API, requête initiale lue dans l'URL,
 * dépliage automatique de l'objet demandé, magnitudes limites de l'instrument et date
 * locale de l'observatoire formatée.
 */

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { findTelescope } from '@/lib/equipment/catalog';
import { getLimitMagnitude, getLimitMagnitudePhoto } from '@/lib/astro/instrument';
import { getObservatoryOffsetHours, type ObsLocation } from '@/lib/objects/observation';
import { isExactQueryMatch } from '@/lib/objects/small-bodies';
import type { CameraSettings } from '@/lib/settings/userSettings';

/**
 * État de la recherche, initialisé avec le paramètre `q` de l'URL.
 *
 * @returns Le couple `[query, setQuery]`.
 */
export function useInitialQuery(): [string, Dispatch<SetStateAction<string>>] {
    return useState(() => {
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            return params.get('q') || '';
        }
        return '';
    });
}

/**
 * Charge un catalogue JSON au montage.
 *
 * @param url - Route API du catalogue.
 * @param logLabel - Préfixe du message de console en cas d'échec.
 * @param errorMessage - Message affiché à l'utilisateur en cas d'échec.
 * @returns Les éléments chargés, l'état de chargement et l'erreur éventuelle.
 */
export function useCatalogue<T>(
    url: string,
    logLabel: string,
    errorMessage: string,
): { items: T[]; isLoading: boolean; error: string | null } {
    const [items, setItems] = useState<T[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setIsLoading(true);
        setError(null);
        fetch(url)
            .then((res) => {
                if (!res.ok) throw new Error(`Erreur HTTP : ${res.status}`);
                return res.json();
            })
            .then((data: T[]) => {
                setItems(data);
                setIsLoading(false);
            })
            .catch((err) => {
                console.error(logLabel, err);
                setError(errorMessage);
                setIsLoading(false);
            });
    }, [url, logLabel, errorMessage]);

    return { items, isLoading, error };
}

/**
 * Déplie automatiquement l'objet désigné exactement par la requête.
 *
 * POURQUOI : Permet de déplier automatiquement l'objet demandé dans l'URL (q)
 * dès que la liste est chargée pour améliorer l'expérience de navigation directe.
 *
 * @param query - Requête de recherche.
 * @param items - Catalogue chargé.
 * @param setExpandedId - Setter de l'identifiant déplié.
 */
export function useAutoExpandFromQuery(
    query: string,
    items: readonly { uniqueId: string; name: string; id: string }[],
    setExpandedId: (id: string) => void,
): void {
    useEffect(() => {
        if (query && items.length > 0) {
            const match = items.find((item) => isExactQueryMatch(query, item.name, item.id));
            if (match) {
                setExpandedId(match.uniqueId);
            }
        }
    }, [query, items, setExpandedId]);
}

/** Ouverture et magnitudes limites de l'instrument de l'utilisateur. */
export interface InstrumentLimits {
    /** Diamètre de l'ouverture (mm). */
    aperture: number;
    /** Magnitude limite visuelle. */
    limitMag: number;
    /** Magnitude limite photographique. */
    limitMagPhoto: number;
}

/**
 * Résout l'ouverture du télescope et ses magnitudes limites.
 *
 * @param camera - Réglages caméra et télescope de l'utilisateur.
 * @returns L'ouverture et les magnitudes limites visuelle et photographique.
 */
export function useInstrumentLimits(camera: CameraSettings): InstrumentLimits {
    const aperture = useMemo(() => {
        const tel = findTelescope(camera.telescopeId);
        if (tel?.apertureMm) return tel.apertureMm;
        // POURQUOI : sans télescope du catalogue, ouverture estimée à F/6 depuis la focale.
        const focal = camera.focalLengthMm * (camera.focalMultiplier ?? 1);
        return Math.max(20, Math.min(2000, Math.round(focal / 6)));
    }, [camera]);

    const limitMag = useMemo(() => getLimitMagnitude(aperture), [aperture]);

    // POURQUOI: Magnitude photométrique calculée depuis l'échelle de plaque réelle de la caméra.
    // Calculée systématiquement (caméra par défaut ou personnalisée).
    const limitMagPhoto = useMemo(() => {
        const effectiveFocal = camera.focalLengthMm * (camera.focalMultiplier ?? 1);
        return getLimitMagnitudePhoto(aperture, camera.pixelSizeUm, effectiveFocal);
    }, [aperture, camera]);

    return { aperture, limitMag, limitMagPhoto };
}

/**
 * Date d'observation formatée dans le fuseau de l'observatoire (ex. « mardi 28 octobre »).
 *
 * @param location - Observatoire de l'utilisateur.
 * @param date - Date d'observation (UTC).
 * @returns Le libellé du jour en français.
 */
export function useObservatoryDateLabel(location: ObsLocation, date: Date): string {
    const tzOffset = useMemo(() => getObservatoryOffsetHours(location, date), [location, date]);
    return useMemo(() => {
        const localMs = date.getTime() + tzOffset * 3600000;
        const localDate = new Date(localMs);
        return localDate.toLocaleDateString('fr-FR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            timeZone: 'UTC',
        });
    }, [date, tzOffset]);
}
