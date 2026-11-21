/**
 * Intégration Astro : en-têtes de sécurité HTTP (CSP, X-Frame-Options…) sur Vercel.
 *
 * Responsabilité principale :
 * - Après le build, ajoute une route en tête de `.vercel/output/config.json` qui pose
 *   les en-têtes de sécurité sur toutes les réponses (pages statiques et fonctions SSR).
 *
 * POURQUOI : `@astrojs/vercel` produit une sortie Build Output API dont il écrit lui-même
 * `config.json`. Le fichier `public/_headers` (format Netlify/Cloudflare) n'était jamais
 * appliqué, et l'adaptateur ne fusionne pas les en-têtes d'un `vercel.json`. On modifie donc
 * `config.json` directement. L'adaptateur est inséré en tête des intégrations par Astro et
 * les hooks `astro:build:done` s'exécutent dans l'ordre : le fichier existe déjà ici.
 *
 * WARNING: toute nouvelle ressource externe chargée par le navigateur (script, iframe, image,
 * fetch, WebSocket) doit être ajoutée à la directive CSP correspondante ci-dessous, sinon
 * elle sera bloquée en production. Les appels faits côté serveur (routes /api, Stripe) et les
 * redirections de page (Stripe Checkout) ne sont pas concernés.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CDS_HOSTS = ['https://cds.unistra.fr', 'https://*.cds.unistra.fr', 'https://*.u-strasbg.fr'];
const R2_HOSTS = [
    'https://pub-r2.miroirspolaires.fr',
    'https://images.miroirspolaires.fr',
    'https://image-resizer.clodoweg.workers.dev',
];
// Repli pendant une panne du CDS (`src/config/upstream-routes.ts`) : fonds de ciel HiPS lus par Aladin (images et
// fetch) et image SkyView de /objets (image seule). Le script Aladin de repli est servi par le site (`'self'`).
const HIPS_MIRROR_HOSTS = ['https://skies.esac.esa.int', 'https://hips.china-vo.org'];
const SKYVIEW_HOST = 'https://skyview.gsfc.nasa.gov';
// Widget de point relais de la boutique (MondialRelayModal.tsx) : jQuery, plugin et appels JSONP
// Mondial Relay, puis Leaflet (unpkg) et tuiles OpenStreetMap chargés par le plugin.
const MONDIAL_RELAY_HOSTS = ['https://widget.mondialrelay.com', 'https://ajax.googleapis.com', 'https://unpkg.com'];

/** Directives CSP, une entrée par directive (sources séparées pour rester lisibles et diffables). */
export const CSP_DIRECTIVES = {
    'default-src': ["'self'"],
    // POURQUOI : 'wasm-unsafe-eval' est requis par le moteur Stellarium et Aladin Lite (WebAssembly).
    // 'unsafe-inline' reste nécessaire (audit 2026-10, plan dans docs/audits/2026-10-audit.md) :
    // scripts is:inline, gestionnaires `onerror`/`onload` posés par les plugins rehype et
    // ResponsiveImage (une empreinte ne les couvre pas sans `'unsafe-hashes'`), CSP native d'Astro
    // incompatible avec <ClientRouter />, scripts des pages SSR et des widgets tiers (Mondial Relay,
    // Aladin) non vérifiables au build.
    'script-src': [
        "'self'",
        "'unsafe-inline'",
        "'wasm-unsafe-eval'",
        'https://umami.miroirspolaires.fr',
        'https://challenges.cloudflare.com',
        'https://aladin.cds.unistra.fr',
        ...MONDIAL_RELAY_HOSTS,
    ],
    'style-src': [
        "'self'",
        "'unsafe-inline'",
        'https://aladin.cds.unistra.fr',
        'https://widget.mondialrelay.com',
        'https://unpkg.com',
    ],
    'img-src': [
        "'self'",
        'data:',
        'blob:',
        ...R2_HOSTS,
        ...CDS_HOSTS,
        ...HIPS_MIRROR_HOSTS,
        SKYVIEW_HOST,
        'https://flagcdn.com',
        'https://astrobin.com',
        'https://*.astrobin.com',
        'https://*.mondialrelay.com',
        'https://unpkg.com',
        'https://*.tile.openstreetmap.org',
    ],
    'font-src': ["'self'", 'data:', 'https://aladin.cds.unistra.fr'],
    'connect-src': [
        "'self'",
        // POURQUOI : Aladin Lite 3.8 lit son WebAssembly par `fetch('data:application/wasm;base64,…')`. Sans `data:`,
        // la copie auto-hébergée échoue au démarrage. Une URL `data:` ne joint aucun serveur.
        'data:',
        'https://umami.miroirspolaires.fr',
        'https://api.web3forms.com',
        'https://challenges.cloudflare.com',
        'https://widget.mondialrelay.com',
        ...R2_HOSTS,
        // POURQUOI : l'admin distant envoie les photos directement au bucket R2 par une URL présignée
        // (`src/lib/admin/remote-images.ts`) ; l'hôte dépend du compte Cloudflare, d'où le joker.
        'https://*.r2.cloudflarestorage.com',
        ...CDS_HOSTS,
        ...HIPS_MIRROR_HOSTS,
    ],
    'media-src': ["'self'", ...R2_HOSTS],
    'frame-src': ['https://www.youtube.com', 'https://www.youtube-nocookie.com', 'https://challenges.cloudflare.com'],
    'worker-src': ["'self'", 'blob:'],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'", 'https://api.web3forms.com'],
    'frame-ancestors': ["'none'"],
    'upgrade-insecure-requests': [],
};

