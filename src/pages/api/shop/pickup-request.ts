/**
 * @file src/pages/api/shop/pickup-request.ts
 * @description Demande de remise en main propre envoyée depuis `/boutique`.
 * Enregistre la demande dans Turso (`src/lib/shop/pickup-codes.ts`) et prévient l'auteur par e-mail
 * (`src/lib/shop/pickup-mailer.ts`). L'auteur l'accepte ou la refuse dans `/admin/boutique` ; s'il
 * l'accepte, l'acheteur reçoit un code à saisir au moment de commander.
 *
 * OPTIONS ET EXEMPLES :
 * - `POST /api/shop/pickup-request`
 *   Body JSON : `{ name: "Camille", email: "camille@example.org", place: "Lyon", message: "…" }`
 *   Réponse : `{ ok: true }` (201), 400 si un champ est invalide, 429 au-delà des plafonds.
 *
 * WARNING: route publique. Le champ piège `website` (invisible pour un humain) et les plafonds par e-mail
 * et par client (`PICKUP_REQUEST_LIMITS`) limitent le spam ; l'adresse IP n'est jamais stockée, seulement
 * son empreinte.
 */

import type { APIRoute } from 'astro';
import { isBoutiqueEnabled } from '../../../config/shop';
import { errorResponse, internalErrorResponse, jsonResponse } from '../../../lib/api/http';
import { validatePickupRequestInput } from '../../../lib/shop/checkout-validation';
import { createPickupRequest, isPickupRequestRateLimited, resolvePickupDatabase } from '../../../lib/shop/pickup-codes';
import { notifyAuthorOfPickupRequest } from '../../../lib/shop/pickup-mailer';

export const prerender = false;

async function hashClient(address: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`pickup:${address}`));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function readClientAddress(context: Parameters<APIRoute>[0]): string {
    try {
        return context.clientAddress || 'inconnu';
    } catch {
        // POURQUOI : Astro lève si l'adaptateur ne fournit pas l'adresse (tests, certains environnements).
        return context.request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'inconnu';
    }
}

export const POST: APIRoute = async (context) => {
    if (!isBoutiqueEnabled()) {
        return errorResponse(403, 'La boutique est actuellement désactivée.');
    }

    const body: unknown = await context.request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
        return errorResponse(400, 'Corps de requête JSON manquant ou invalide.');
    }
    // POURQUOI une réponse de succès : un robot qui remplit le champ piège ne doit pas apprendre qu'il est repéré.
    const honeypot = (body as Record<string, unknown>).website;
    if (typeof honeypot === 'string' && honeypot.trim() !== '') {
        return jsonResponse({ ok: true }, { status: 201 });
    }

    const input = validatePickupRequestInput(body);
    if (!input) {
        return errorResponse(400, 'Merci d’indiquer votre nom, une adresse e-mail valide et le lieu souhaité.');
    }

    if (!(await resolvePickupDatabase())) {
        console.error('[api] pickup-request: Turso indisponible');
        return errorResponse(503, 'Les demandes sont momentanément indisponibles.');
    }

    try {
        const now = new Date();
        const clientHash = await hashClient(readClientAddress(context));
        if (await isPickupRequestRateLimited(input.email, clientHash, now)) {
            return errorResponse(429, 'Vous avez déjà envoyé plusieurs demandes. Réessayez plus tard.');
        }
        const request = await createPickupRequest({ ...input, clientHash }, now);
        // POURQUOI sans échec : la demande est enregistrée et visible dans l'admin même si l'e-mail ne part pas.
        await notifyAuthorOfPickupRequest(request);
        return jsonResponse({ ok: true }, { status: 201 });
    } catch (error) {
        return internalErrorResponse('pickup-request', error);
    }
};
