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
 *
 * Scripts inline (retrait de `'unsafe-inline'`, plan dans `docs/architecture.md`) :
 * - `script-src` strict = `CSP_DIRECTIVES['script-src']` + empreintes SHA-256 de chaque script inline.
 *   Elles sont collectées au build dans le HTML prérendu, plus celles des scripts d'amorçage des îlots
 *   d'Astro (constants, présents aussi dans les pages rendues côté serveur).
 * - Le build échoue si le HTML prérendu contient un gestionnaire inline (`onerror="…"`) ou une URL
 *   `javascript:` : aucune empreinte ne les autorise.
 * - Tant que `ENFORCE_STRICT_SCRIPT_SRC` vaut `false`, la politique stricte part en
 *   `Content-Security-Policy-Report-Only` (violations visibles dans la console, rien n'est bloqué)
 *   et la politique appliquée garde `'unsafe-inline'`, sans empreinte : un navigateur ignore
 *   `'unsafe-inline'` dès qu'une empreinte figure dans la même directive.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import astroIslandScript from '@astrojs/runtime/_internal/server/astro-island.prebuilt.js';
import idleDirectiveScript from '@astrojs/runtime/_internal/client/idle.prebuilt.js';
import loadDirectiveScript from '@astrojs/runtime/_internal/client/load.prebuilt.js';
import mediaDirectiveScript from '@astrojs/runtime/_internal/client/media.prebuilt.js';
import onlyDirectiveScript from '@astrojs/runtime/_internal/client/only.prebuilt.js';
import visibleDirectiveScript from '@astrojs/runtime/_internal/client/visible.prebuilt.js';

// POURQUOI : textes exacts des scripts inline qu'Astro insère avec les îlots (`getPrescripts`).
const ASTRO_RUNTIME_INLINE_SCRIPTS = [
    astroIslandScript,
    idleDirectiveScript,
    loadDirectiveScript,
    mediaDirectiveScript,
    onlyDirectiveScript,
    visibleDirectiveScript,
];

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
    // Pas de 'unsafe-inline' : les scripts inline sont autorisés un par un par leur empreinte, ajoutée au
    // build (`withScriptHashes`). Voir `ENFORCE_STRICT_SCRIPT_SRC` pour la politique appliquée.
    'script-src': [
        "'self'",
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

/**
 * Applique la politique stricte (`script-src` sans `'unsafe-inline'`) au lieu de la seule observer.
 *
 * Appliquée après vérification (novembre 2026, navigateur sur une Preview Vercel) : aucune violation sur
 * l'accueil, les articles et voyages, les astrophotos, la carte du ciel, les outils, `/objets` (Aladin),
 * la navigation du ClientRouter et l'admin (simulé en local).
 *
 * WARNING: sécurité. Repasser à `false` (politique historique appliquée, stricte en Report-Only) seulement
 * pour dépanner une page cassée en production, le temps d'en corriger la cause.
 */
export const ENFORCE_STRICT_SCRIPT_SRC = true;

/**
 * Ajoute des empreintes de scripts inline à `script-src`.
 *
 * @param {Record<string, string[]>} directives - Directives de base.
 * @param {Iterable<string>} scriptHashes - Empreintes au format CSP (`'sha256-…'`).
 * @returns {Record<string, string[]>} Copie des directives, empreintes triées et dédoublonnées.
 */
export function withScriptHashes(directives, scriptHashes) {
    return {
        ...directives,
        'script-src': [...directives['script-src'], ...[...new Set(scriptHashes)].sort()],
    };
}

/**
 * Pages qui gardent `'unsafe-inline'` dans `script-src`, même une fois la politique stricte appliquée.
 *
 * WARNING: sécurité. N'y ajouter qu'une page sans contenu saisi par un tiers, et pour un code tiers qu'on ne
 * peut pas adapter. `/boutique` : le widget Mondial Relay (jQuery, `MondialRelayModal.tsx`) insère ses
 * propres scripts inline et attributs `onclick`, dont le contenu ne nous appartient pas.
 */
export const RELAXED_SCRIPT_SRC_PATHS = ['/boutique'];

/**
 * Construit les en-têtes de sécurité. HSTS est déjà ajouté par Vercel.
 *
 * @param {{ scriptHashes?: Iterable<string>, enforceStrictScriptSrc?: boolean, relaxedScriptSrc?: boolean }} [options]
 *   Empreintes des scripts inline, choix de la politique appliquée (`ENFORCE_STRICT_SCRIPT_SRC` par défaut), et
 *   `relaxedScriptSrc` pour une page de `RELAXED_SCRIPT_SRC_PATHS` (politique historique seule).
 * @returns {Record<string, string>} En-têtes, noms en minuscules.
 */
export function buildSecurityHeaders({
    scriptHashes = [],
    enforceStrictScriptSrc = ENFORCE_STRICT_SCRIPT_SRC,
    relaxedScriptSrc = false,
} = {}) {
    const strictCsp = buildCsp(withScriptHashes(CSP_DIRECTIVES, scriptHashes));
    // POURQUOI sans empreinte : un navigateur ignore `'unsafe-inline'` dès qu'une empreinte est présente.
    const legacyCsp = buildCsp({
        ...CSP_DIRECTIVES,
        'script-src': [...CSP_DIRECTIVES['script-src'], "'unsafe-inline'"],
    });
    const isStrict = enforceStrictScriptSrc && !relaxedScriptSrc;
    return {
        'content-security-policy': isStrict ? strictCsp : legacyCsp,
        ...(isStrict || relaxedScriptSrc ? {} : { 'content-security-policy-report-only': strictCsp }),
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
}

/** En-têtes sans empreinte (référence pour les tests ; le build ajoute les empreintes). */
export const SECURITY_HEADERS = buildSecurityHeaders();

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Routes Build Output API de Vercel qui posent les en-têtes de sécurité.
 *
 * POURQUOI deux routes qui s'excluent : chaque réponse ne reçoit qu'un seul jeu d'en-têtes, sans dépendre
 * de l'ordre dans lequel Vercel fusionne deux routes `continue: true` qui poseraient le même en-tête.
 *
 * @param {{ scriptHashes?: Iterable<string>, enforceStrictScriptSrc?: boolean }} [options] - Voir
 *   `buildSecurityHeaders`.
 * @returns {{ src: string, headers: Record<string, string>, continue: true }[]} Routes à placer en tête.
 */
export function buildHeaderRoutes(options = {}) {
    const relaxedPattern = `(?:${RELAXED_SCRIPT_SRC_PATHS.map(escapeRegExp).join('|')})/?`;
    return [
        { src: `^(?!${relaxedPattern}$).*$`, headers: buildSecurityHeaders(options), continue: true },
        {
            src: `^${relaxedPattern}$`,
            headers: buildSecurityHeaders({ ...options, relaxedScriptSrc: true }),
            continue: true,
        },
    ];
}

/**
 * Empreinte CSP d'un contenu de script.
 *
 * @param {string} content - Texte exact du script (entre les balises).
 * @returns {string} `'sha256-<base64>'`.
 */
export function cspHash(content) {
    return `'sha256-${createHash('sha256').update(content, 'utf8').digest('base64')}'`;
}

const SCRIPT_RE = /<script\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/script\s*>/gi;
const TAG_RE = /<[a-zA-Z][^\s/>]*((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const ATTRIBUTE_RE = /([^\s=/>"']+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>"']+))?/g;
// POURQUOI : types exécutés par le navigateur (et donc soumis à `script-src`). Les blocs de données
// (`application/ld+json`, `application/json`) ne s'exécutent pas.
const EXECUTABLE_SCRIPT_TYPES = new Set(['', 'module', 'importmap', 'text/javascript', 'application/javascript']);

function readAttribute(attributes, name) {
    for (const [, attributeName, rawValue] of attributes.matchAll(ATTRIBUTE_RE)) {
        if (attributeName.toLowerCase() === name) return (rawValue ?? '').replace(/^["']|["']$/g, '');
    }
    return null;
}

/**
 * Analyse une page HTML : empreintes de ses scripts inline exécutables, gestionnaires inline et URLs
 * `javascript:` (que la CSP stricte refuserait).
 *
 * @param {string} html - Contenu de la page.
 * @returns {{ scriptHashes: string[], inlineHandlers: string[] }} Empreintes et attributs fautifs.
 */
export function analyzeHtml(html) {
    const scriptHashes = [];
    for (const [, attributes, content] of html.matchAll(SCRIPT_RE)) {
        if (readAttribute(attributes, 'src') !== null) continue;
        const type = (readAttribute(attributes, 'type') ?? '').trim().toLowerCase();
        if (!EXECUTABLE_SCRIPT_TYPES.has(type)) continue;
        scriptHashes.push(cspHash(content));
    }
    const inlineHandlers = [];
    for (const [, attributes] of html.replace(SCRIPT_RE, '').matchAll(TAG_RE)) {
        for (const [, attributeName, rawValue = ''] of attributes.matchAll(ATTRIBUTE_RE)) {
            const value = rawValue.replace(/^["']|["']$/g, '').trim();
            if (/^on[a-z]+$/i.test(attributeName) || /^javascript:/i.test(value)) {
                inlineHandlers.push(`${attributeName}="${value.slice(0, 60)}"`);
            }
        }
    }
    return { scriptHashes, inlineHandlers };
}

function listHtmlFiles(directory) {
    const files = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) files.push(...listHtmlFiles(entryPath));
        else if (entry.name.endsWith('.html')) files.push(entryPath);
    }
    return files;
}

/**
 * Analyse tout le HTML prérendu d'un dossier.
 *
 * @param {string} directory - Dossier de sortie client du build.
 * @returns {{ scriptHashes: Set<string>, violations: { file: string, attribute: string }[], pageCount: number }}
 */
export function collectInlineScripts(directory) {
    const scriptHashes = new Set();
    const violations = [];
    const files = listHtmlFiles(directory);
    for (const file of files) {
        const analysis = analyzeHtml(fs.readFileSync(file, 'utf8'));
        for (const hash of analysis.scriptHashes) scriptHashes.add(hash);
        for (const attribute of analysis.inlineHandlers) {
            violations.push({ file: path.relative(directory, file), attribute });
        }
    }
    return { scriptHashes, violations, pageCount: files.length };
}

/**
 * Empreintes des scripts inline qu'Astro insère avec les îlots (`astro-island` et directives `client:*`).
 *
 * POURQUOI : les pages rendues côté serveur (boutique, `/objets`, admin) ne passent pas par le HTML
 * prérendu ; leurs seuls scripts inline sont ceux-ci et ceux de BaseLayout, constants. On les lit dans
 * `@astrojs/runtime`, exactement comme Astro les insère (`getPrescripts`).
 *
 * @returns {Promise<string[]>} Empreintes au format CSP.
 */
export async function getAstroRuntimeScriptHashes() {
    return ASTRO_RUNTIME_INLINE_SCRIPTS.map(cspHash);
}

/**
 * Intégration Astro qui injecte les en-têtes de sécurité dans la config Build Output API de Vercel.
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
            'astro:build:done': async ({ dir, logger }) => {
                const configPath = path.join(root, '.vercel/output/config.json');
                if (!fs.existsSync(configPath)) {
                    logger.warn(`${configPath} introuvable : en-têtes de sécurité non ajoutés.`);
                    return;
                }
                const { scriptHashes, violations, pageCount } = collectInlineScripts(fileURLToPath(dir));
                if (violations.length > 0) {
                    const sample = violations
                        .slice(0, 10)
                        .map(({ file, attribute }) => `  ${file} : ${attribute}`)
                        .join('\n');
                    throw new Error(
                        `${violations.length} gestionnaire(s) inline ou URL javascript: dans le HTML, refusés par la CSP ` +
                            `(utiliser un écouteur, voir l'écouteur d'images de BaseLayout.astro) :\n${sample}`,
                    );
                }
                for (const hash of await getAstroRuntimeScriptHashes()) scriptHashes.add(hash);

                const vercelConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                vercelConfig.routes = vercelConfig.routes ?? [];
                vercelConfig.routes.unshift(...buildHeaderRoutes({ scriptHashes }));
                fs.writeFileSync(configPath, JSON.stringify(vercelConfig, null, '\t'));
                logger.info(
                    `En-têtes de sécurité ajoutés à .vercel/output/config.json (${scriptHashes.size} empreintes de ` +
                        `scripts inline, ${pageCount} pages ; politique stricte ${ENFORCE_STRICT_SCRIPT_SRC ? 'appliquée' : 'en Report-Only'}).`,
                );
            },
        },
    };
}