/**
 * Sérialise les directives CSP en valeur d'en-tête.
 * @param {Record<string, string[]>} directives
 * @returns {string}
 */
export function buildCsp(directives = CSP_DIRECTIVES) {
    return Object.entries(directives)
        .map(([name, sources]) => [name, ...sources].join(' '))
        .join('; ');
}

/** En-têtes posés sur toutes les réponses. HSTS est déjà ajouté par Vercel. */
export const SECURITY_HEADERS = {
    'content-security-policy': buildCsp(),
    'x-frame-options': 'DENY',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    // POURQUOI : geolocation=(self) car UserSettingsBar propose « ma position » ;
    // fullscreen=(self) pour le plein écran de la carte du ciel.
    'permissions-policy': 'geolocation=(self), fullscreen=(self), camera=(), microphone=(), payment=(), usb=()',
    // POURQUOI `allow-popups` : isole la fenêtre des pages tierces tout en laissant les liens
    // de partage et les fenêtres de paiement ouvrir des popups.
    'cross-origin-opener-policy': 'same-origin-allow-popups',
};

/**
 * Intégration Astro qui injecte SECURITY_HEADERS dans la config Build Output API de Vercel.
 * Sans effet si le build ne produit pas `.vercel/output/config.json` (ex. autre adaptateur).
 * @returns {import('astro').AstroIntegration}
 */
export default function securityHeaders() {
    let root;
    return {
        name: 'miroirspolaires:security-headers',
        hooks: {
            'astro:config:done': ({ config }) => {
                root = fileURLToPath(config.root);
            },
            'astro:build:done': ({ logger }) => {
                const configPath = path.join(root, '.vercel/output/config.json');
                if (!fs.existsSync(configPath)) {
                    logger.warn(`${configPath} introuvable : en-têtes de sécurité non ajoutés.`);
                    return;
                }
                const vercelConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                vercelConfig.routes = vercelConfig.routes ?? [];
                vercelConfig.routes.unshift({ src: '/(.*)', headers: SECURITY_HEADERS, continue: true });
                fs.writeFileSync(configPath, JSON.stringify(vercelConfig, null, '\t'));
                logger.info('En-têtes de sécurité ajoutés à .vercel/output/config.json');
            },
        },
    };
}
