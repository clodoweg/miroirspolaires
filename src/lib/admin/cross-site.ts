/**
 * Détection des requêtes inter-sites (protection CSRF de l'API d'administration)
 *
 * Responsabilité : décider, à partir des en-têtes Fetch Metadata envoyés par les navigateurs,
 * si une requête provient d'un autre site. Utilisé par `src/middleware.ts`.
 */

/**
 * Indique si la requête a été émise par une page d'un autre site.
 *
 * Les navigateurs récents envoient toujours `Sec-Fetch-Site` ; un client hors navigateur
 * (curl, scripts) ne l'envoie pas et reste accepté, puisqu'une page tierce ne peut pas
 * le supprimer. À défaut, l'en-tête `Origin` est comparé à l'origine de la requête.
 *
 * @param request - Requête entrante.
 * @returns `true` si la requête vient d'un autre site (ou d'un sous-domaine voisin).
 */
export function isCrossSiteRequest(request: Request): boolean {
    const fetchSite = request.headers.get('Sec-Fetch-Site');
    if (fetchSite) return fetchSite === 'cross-site' || fetchSite === 'same-site';

    const origin = request.headers.get('Origin');
    if (!origin) return false;
    try {
        return new URL(origin).origin !== new URL(request.url).origin;
    } catch {
        return true;
    }
}
