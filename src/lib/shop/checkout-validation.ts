/**
 * Validation des entrées de la création de session Stripe Checkout
 *
 * Responsabilité : vérifier et nettoyer côté serveur ce que le client envoie à
 * `src/pages/api/shop/create-checkout-session.ts` (quantité, point relais) avant que ces
 * valeurs n'entrent dans la session et les métadonnées Stripe.
 */

export const MAX_QUANTITY = 10;

/** Point relais tel que validé côté serveur avant d'entrer dans les métadonnées Stripe. */
export interface ValidatedRelayPoint {
    id: string;
    name: string;
    address: string;
    zipCode: string;
    city: string;
    country: string;
}

// POURQUOI : les métadonnées Stripe sont limitées à 500 caractères par valeur ; on borne bien
// en dessous et on refuse tout ce qui n'est pas une chaîne pour qu'un client ne puisse ni faire
// échouer l'appel Stripe ni y glisser autre chose qu'une adresse.
const RELAY_FIELD_LIMITS = { id: 40, name: 100, address: 200, city: 100 } as const;
const ZIP_CODE_PATTERN = /^[A-Za-z0-9 -]{2,10}$/;
const COUNTRY_PATTERN = /^[A-Z]{2}$/;

function cleanString(value: unknown, maxLength: number): string | null {
    if (typeof value !== 'string') return null;
    // POURQUOI : les caractères de contrôle (retours ligne, NUL…) n'ont rien à faire dans une adresse.
    const cleaned = Array.from(value, (character) => {
        const code = character.charCodeAt(0);
        return code < 32 || code === 127 ? ' ' : character;
    })
        .join('')
        .trim();
    if (cleaned.length === 0 || cleaned.length > maxLength) return null;
    return cleaned;
}

/**
 * Valide le point relais envoyé par le client (widget Mondial Relay ou saisie manuelle).
 *
 * @param raw - Valeur brute du corps JSON.
 * @returns Le point relais nettoyé, ou `null` s'il est absent, incomplet ou mal typé.
 */
export function validateRelayPoint(raw: unknown): ValidatedRelayPoint | null {
    if (!raw || typeof raw !== 'object') return null;
    const candidate = raw as Record<string, unknown>;
    const name = cleanString(candidate.name, RELAY_FIELD_LIMITS.name);
    const address = cleanString(candidate.address, RELAY_FIELD_LIMITS.address);
    const city = cleanString(candidate.city, RELAY_FIELD_LIMITS.city);
    const zipCode =
        typeof candidate.zipCode === 'string' || typeof candidate.zipCode === 'number'
            ? String(candidate.zipCode).trim()
            : '';
    if (!name || !address || !city || !ZIP_CODE_PATTERN.test(zipCode)) return null;

    // POURQUOI : le widget Mondial Relay peut renvoyer l'identifiant sous forme numérique.
    const rawId = typeof candidate.id === 'number' ? String(candidate.id) : candidate.id;
    const id = rawId == null || rawId === '' ? 'N/A' : cleanString(rawId, RELAY_FIELD_LIMITS.id);
    if (!id) return null;
    const country = candidate.country == null ? 'FR' : String(candidate.country).trim().toUpperCase();
    if (!COUNTRY_PATTERN.test(country)) return null;

    return { id, name, address, zipCode, city, country };
}

/**
 * Lit la quantité demandée : un entier entre 1 et MAX_QUANTITY.
 *
 * @param raw - Valeur brute du corps JSON (absente = 1).
 * @returns La quantité, ou `null` si elle n'est pas un entier dans les bornes.
 */
export function parseQuantity(raw: unknown): number | null {
    if (raw == null) return 1;
    const quantity = Number(raw);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) return null;
    return quantity;
}
