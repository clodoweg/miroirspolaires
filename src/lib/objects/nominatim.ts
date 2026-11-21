/**
 * Client Nominatim (OpenStreetMap) pour le géocodage des lieux d'observation
 *
 * Responsabilité : interroger Nominatim en respectant sa politique d'usage
 * (User-Agent descriptif, au plus une requête par seconde), avec un cache mémoire
 * par instance et un délai d'expiration, puis ne renvoyer que des résultats valides.
 * Utilisé par `src/pages/api/object/geocode.ts`.
 */

const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'miroirspolaires.fr objects-page (clodoweg@gmail.com)';
const MIN_INTERVAL_MS = 1000;
// POURQUOI : au-delà, une rafale de requêtes ferait attendre la fonction serverless trop
// longtemps ; on préfère répondre 429 tout de suite.
const MAX_QUEUE_DELAY_MS = 3000;
const REQUEST_TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;

export interface GeocodeResult {
    lat: number;
    lon: number;
    displayName: string;
    type?: string;
    category?: string;
}

/** Erreur levée quand la cadence imposée par Nominatim serait dépassée. */
export class GeocodeRateLimitError extends Error {}

/** Erreur levée quand Nominatim répond mal (statut, délai, format). */
export class GeocodeUpstreamError extends Error {}

const cache = new Map<string, { expiresAt: number; results: GeocodeResult[] }>();
let nextSlotAt = 0;

function normalizeQuery(query: string): string {
    return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

function readCache(key: string, now: number): GeocodeResult[] | undefined {
    const entry = cache.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= now) {
        cache.delete(key);
        return undefined;
    }
    // POURQUOI : réinsérer l'entrée la place en fin de Map, ce qui donne un ordre LRU.
    cache.delete(key);
    cache.set(key, entry);
    return entry.results;
}

function writeCache(key: string, results: GeocodeResult[], now: number): void {
    cache.set(key, { expiresAt: now + CACHE_TTL_MS, results });
    if (cache.size > CACHE_MAX_ENTRIES) {
        const oldestKey = cache.keys().next().value;
        if (oldestKey !== undefined) cache.delete(oldestKey);
    }
}

async function waitForSlot(): Promise<void> {
    const now = Date.now();
    const slot = Math.max(now, nextSlotAt);
    const delay = slot - now;
    if (delay > MAX_QUEUE_DELAY_MS) {
        throw new GeocodeRateLimitError('Trop de requêtes de géocodage simultanées');
    }
    nextSlotAt = slot + MIN_INTERVAL_MS;
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
}

function parseResults(raw: unknown): GeocodeResult[] {
    if (!Array.isArray(raw)) throw new GeocodeUpstreamError('Réponse Nominatim inattendue');
    return raw
        .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object')
        .map((entry) => ({
            lat: Number(entry.lat),
            lon: Number(entry.lon),
            displayName: typeof entry.display_name === 'string' ? entry.display_name : '',
            type: typeof entry.type === 'string' ? entry.type : undefined,
            category: typeof entry.category === 'string' ? entry.category : undefined,
        }))
        .filter((result) => Number.isFinite(result.lat) && Number.isFinite(result.lon) && result.displayName);
}

/**
 * Géocode un nom de lieu (5 résultats au plus).
 *
 * @param query - Texte saisi, déjà validé en longueur par l'appelant.
 * @returns Les lieux trouvés, depuis le cache si la même requête a déjà été faite.
 * @throws {GeocodeRateLimitError} Si la file d'attente dépasse quelques secondes.
 * @throws {GeocodeUpstreamError} Si Nominatim échoue, expire ou répond dans un format inattendu.
 */
export async function geocodePlace(query: string): Promise<GeocodeResult[]> {
    const key = normalizeQuery(query);
    const cached = readCache(key, Date.now());
    if (cached) return cached;

    await waitForSlot();

    const params = new URLSearchParams({ q: query.trim(), format: 'jsonv2', addressdetails: '1', limit: '5' });
    let response: Response;
    try {
        response = await fetch(`${NOMINATIM_SEARCH_URL}?${params.toString()}`, {
            headers: {
                Accept: 'application/json',
                // Nominatim usage policy requires a descriptive User-Agent
                'User-Agent': USER_AGENT,
                'Accept-Language': 'fr,en;q=0.7',
            },
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
    } catch (error) {
        throw new GeocodeUpstreamError('Nominatim injoignable', { cause: error });
    }
    if (!response.ok) throw new GeocodeUpstreamError(`Nominatim a répondu ${response.status}`);

    const results = parseResults(await response.json().catch(() => null));
    writeCache(key, results, Date.now());
    return results;
}
