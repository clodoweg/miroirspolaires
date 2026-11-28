/**
 * E-mails de la remise en main propre, envoyés par l'API Resend.
 *
 * Responsabilité : prévenir l'auteur d'une nouvelle demande (avec le lien vers `/admin/boutique`) et
 * envoyer à l'acheteur le code accepté. Aucun SDK : un seul `fetch` vers `api.resend.com`, côté serveur,
 * donc hors CSP.
 *
 * Variables (serveur uniquement) :
 * - `RESEND_API_KEY` : clé d'API Resend. Absente, aucun e-mail ne part (la demande reste visible dans l'admin).
 * - `SHOP_NOTIFY_EMAIL` : adresse de l'auteur qui reçoit les demandes.
 * - `SHOP_EMAIL_FROM` : expéditeur, sur un domaine vérifié dans Resend. Par défaut `onboarding@resend.dev`,
 *   l'adresse de test de Resend, qui n'écrit qu'à l'adresse du compte Resend.
 * - `SHOP_ADMIN_URL` : URL de base de l'admin (Preview de `dev`), pour le lien de l'e-mail à l'auteur.
 *
 * WARNING: sécurité. Les champs viennent d'un formulaire public : tout passe par `escapeHtml()` avant d'entrer
 * dans le HTML, et la clé d'API ne figure jamais dans un log ni dans une réponse.
 */
import { UPSTREAM_TIMEOUT_MS } from '@/lib/api/http';
import type { PickupRequest } from './pickup-codes';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const DEFAULT_FROM = 'Miroirs Polaires <onboarding@resend.dev>';

interface OutgoingEmail {
    to: string;
    subject: string;
    text: string;
    html: string;
    replyTo?: string;
}

function readEnv(name: string): string | undefined {
    const value = (typeof process !== 'undefined' ? process.env[name] : undefined) ?? import.meta.env?.[name];
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

/**
 * Échappe une valeur avant de l'insérer dans du HTML.
 *
 * @param value - Texte brut.
 * @returns Le texte, sans caractère interprétable comme balise ou attribut.
 */
export function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

async function sendEmail(email: OutgoingEmail): Promise<boolean> {
    const apiKey = readEnv('RESEND_API_KEY');
    if (!apiKey) {
        console.warn('[shop-mail] clé Resend absente : e-mail non envoyé', { subject: email.subject });
        return false;
    }
    try {
        const response = await fetch(RESEND_ENDPOINT, {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                from: readEnv('SHOP_EMAIL_FROM') ?? DEFAULT_FROM,
                to: [email.to],
                subject: email.subject,
                text: email.text,
                html: email.html,
                ...(email.replyTo && { reply_to: email.replyTo }),
            }),
            signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS.lookup),
        });
        if (!response.ok) {
            console.error('[shop-mail] Resend a refusé l’e-mail', response.status, await response.text());
            return false;
        }
        return true;
    } catch (error) {
        console.error('[shop-mail] envoi impossible', error);
        return false;
    }
}

function paragraphs(lines: string[]): string {
    return lines.map((line) => `<p>${line}</p>`).join('\n');
}

/**
 * Prévient l'auteur d'une nouvelle demande de remise en main propre.
 *
 * @param request - Demande enregistrée.
 * @returns `true` si Resend a accepté l'e-mail.
 */
export async function notifyAuthorOfPickupRequest(request: PickupRequest): Promise<boolean> {
    const to = readEnv('SHOP_NOTIFY_EMAIL');
    if (!to) {
        console.warn('[shop-mail] destinataire des demandes absent : e-mail non envoyé');
        return false;
    }
    const adminBase = readEnv('SHOP_ADMIN_URL');
    const dashboardUrl = adminBase ? `${adminBase.replace(/\/+$/, '')}/admin/boutique` : null;
    const details = [
        `Nom : ${request.name}`,
        `E-mail : ${request.email}`,
        `Lieu souhaité : ${request.place}`,
        `Message : ${request.message || '(aucun)'}`,
    ];
    const action = dashboardUrl
        ? `Accepter ou refuser : ${dashboardUrl}`
        : 'Accepter ou refuser depuis /admin/boutique.';
    return sendEmail({
        to,
        replyTo: request.email,
        subject: `Demande de remise en main propre : ${request.name}`,
        text: ['Nouvelle demande de remise en main propre.', '', ...details, '', action].join('\n'),
        html: paragraphs([
            'Nouvelle demande de remise en main propre.',
            details.map(escapeHtml).join('<br>'),
            dashboardUrl
                ? `<a href="${escapeHtml(dashboardUrl)}">Accepter ou refuser la demande</a>`
                : escapeHtml(action),
        ]),
    });
}

/**
 * Envoie à l'acheteur le code qui ouvre la remise en main propre sur `/boutique`.
 *
 * @param request - Demande acceptée (avec son code et sa date d'expiration).
 * @param siteUrl - URL de base du site public.
 * @returns `true` si Resend a accepté l'e-mail.
 */
export async function sendPickupCodeToBuyer(request: PickupRequest, siteUrl: string): Promise<boolean> {
    if (!request.code || !request.expiresAt) return false;
    const shopUrl = `${siteUrl.replace(/\/+$/, '')}/boutique`;
    const expiry = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'Europe/Paris' }).format(
        new Date(request.expiresAt),
    );
    const notifyEmail = readEnv('SHOP_NOTIFY_EMAIL');
    const lines = [
        `Bonjour ${request.name},`,
        'Votre demande de remise en main propre est acceptée.',
        `Votre code : ${request.code}`,
        `Saisissez-le sur ${shopUrl} en choisissant « Remise en main propre ». Il sert à une seule commande et reste valable jusqu’au ${expiry}.`,
        'Nous conviendrons ensemble du lieu et de la date de la remise. Répondez simplement à cet e-mail.',
    ];
    return sendEmail({
        to: request.email,
        replyTo: notifyEmail,
        subject: 'Votre code de remise en main propre · Miroirs Polaires',
        text: lines.join('\n\n'),
        html: paragraphs([
            escapeHtml(lines[0]),
            escapeHtml(lines[1]),
            `Votre code : <strong style="font-size:1.25em;letter-spacing:0.1em">${escapeHtml(request.code)}</strong>`,
            `Saisissez-le sur <a href="${escapeHtml(shopUrl)}">${escapeHtml(shopUrl)}</a> en choisissant « Remise en main propre ». Il sert à une seule commande et reste valable jusqu’au ${escapeHtml(expiry)}.`,
            escapeHtml(lines[4]),
        ]),
    });
}
