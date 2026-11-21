/**
 * Audit Lighthouse des pages principales du site
 *
 * Responsabilité principale :
 * - Lancer `npx lighthouse` (sortie JSON) sur la liste de pages codée en dur dans PAGES : pages
 *   principales, une page de détail par section et les outils (carte du ciel, objets, catalogues…).
 * - Réessayer une fois une page en échec, puis l'enregistrer avec son message d'erreur.
 * - Extraire les 4 scores (performance, accessibilité, bonnes pratiques, SEO) et les métriques (LCP,
 *   CLS, TBT, FCP, TTFB, poids total), calculer les moyennes.
 * - Écrire src/data/lighthouse-results.json (versionné, lu par le panneau d'admin).
 *
 * Cible : la production par défaut. Aucune détection automatique du serveur local : il faut passer
 * --target=local, avec `npm run dev` déjà lancé sur le port 4321.
 *
 * Chrome : si Chrome est trouvé aux chemins Windows connus, une instance headless dédiée est lancée sur
 * le port de débogage 9222 et Lighthouse s'y connecte ; ailleurs (macOS, Linux), Lighthouse lance
 * lui-même Chrome. Profil et rapports temporaires dans temp/ (racine du dépôt).
 *
 * Effet distant : aucune écriture ; requêtes HTTP vers la cible. Effet local :
 * src/data/lighthouse-results.json et temp/.
 *
 * Options disponibles :
 *   --target=local : audite http://localhost:4321.
 *   --target=prod  : audite https://www.miroirspolaires.fr (défaut, aussi sans option).
 *   Une autre valeur de --target et tout autre argument sont ignorés (production retenue).
 *
 * Code de sortie : toujours 0 ; les pages en échec figurent dans le JSON avec un champ `error`.
 *
 * Exemples d'utilisation :
 *   node scripts/audit/lighthouse-runner.mjs                  # production
 *   node scripts/audit/lighthouse-runner.mjs --target=local   # serveur de dev local
 *   node scripts/audit/lighthouse-runner.mjs --target=prod
 */

import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const OUTPUT_FILE = path.join(PROJECT_ROOT, 'src/data/lighthouse-results.json');
const TEMP_DIR = path.join(PROJECT_ROOT, 'temp');

// Helper to locate installed Chrome executable on Windows/Linux/Mac
function findChromePath() {
    const candidatePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
        path.join(process.env.PROGRAMFILES || '', 'Google\\Chrome\\Application\\chrome.exe'),
        path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google\\Chrome\\Application\\chrome.exe'),
    ];
    return candidatePaths.find((p) => p && fs.existsSync(p)) || null;
}

// Core pages to audit
const PAGES = [
    { name: 'Accueil', path: '/', group: 'pages_principales' },
    { name: 'Astrophotographies (Listing)', path: '/astrophotographies', group: 'pages_principales' },
    { name: 'Voyages (Listing)', path: '/voyages', group: 'pages_principales' },
    { name: 'Blog (Listing)', path: '/blog', group: 'pages_principales' },
    { name: 'Vidéos (Listing)', path: '/videos', group: 'pages_principales' },
    { name: 'À propos', path: '/a-propos', group: 'pages_principales' },
    { name: 'Observatoires', path: '/observatoires', group: 'pages_principales' },
    { name: 'Statistiques', path: '/statistiques', group: 'pages_principales' },

    {
        name: 'Astrophoto (Détail Orion)',
        path: '/astrophotographies/la-nebuleuse-d-orion-m42-1213620',
        group: 'astrophotographies',
    },
    { name: 'Voyage (Détail Transylvanie)', path: '/voyages/2026/la-transylvanie', group: 'voyages' },
    { name: 'Blog (Détail Transylvanie)', path: '/blog/2026/road-trip-en-transylvanie', group: 'blog' },
    { name: 'Vidéo (Détail Astrologie)', path: '/videos/astrologie-astronomie', group: 'videos' },

    { name: 'Carte du ciel', path: '/carte-du-ciel', group: 'outils' },
    { name: 'Explorateur Objets', path: '/objets', group: 'outils' },
    { name: 'Catalogues (Index)', path: '/catalogues', group: 'outils' },
    { name: 'Catalogue Messier', path: '/catalogues/messier', group: 'outils' },
    { name: 'Recommandations', path: '/recommandations', group: 'outils' },
];

async function probePort(url) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        return res.ok || res.status === 404; // 404 is still a running server
    } catch {
        return false;
    }
}

