// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import securityHeaders, { CSP_DIRECTIVES, SECURITY_HEADERS, buildCsp } from './security-headers.mjs';

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

describe('intégration securityHeaders', () => {
    function setup() {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-headers-'));
        // POURQUOI : les hooks d'une intégration sont optionnels dans le type d'Astro.
        const integration = securityHeaders() as { hooks: Required<ReturnType<typeof securityHeaders>['hooks']> };
        integration.hooks['astro:config:done']({ config: { root: pathToFileURL(`${root}/`) } } as never);
        const logger = { info: vi.fn(), warn: vi.fn() };
        return { root, integration, logger };
    }

    it('ajoute la route d’en-têtes en tête de config.json', () => {
        const { root, integration, logger } = setup();
        const configPath = path.join(root, '.vercel/output/config.json');
        fs.mkdirSync(path.dirname(configPath), { recursive: true });
        fs.writeFileSync(configPath, JSON.stringify({ version: 3, routes: [{ handle: 'filesystem' }] }));

        integration.hooks['astro:build:done']({ logger } as never);

        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        expect(config.routes[0]).toEqual({ src: '/(.*)', headers: SECURITY_HEADERS, continue: true });
        expect(config.routes[1]).toEqual({ handle: 'filesystem' });
        fs.rmSync(root, { recursive: true });
    });

    it('prévient sans planter si config.json est absent', () => {
        const { root, integration, logger } = setup();
        integration.hooks['astro:build:done']({ logger } as never);
        expect(logger.warn).toHaveBeenCalled();
        fs.rmSync(root, { recursive: true });
    });
});
