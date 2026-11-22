// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import securityHeaders, {
    CSP_DIRECTIVES,
    ENFORCE_STRICT_SCRIPT_SRC,
    SECURITY_HEADERS,
    analyzeHtml,
    buildCsp,
    buildHeaderRoutes,
    buildSecurityHeaders,
    collectInlineScripts,
    cspHash,
    getAstroRuntimeScriptHashes,
} from './security-headers.mjs';

describe('buildCsp', () => {
    it('sérialise chaque directive avec ses sources', () => {
        expect(buildCsp({ 'default-src': ["'self'"], 'upgrade-insecure-requests': [] })).toBe(
            "default-src 'self'; upgrade-insecure-requests",
        );
    });

    it('interdit l’intégration en iframe, les plugins et autorise les domaines de la boutique', () => {
        const csp = SECURITY_HEADERS['content-security-policy'];
        expect(csp).toContain("frame-ancestors 'none'");
        expect(csp).toContain("object-src 'none'");
        expect(CSP_DIRECTIVES['script-src']).toContain('https://widget.mondialrelay.com');
        expect(CSP_DIRECTIVES['script-src']).toContain("'wasm-unsafe-eval'");
    });

    it('autorise les replis du CDS chargés par le navigateur', () => {
        for (const host of ['https://skies.esac.esa.int', 'https://hips.china-vo.org']) {
            expect(CSP_DIRECTIVES['img-src']).toContain(host);
            expect(CSP_DIRECTIVES['connect-src']).toContain(host);
        }
        expect(CSP_DIRECTIVES['img-src']).toContain('https://skyview.gsfc.nasa.gov');
        expect(CSP_DIRECTIVES['connect-src']).toContain('data:');
    });

    it('pose les en-têtes de durcissement attendus', () => {
        expect(SECURITY_HEADERS).toMatchObject({
            'x-frame-options': 'DENY',
            'x-content-type-options': 'nosniff',
            'referrer-policy': 'strict-origin-when-cross-origin',
            'cross-origin-opener-policy': 'same-origin-allow-popups',
        });
    });
});

describe('politique des scripts', () => {
    const scriptSrc = (csp: string) => csp.split('; ').find((directive) => directive.startsWith('script-src ')) ?? '';

    it('applique la politique stricte (WARNING: ne repasser à false que pour un dépannage)', () => {
        expect(ENFORCE_STRICT_SCRIPT_SRC).toBe(true);
        expect(scriptSrc(SECURITY_HEADERS['content-security-policy'])).not.toContain("'unsafe-inline'");
    });

    it('n’autorise pas les scripts inline dans la politique de base', () => {
        expect(CSP_DIRECTIVES['script-src']).not.toContain("'unsafe-inline'");
    });

    it('envoie la politique stricte en Report-Only tant qu’elle n’est pas appliquée', () => {
        const headers = buildSecurityHeaders({ scriptHashes: ["'sha256-abc'"], enforceStrictScriptSrc: false });
        expect(scriptSrc(headers['content-security-policy'])).toContain("'unsafe-inline'");
        // POURQUOI : une empreinte ferait ignorer 'unsafe-inline' par le navigateur.
        expect(headers['content-security-policy']).not.toContain('sha256-');
        expect(scriptSrc(headers['content-security-policy-report-only'])).not.toContain("'unsafe-inline'");
        expect(headers['content-security-policy-report-only']).toContain("'sha256-abc'");
    });

    it('applique la politique stricte avec ses empreintes, sans Report-Only', () => {
        const headers = buildSecurityHeaders({
            scriptHashes: ["'sha256-b'", "'sha256-a'", "'sha256-a'"],
            enforceStrictScriptSrc: true,
        });
        expect(scriptSrc(headers['content-security-policy'])).not.toContain("'unsafe-inline'");
        expect(scriptSrc(headers['content-security-policy'])).toMatch(/'sha256-a' 'sha256-b'$/);
        expect(headers['content-security-policy-report-only']).toBeUndefined();
    });

    it('garde la politique historique sur la boutique (widget Mondial Relay), et seulement là', () => {
        const [main, relaxed] = buildHeaderRoutes({ scriptHashes: ["'sha256-a'"], enforceStrictScriptSrc: true });
        const mainRe = new RegExp(main.src);
        const relaxedRe = new RegExp(relaxed.src);
        for (const pathname of ['/boutique', '/boutique/']) {
            expect(relaxedRe.test(pathname)).toBe(true);
            expect(mainRe.test(pathname)).toBe(false);
        }
        for (const pathname of ['/', '/boutique/confirmation', '/boutique-x', '/blog/2026/a/', '/admin']) {
            expect(mainRe.test(pathname)).toBe(true);
            expect(relaxedRe.test(pathname)).toBe(false);
        }
        expect(scriptSrc(relaxed.headers['content-security-policy'])).toContain("'unsafe-inline'");
        expect(relaxed.headers['content-security-policy-report-only']).toBeUndefined();
        expect(scriptSrc(main.headers['content-security-policy'])).not.toContain("'unsafe-inline'");
    });
});

