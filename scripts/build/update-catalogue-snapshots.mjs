/**
 * Génération des instantanés de catalogues
 *
 * Responsabilité principale :
 * - Télécharge chaque catalogue du registre (SIMBAD, VizieR) avec le code du site
 *   (`fetchCatalogueEntriesLive`), donc la même normalisation et la même précession.
 * - Suit les routes et la priorité de `src/data/upstream-priority.json`, choisies dans `/admin/donnees/routes-cds` :
 *   pendant une panne du CDS, le script bascule sur les miroirs et indique la route utilisée.
 * - Écrit `src/data/catalogues/<slug>.json`, que le site lit à la place du CDS.
 * - Conserve l'instantané existant si un catalogue échoue ou revient tronqué, puis sort en
 *   erreur (code 1) : relancer plus tard suffit, les catalogues déjà écrits restent acquis.
 *
 * Effet de bord : écrit seulement des fichiers locaux versionnés, à committer ensuite. Aucune écriture distante.
 *
 * Options disponibles :
 *   --only=<slugs> : Limite la génération à ces catalogues, séparés par des virgules.
 *   --missing      : Ne télécharge que les catalogues sans instantané.
 *   --force        : Accepte une liste nettement plus courte que l'instantané actuel.
 *   --dry-run      : Télécharge et valide sans rien écrire.
 *
 * Exemples d'utilisation :
 *   npm run update-catalogues
 *   npm run update-catalogues -- --missing
 *   node scripts/build/update-catalogue-snapshots.mjs --only=messier,caldwell --dry-run
 */

import fs from 'node:fs';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseCliArgs } from '../lib/args.mjs';
import { findSnapshotRejection, serializeSnapshot } from '../lib/catalogue-snapshot.mjs';
import { PROJECT_ROOT } from '../lib/env.mjs';

// POURQUOI : Node efface les types mais ne connaît ni l'alias `@/` ni les imports sans extension du code
// de `src/lib/`. Ce résolveur évite de dupliquer les requêtes ADQL dans le script ou d'ajouter une dépendance.
registerHooks({
    resolve(specifier, context, nextResolve) {
        let baseUrl = null;
        if (specifier.startsWith('@/'))
            baseUrl = pathToFileURL(path.join(PROJECT_ROOT, 'src', specifier.slice(2))).href;
        else if (specifier.startsWith('.') && context.parentURL) baseUrl = new URL(specifier, context.parentURL).href;
        if (baseUrl && fs.existsSync(`${fileURLToPath(baseUrl)}.ts`)) return nextResolve(`${baseUrl}.ts`, context);
        return nextResolve(specifier, context);
    },
});

const { CATALOGUES } = await import('../../src/lib/catalogues/registry.ts');
const { fetchCatalogueEntriesLive } = await import('../../src/lib/catalogues/fetch.ts');
const { getLastUsedRouteId } = await import('../../src/lib/upstream/failover.ts');

const SNAPSHOT_DIR = path.join(PROJECT_ROOT, 'src/data/catalogues');

const snapshotPath = (slug) => path.join(SNAPSHOT_DIR, `${slug}.json`);

/**
 * Lit la taille de l'instantané actuel.
 *
 * @param {string} slug - Slug du catalogue.
 * @returns {number | null} Le nombre d'entrées, null s'il n'y a pas d'instantané.
 */
function readExistingCount(slug) {
    if (!fs.existsSync(snapshotPath(slug))) return null;
    return JSON.parse(fs.readFileSync(snapshotPath(slug), 'utf8')).entries.length;
}

/**
 * Sélectionne les catalogues à traiter selon les options.
 *
 * @param {string | undefined} onlyOption - Valeur de `--only`.
 * @param {boolean} isMissingOnly - Présence de `--missing`.
 * @returns {Array<{ slug: string, count: number }>} Les catalogues retenus.
 * @throws {Error} Si `--only` nomme un catalogue inconnu.
 */
function selectCatalogues(onlyOption, isMissingOnly) {
    let selected = CATALOGUES;
    if (onlyOption) {
        const slugs = onlyOption.split(',').map((slug) => slug.trim());
        const unknownSlug = slugs.find((slug) => !CATALOGUES.some((c) => c.slug === slug));
        if (unknownSlug) throw new Error(`Catalogue inconnu : ${unknownSlug}`);
        selected = CATALOGUES.filter((c) => slugs.includes(c.slug));
    }
    return isMissingOnly ? selected.filter((c) => !fs.existsSync(snapshotPath(c.slug))) : selected;
}

async function main() {
    const { flags, values } = parseCliArgs(process.argv.slice(2), {
        flags: { dryRun: ['--dry-run'], force: ['--force'], missing: ['--missing'] },
        valueOptions: ['--only'],
    });
    const catalogues = selectCatalogues(values['--only'], flags.missing);
    const failures = [];
    const generatedAt = new Date().toISOString();

    if (!flags.dryRun) fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });

    // POURQUOI : séquentiel pour ménager un service public gratuit. Ce script tourne rarement, sa durée importe peu.
    for (const catalogue of catalogues) {
        try {
            const listing = await fetchCatalogueEntriesLive(catalogue.slug);
            const entries = listing?.entries ?? [];
            const rejection = findSnapshotRejection(entries, readExistingCount(catalogue.slug), flags.force);
            if (rejection) throw new Error(rejection);

            if (!flags.dryRun) {
                const temporaryPath = `${snapshotPath(catalogue.slug)}.tmp`;
                fs.writeFileSync(temporaryPath, serializeSnapshot(entries, generatedAt));
                fs.renameSync(temporaryPath, snapshotPath(catalogue.slug));
            }
            const serviceId = catalogue.source === 'simbad-list' ? 'simbad' : 'vizier';
            console.log(
                `✓ ${catalogue.slug} : ${entries.length} entrées (attendu ≈ ${catalogue.count}), via ${serviceId}/${getLastUsedRouteId(serviceId)}`,
            );
        } catch (error) {
            failures.push(catalogue.slug);
            console.error(`✗ ${catalogue.slug} : ${error.message}`);
        }
    }

    console.log(
        `\n${catalogues.length - failures.length}/${catalogues.length} catalogues${flags.dryRun ? ' (dry-run)' : ''}.`,
    );
    if (failures.length > 0) {
        console.error(`Échecs, instantanés inchangés : ${failures.join(', ')}`);
        process.exit(1);
    }
}

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