async function run() {
    console.log('=========================================');
    console.log("⚡ LANÇEMENT DE L'AUDIT LIGHTHOUSE ⚡");
    console.log('=========================================\n');

    // Auto-detect target
    let baseUrl = 'https://www.miroirspolaires.fr';
    let mode = 'production';

    // Check args
    const targetArg = process.argv.find((arg) => arg.startsWith('--target='));
    if (targetArg) {
        const val = targetArg.split('=')[1];
        if (val === 'local') {
            baseUrl = 'http://localhost:4321';
            mode = 'local';
        } else if (val === 'prod') {
            baseUrl = 'https://www.miroirspolaires.fr';
            mode = 'production';
        }
    } else {
        // Default to production site (https://www.miroirspolaires.fr) as requested.
        console.log('Defaulting to production site audit.');
        baseUrl = 'https://www.miroirspolaires.fr';
        mode = 'production';
    }

    console.log(`\nAuditing target: ${baseUrl} (${mode})`);
    console.log(`Total URLs to audit: ${PAGES.length}\n`);

    // Ensure temp dirs exist
    if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
    }
    const chromeUserDataDir = path.join(TEMP_DIR, 'chrome-profile');
    if (!fs.existsSync(chromeUserDataDir)) {
        fs.mkdirSync(chromeUserDataDir, { recursive: true });
    }

    // Launch single Chrome instance on port 9222 to prevent Windows EPERM chrome-launcher crashes
    const chromePath = findChromePath();
    let chromeProcess = null;
    const DEBUG_PORT = 9222;

    if (chromePath) {
        console.log(`🚀 Lancement d'un navigateur Chrome dédié (port ${DEBUG_PORT})...`);
        chromeProcess = spawn(
            chromePath,
            [
                `--remote-debugging-port=${DEBUG_PORT}`,
                '--headless=new',
                '--no-sandbox',
                '--disable-gpu',
                '--disable-dev-shm-usage',
                `--user-data-dir=${chromeUserDataDir}`,
                '--no-first-run',
                '--no-default-browser-check',
            ],
            { stdio: 'ignore' },
        );

        // Wait for Chrome remote debugging port to respond
        let portReady = false;
        for (let attempt = 0; attempt < 10; attempt++) {
            await new Promise((r) => setTimeout(r, 400));
            portReady = await probePort(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
            if (portReady) break;
        }

        if (portReady) {
            console.log(`✅ Instance Chrome connectée avec succès sur http://127.0.0.1:${DEBUG_PORT}\n`);
        } else {
            console.warn(`⚠️ Impossible d'interroger le port ${DEBUG_PORT}, repli sur le mode standard.\n`);
            try {
                chromeProcess.kill();
            } catch {
                // POURQUOI : le processus peut déjà être terminé, rien à nettoyer.
            }
            chromeProcess = null;
        }
    }

    const results = [];
    const startTime = Date.now();

    try {
        for (let i = 0; i < PAGES.length; i++) {
            const page = PAGES[i];
            const fullUrl = `${baseUrl.replace(/\/$/, '')}${page.path}`;
            const cleanPath = page.path.replace(/\//g, '_').replace(/^_|_$/g, '') || 'home';
            const tempReportPath = path.join(TEMP_DIR, `lh_${cleanPath}.json`);

            console.log(`\n[${i + 1}/${PAGES.length}] Auditing: ${page.name} (${page.path})`);
            console.log(`URL: ${fullUrl}`);

            let auditedSuccessfully = false;
            let attempts = 0;
            const maxAttempts = 2;

            while (attempts < maxAttempts && !auditedSuccessfully) {
                attempts++;
                try {
                    // Delete previous report if any
                    if (fs.existsSync(tempReportPath)) {
                        try {
                            fs.unlinkSync(tempReportPath);
                        } catch {
                            // POURQUOI : fichier temporaire, un échec de suppression est sans conséquence.
                        }
                    }

                    // If Chrome is running on port 9222, instruct Lighthouse to connect directly to it.
                    // This COMPLETELY bypasses chrome-launcher's temp folder creation and destroyTmp() EPERM crashes!
                    const cmd = chromeProcess
                        ? `npx lighthouse ${fullUrl} --port=${DEBUG_PORT} --output=json --output-path="${tempReportPath}" --quiet`
                        : `npx lighthouse ${fullUrl} --chrome-flags="--headless --no-sandbox --disable-gpu --disable-dev-shm-usage --user-data-dir=\\"${chromeUserDataDir}\\"" --output=json --output-path="${tempReportPath}" --quiet`;

                    try {
                        execSync(cmd, { stdio: 'inherit', cwd: PROJECT_ROOT });
                    } catch (cmdError) {
                        // If report exists despite exit code, we consider it salvaged.
                        if (!fs.existsSync(tempReportPath)) {
                            throw cmdError;
                        }
                    }

                    if (!fs.existsSync(tempReportPath)) {
                        throw new Error('Lighthouse failed to generate output report.');
                    }

                    const rawJson = fs.readFileSync(tempReportPath, 'utf8');
                    const report = JSON.parse(rawJson);

                    const scores = {
                        performance: Math.round((report.categories.performance?.score || 0) * 100),
                        accessibility: Math.round((report.categories.accessibility?.score || 0) * 100),
                        bestPractices: Math.round((report.categories['best-practices']?.score || 0) * 100),
                        seo: Math.round((report.categories.seo?.score || 0) * 100),
                    };

                    const metrics = {
                        lcp: report.audits['largest-contentful-paint']?.numericValue || 0,
                        cls: report.audits['cumulative-layout-shift']?.numericValue || 0,
                        tbt: report.audits['total-blocking-time']?.numericValue || 0,
                        fcp: report.audits['first-contentful-paint']?.numericValue || 0,
                        ttfb: report.audits['server-response-time']?.numericValue || 0,
                        totalBytes: report.audits['total-byte-weight']?.numericValue || 0,
                    };

                    console.log(
                        `Scores: Perf: ${scores.performance} | A11y: ${scores.accessibility} | Best: ${scores.bestPractices} | SEO: ${scores.seo}`,
                    );
                    console.log(
                        `LCP: ${(metrics.lcp / 1000).toFixed(2)}s | CLS: ${metrics.cls.toFixed(3)} | TBT: ${metrics.tbt.toFixed(0)}ms | Bytes: ${(metrics.totalBytes / 1024).toFixed(0)} KB`,
                    );

                    results.push({
                        path: page.path,
                        name: page.name,
                        group: page.group,
                        scores,
                        metrics,
                    });

                    auditedSuccessfully = true;

                    // Clean up temp report file
                    try {
                        fs.unlinkSync(tempReportPath);
                    } catch {
                        // POURQUOI : fichier temporaire, un échec de suppression est sans conséquence.
                    }
                } catch (error) {
                    if (attempts < maxAttempts) {
                        console.warn(
                            `⚠️ Attempt ${attempts} failed for ${page.name}. Retrying in 1.5s... (${error.message})`,
                        );
                        await new Promise((r) => setTimeout(r, 1500));
                    } else {
                        console.error(`❌ Error auditing ${page.name}:`, error.message);
                        results.push({
                            path: page.path,
                            name: page.name,
                            group: page.group,
                            error: error.message,
                        });
                    }
                }
            }

            // Brief delay between audits
            await new Promise((r) => setTimeout(r, 500));
        }
    } finally {
        if (chromeProcess) {
            console.log("\n🧹 Fermeture de l'instance Chrome...");
            try {
                chromeProcess.kill('SIGTERM');
            } catch {
                // POURQUOI : le processus peut déjà être terminé, rien à nettoyer.
            }
        }
    }

    const durationSeconds = Math.round((Date.now() - startTime) / 1000);
    const validResults = results.filter((r) => !r.error);

    const summary = {
        averagePerformance: Math.round(
            validResults.reduce((acc, r) => acc + r.scores.performance, 0) / Math.max(validResults.length, 1),
        ),
        averageAccessibility: Math.round(
            validResults.reduce((acc, r) => acc + r.scores.accessibility, 0) / Math.max(validResults.length, 1),
        ),
        averageBestPractices: Math.round(
            validResults.reduce((acc, r) => acc + r.scores.bestPractices, 0) / Math.max(validResults.length, 1),
        ),
        averageSeo: Math.round(
            validResults.reduce((acc, r) => acc + r.scores.seo, 0) / Math.max(validResults.length, 1),
        ),
    };

    const finalPayload = {
        target: baseUrl,
        mode,
        timestamp: new Date().toISOString(),
        durationSeconds,
        summary,
        results,
    };

    // Ensure src/data/ exists
    const dataDir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalPayload, null, 2), 'utf8');

    console.log('\n=========================================');
    console.log('🎉 AUDIT LIGHTHOUSE TERMINÉ AVEC SUCCÈS 🎉');
    console.log(`Rapport sauvegardé dans: src/data/lighthouse-results.json`);
    console.log(`Temps total: ${durationSeconds} secondes`);
    console.log(
        `Scores moyens: Perf: ${summary.averagePerformance} | A11y: ${summary.averageAccessibility} | Best: ${summary.averageBestPractices} | SEO: ${summary.averageSeo}`,
    );
    console.log('=========================================\n');
}

run();