describe('analyse du HTML', () => {
    it('calcule l’empreinte des scripts inline exécutables seulement', () => {
        const html = [
            '<script>a()</script>',
            '<script type="module">b()</script>',
            '<script src="/x.js"></script>',
            '<script type="application/ld+json">{"a":1}</script>',
            '<script type="application/json">{}</script>',
        ].join('');
        expect(analyzeHtml(html).scriptHashes).toEqual([cspHash('a()'), cspHash('b()')]);
    });

    it('produit l’empreinte attendue par les navigateurs', () => {
        // POURQUOI : valeur de référence calculée indépendamment (sha256 de "alert(1)" en base64).
        expect(cspHash('alert(1)')).toBe("'sha256-bhHHL3z2vDgxUt0W3dWQOrprscmda2Y5pLsLg4GF+pI='");
    });

    it('repère les gestionnaires inline et les URLs javascript:', () => {
        const html =
            '<img src="a.jpg" onerror="this.src=1"><a href="javascript:void(0)">x</a><p data-on="ok">online</p>' +
            '<script>var s = \'<img onerror="x">\';</script>';
        expect(analyzeHtml(html).inlineHandlers).toEqual(['onerror="this.src=1"', 'href="javascript:void(0)"']);
    });

    it('agrège les pages d’un dossier', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-html-'));
        fs.mkdirSync(path.join(dir, 'blog'));
        fs.writeFileSync(path.join(dir, 'index.html'), '<script>a()</script>');
        fs.writeFileSync(path.join(dir, 'blog', 'index.html'), '<script>a()</script><img onload="x()">');
        const result = collectInlineScripts(dir);
        expect(result.pageCount).toBe(2);
        expect([...result.scriptHashes]).toEqual([cspHash('a()')]);
        expect(result.violations).toEqual([{ file: path.join('blog', 'index.html'), attribute: 'onload="x()"' }]);
        fs.rmSync(dir, { recursive: true });
    });

    it('connaît les scripts d’amorçage des îlots d’Astro', async () => {
        const hashes = await getAstroRuntimeScriptHashes();
        expect(hashes).toHaveLength(6);
        for (const hash of hashes) expect(hash).toMatch(/^'sha256-[A-Za-z0-9+/]+=*'$/);
    });
});

describe('intégration securityHeaders', () => {
    function setup() {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-headers-'));
        const clientDir = path.join(root, 'dist', 'client');
        fs.mkdirSync(clientDir, { recursive: true });
        // POURQUOI : les hooks d'une intégration sont optionnels dans le type d'Astro.
        const integration = securityHeaders() as { hooks: Required<ReturnType<typeof securityHeaders>['hooks']> };
        integration.hooks['astro:config:done']({ config: { root: pathToFileURL(`${root}/`) } } as never);
        const logger = { info: vi.fn(), warn: vi.fn() };
        const run = () =>
            integration.hooks['astro:build:done']({ logger, dir: pathToFileURL(`${clientDir}/`) } as never);
        return { root, clientDir, run, logger };
    }

    function writeConfig(root: string) {
        const configPath = path.join(root, '.vercel/output/config.json');
        fs.mkdirSync(path.dirname(configPath), { recursive: true });
        fs.writeFileSync(configPath, JSON.stringify({ version: 3, routes: [{ handle: 'filesystem' }] }));
        return configPath;
    }

    it('ajoute les routes d’en-têtes en tête de config.json, avec les empreintes du HTML', async () => {
        const { root, clientDir, run } = setup();
        const configPath = writeConfig(root);
        fs.writeFileSync(path.join(clientDir, 'index.html'), '<script>theme()</script>');

        await run();

        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        expect(config.routes).toHaveLength(3);
        expect(config.routes[0].continue).toBe(true);
        const appliedCsp = config.routes[0].headers['content-security-policy'];
        expect(appliedCsp).toContain(cspHash('theme()'));
        for (const hash of await getAstroRuntimeScriptHashes()) expect(appliedCsp).toContain(hash);
        expect(config.routes[0].headers['content-security-policy-report-only']).toBeUndefined();
        expect(config.routes[1].src).toContain('boutique');
        expect(config.routes[2]).toEqual({ handle: 'filesystem' });
        fs.rmSync(root, { recursive: true });
    });

    it('fait échouer le build si le HTML contient un gestionnaire inline', async () => {
        const { root, clientDir, run } = setup();
        const configPath = writeConfig(root);
        fs.writeFileSync(path.join(clientDir, 'index.html'), '<img src="a.jpg" onerror="this.remove()">');

        await expect(run()).rejects.toThrow(/gestionnaire\(s\) inline/);
        expect(JSON.parse(fs.readFileSync(configPath, 'utf8')).routes).toHaveLength(1);
        fs.rmSync(root, { recursive: true });
    });

    it('prévient sans planter si config.json est absent', async () => {
        const { root, run, logger } = setup();
        await run();
        expect(logger.warn).toHaveBeenCalled();
        fs.rmSync(root, { recursive: true });
    });
});
