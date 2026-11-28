// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { escapeHtml, notifyAuthorOfPickupRequest, sendPickupCodeToBuyer } from './pickup-mailer';
import type { PickupRequest } from './pickup-codes';

const REQUEST: PickupRequest = {
    id: '00000000-0000-4000-8000-000000000001',
    createdAt: '2026-11-28T10:00:00.000Z',
    name: 'Camille <b>',
    email: 'camille@example.org',
    place: 'Lyon',
    message: '',
    status: 'approved',
    code: 'MP-7K4Q-X9RT',
    decidedAt: '2026-11-28T11:00:00.000Z',
    expiresAt: '2026-12-28T11:00:00.000Z',
    stripeSessionId: null,
    usedAt: null,
};

const fetchMock = vi.fn();

function sentBody(): Record<string, unknown> {
    return JSON.parse(fetchMock.mock.calls[0][1].body as string);
}

describe('pickup-mailer', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', fetchMock);
        fetchMock.mockReset();
        fetchMock.mockResolvedValue(new Response('{"id":"x"}', { status: 200 }));
        vi.stubEnv('RESEND_API_KEY', 're_test');
        vi.stubEnv('SHOP_NOTIFY_EMAIL', 'auteur@example.org');
        vi.stubEnv('SHOP_EMAIL_FROM', '');
        vi.stubEnv('SHOP_ADMIN_URL', 'https://admin.example.vercel.app/');
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('échappe le HTML', () => {
        expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
    });

    it('prévient l’auteur avec le lien vers l’admin, sans HTML injecté', async () => {
        expect(await notifyAuthorOfPickupRequest(REQUEST)).toBe(true);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://api.resend.com/emails');
        expect(init.headers.Authorization).toBe('Bearer re_test');
        const body = sentBody();
        expect(body.to).toEqual(['auteur@example.org']);
        expect(body.reply_to).toBe('camille@example.org');
        expect(body.from).toContain('onboarding@resend.dev');
        expect(body.html).toContain('https://admin.example.vercel.app/admin/boutique');
        expect(body.html).toContain('Camille &lt;b&gt;');
        expect(body.html).not.toContain('<b>');
    });

    it('sans URL d’admin, renvoie vers /admin/boutique en texte', async () => {
        vi.stubEnv('SHOP_ADMIN_URL', '');
        await notifyAuthorOfPickupRequest(REQUEST);
        expect(sentBody().html).not.toContain('<a href');
        expect(sentBody().text).toContain('/admin/boutique');
    });

    it('envoie le code à l’acheteur avec le lien vers la boutique', async () => {
        vi.stubEnv('SHOP_EMAIL_FROM', 'Boutique <boutique@miroirspolaires.fr>');
        expect(await sendPickupCodeToBuyer(REQUEST, 'https://www.miroirspolaires.fr/')).toBe(true);
        const body = sentBody();
        expect(body.to).toEqual(['camille@example.org']);
        expect(body.from).toBe('Boutique <boutique@miroirspolaires.fr>');
        expect(body.text).toContain('MP-7K4Q-X9RT');
        expect(body.text).toContain('https://www.miroirspolaires.fr/boutique');
        expect(body.text).toContain('28 décembre 2026');
    });

    it('n’envoie rien pour une demande sans code', async () => {
        expect(await sendPickupCodeToBuyer({ ...REQUEST, code: null }, 'https://x.fr')).toBe(false);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('n’envoie rien sans clé ou sans destinataire', async () => {
        vi.stubEnv('SHOP_NOTIFY_EMAIL', '');
        expect(await notifyAuthorOfPickupRequest(REQUEST)).toBe(false);
        vi.stubEnv('RESEND_API_KEY', '');
        expect(await sendPickupCodeToBuyer(REQUEST, 'https://x.fr')).toBe(false);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('renvoie false quand Resend refuse ou que le réseau échoue', async () => {
        fetchMock.mockResolvedValueOnce(new Response('domain not verified', { status: 403 }));
        expect(await sendPickupCodeToBuyer(REQUEST, 'https://x.fr')).toBe(false);
        fetchMock.mockRejectedValueOnce(new Error('timeout'));
        expect(await sendPickupCodeToBuyer(REQUEST, 'https://x.fr')).toBe(false);
    });
});
