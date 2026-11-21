/**
 * @file crossmatch-variable-stars.mjs
 * @description Cross-match spatial Gaia DR3 des étoiles variables sans distance, tranche de magnitude
 * par tranche de magnitude.
 *
 * Responsabilité principale :
 * - Sélectionner dans Turso les étoiles de variable_stars sans distance (distance IS NULL) et absentes
 *   de la table de suivi variable_stars_gaia, par tranches de v_mag_max (<= 12, puis 1 mag jusqu'à
 *   --max-mag) et par lots de --batch-size.
 * - Envoyer chaque lot à l'API CDS XMatch (cat2 = vizier:I/355/gaiadr3, rayon 3″).
 * - Écrire la distance en années-lumière (round(3261.56 / Plx)) quand une parallaxe positive est
 *   trouvée ; sinon marquer l'étoile « not_found » dans variable_stars_gaia pour ne plus la redemander.
 * - Créer variable_stars_gaia si elle n'existe pas.
 *
 * Effet distant : Turso (UPDATE de variable_stars.distance, écriture dans variable_stars_gaia ;
 * TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, .env de la racine du dépôt) et API CDS XMatch.
 *
 * Options disponibles (valeur séparée par une espace, pas de `=` ; toute option inconnue est ignorée) :
 *   --max-mag <n>    : dernière tranche de v_mag_max traitée ; défaut 30.8. La tranche <= 12 est
 *                      toujours traitée. Valeur non numérique ou <= 0 ignorée (défaut retenu).
 *   --batch-size <n> : nombre d'étoiles par requête CDS XMatch ; défaut 15000. Valeur invalide ignorée.
 *   --reset          : WARNING: vide la table variable_stars_gaia (DELETE) avant le traitement, pour
 *                      redemander toutes les étoiles marquées « not_found ». Ne touche pas aux
 *                      distances déjà écrites.
 *
 * Code de sortie : 1 si CDS XMatch échoue sur un lot (les lots précédents restent écrits : relancer
 * reprend où le script s'est arrêté) ou si TURSO_DATABASE_URL manque. Une erreur Turso est affichée
 * avec le code 0.
 *
 * Exemples d'utilisation :
 *   node scripts/pipeline/crossmatch-variable-stars.mjs                       # toutes les tranches
 *   node scripts/pipeline/crossmatch-variable-stars.mjs --max-mag 15.0
 *   node scripts/pipeline/crossmatch-variable-stars.mjs --batch-size 20000
 *   node scripts/pipeline/crossmatch-variable-stars.mjs --reset --max-mag 12.0
 *   npm run crossmatch-gaia -- --max-mag 16
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Papa from 'papaparse';
import { loadEnv } from '../lib/env.mjs';
import { createTursoClient } from '../lib/turso.mjs';

loadEnv();

// Charger le fichier .env depuis la racine du projet, quel que soit le répertoire d'exécution actuel (CWD)
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Exécute un lot d'instructions SQL sur Turso avec gestion des retentatives et timeout.
 *
 * POURQUOI: Les opérations d'écriture en masse sur Turso peuvent rencontrer des congestions réseau
 * ou des verrous temporaires SQLite. Le retry avec backoff exponentiel fiabilise l'exécution.
 *
 * @param {import('@libsql/client').Client} dbClient - Le client Turso.
 * @param {Array<{sql: string, args: any[]}>} statements - Liste des requêtes SQL à exécuter en lot.
 * @param {number} [retries=5] - Nombre maximal de tentatives.
 * @param {number} [delay=1500] - Délai initial en millisecondes avant retentative.
 * @returns {Promise<void>}
 */
async function executeBatchWithRetry(dbClient, statements, retries = 5, delay = 1500) {
    const timeoutMs = 30000;
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            await Promise.race([
                dbClient.batch(statements),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error("TIMEOUT: Turso n'a pas répondu dans les 30s")), timeoutMs),
                ),
            ]);
            return;
        } catch (err) {
            if (attempt === retries) throw err;
            console.warn(
                `   ⚠️ [Tentative ${attempt}/${retries}] Échec d'écriture : ${err.message}. Nouvelle tentative dans ${delay}ms...`,
            );
            await new Promise((resolve) => setTimeout(resolve, delay));
            delay *= 2;
        }
    }
}

/**
 * Point d'entrée principal pour le cross-match spatial Gaia DR3.
 *
 * @returns {Promise<void>}
 */
async function main() {
    console.log('📡 Démarrage du pipeline de cross-match spatial Gaia DR3 (Tranche par Tranche)...');

    // Analyse des arguments en ligne de commande
    const args = process.argv.slice(2);
    const isReset = args.includes('--reset');

    let maxMag = 30.8;
    const magIdx = args.indexOf('--max-mag');
    if (magIdx !== -1 && args[magIdx + 1]) {
        const parsedMag = parseFloat(args[magIdx + 1]);
        if (!isNaN(parsedMag) && parsedMag > 0) maxMag = parsedMag;
    }

    let batchSize = 15000;
    const batchIdx = args.indexOf('--batch-size');
    if (batchIdx !== -1 && args[batchIdx + 1]) {
        const parsedBatch = parseInt(args[batchIdx + 1], 10);
        if (!isNaN(parsedBatch) && parsedBatch > 0) batchSize = parsedBatch;
    }

    const dbClient = createTursoClient();

    try {
        // 1. Initialiser la table de suivi Gaia si elle n'existe pas
        await dbClient.execute(`
            CREATE TABLE IF NOT EXISTS variable_stars_gaia (
                star_id TEXT PRIMARY KEY,
                status TEXT NOT NULL
            )
        `);

        if (isReset) {
            console.log('🧹 Option --reset détectée : réinitialisation de la table variable_stars_gaia...');
            await dbClient.execute('DELETE FROM variable_stars_gaia');
            console.log('✅ Table variable_stars_gaia réinitialisée !');
        }

        // 2. Définir les tranches de magnitude à traiter
        const bands = [
            {
                name: 'Mag <= 12.0',
                filter: 'v_mag_max <= 12.0',
            },
        ];

        const minMag = 12.0;
        for (let m = minMag; m < maxMag; m++) {
            const nextM = Math.min(maxMag, m + 1.0);
            bands.push({
                name: `Mag ]${m.toFixed(1)}, ${nextM.toFixed(1)}]`,
                filter: `v_mag_max > ${m.toFixed(1)} AND v_mag_max <= ${nextM.toFixed(1)}`,
            });
        }

        let totalMatchedGlobal = 0;
        let totalFailedGlobal = 0;

        console.log(`🎯 Analyse configurée jusqu'à la magnitude ${maxMag.toFixed(1)} sur ${bands.length} tranches.\n`);

        // 3. Traiter tranche par tranche de magnitude
        for (let b = 0; b < bands.length; b++) {
            const band = bands[b];

            // Compter les étoiles restantes sans Gaia dans cette tranche
            const countRes = await dbClient.execute({
                sql: `
                    SELECT COUNT(*) as count 
                    FROM variable_stars 
                    WHERE distance IS NULL 
                      AND id NOT IN (SELECT star_id FROM variable_stars_gaia)
                      AND ${band.filter}
                `,
                args: [],
            });
            const remainingInBand = Number(countRes.rows[0].count);

            if (remainingInBand === 0) {
                console.log(
                    `⏭️  [Tranche ${b + 1}/${bands.length}] ${band.name} : 0 étoile à traiter (déjà complétée).`,
                );
                continue;
            }

            console.log(
                `🚀 [Tranche ${b + 1}/${bands.length}] ${band.name} : ${remainingInBand.toLocaleString('fr-FR')} étoiles à traiter avec Gaia DR3...`,
            );

            let bandMatched = 0;
            let bandFailed = 0;

            while (true) {
                // Récupérer le lot d'étoiles pour cette tranche
                const res = await dbClient.execute({
                    sql: `
                        SELECT id, name, ra, dec 
                        FROM variable_stars 
                        WHERE distance IS NULL 
                          AND id NOT IN (SELECT star_id FROM variable_stars_gaia)
                          AND ${band.filter}
                        LIMIT ?
                    `,
                    args: [batchSize],
                });

                if (res.rows.length === 0) break;

                const stars = res.rows.map((r) => ({
                    id: r.id,
                    name: r.name,
                    ra: Number(r.ra),
                    dec: Number(r.dec),
                }));

                console.log(
                    `   📡 Lot de ${stars.length.toLocaleString('fr-FR')} étoiles -> Envoi à CDS XMatch (Gaia DR3)...`,
                );

                // Génération du CSV pour CDS XMatch
                const csvRows = stars.map((s) => ({ id: s.id, raj2000: s.ra, dej2000: s.dec }));
                const csvContent = Papa.unparse(csvRows);

                const formData = new FormData();
                formData.append('request', 'xmatch');
                formData.append('distMaxArcsec', '3');
                formData.append('RESPONSEFORMAT', 'csv');

                const blob = new Blob([csvContent], { type: 'text/csv' });
                formData.append('cat1', blob, 'targets.csv');
                formData.append('cat2', 'vizier:I/355/gaiadr3');
                formData.append('colRA1', 'raj2000');
                formData.append('colDec1', 'dej2000');

                const nameToPlx = new Map();
                try {
                    const response = await fetch('http://cdsxmatch.u-strasbg.fr/xmatch/api/v1/sync', {
                        method: 'POST',
                        body: formData,
                    });
                    if (!response.ok) {
                        throw new Error(`CDS XMatch HTTP status ${response.status}`);
                    }
                    const csvText = await response.text();
                    const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true, dynamicTyping: true });
                    for (const row of parsed.data) {
                        if (row.Plx !== null && row.Plx !== undefined && row.Plx > 0) {
                            nameToPlx.set(String(row.id), row.Plx);
                        }
                    }
                } catch (err) {
                    console.error(`   ❌ Échec du CDS XMatch pour ce lot : ${err.message}`);
                    process.exit(1);
                }

                // Préparation des requêtes de mise à jour Turso
                const statements = [];
                let matchedInBatch = 0;

                for (const star of stars) {
                    const plx = nameToPlx.get(star.id);
                    if (plx !== undefined && plx > 0) {
                        const distance = Math.round(3261.56 / plx);
                        statements.push({
                            sql: 'UPDATE variable_stars SET distance = ? WHERE id = ?',
                            args: [distance, star.id],
                        });
                        matchedInBatch++;
                    } else {
                        statements.push({
                            sql: "INSERT OR REPLACE INTO variable_stars_gaia (star_id, status) VALUES (?, 'not_found')",
                            args: [star.id],
                        });
                    }
                }

                const failedInBatch = stars.length - matchedInBatch;
                bandMatched += matchedInBatch;
                bandFailed += failedInBatch;
                totalMatchedGlobal += matchedInBatch;
                totalFailedGlobal += failedInBatch;

                console.log(
                    `   💾 Mise à jour Turso : ${matchedInBatch.toLocaleString('fr-FR')} distances ajoutées, ${failedInBatch.toLocaleString('fr-FR')} non trouvées.`,
                );

                // Écriture par sous-lots de 200
                const dbBatchSize = 200;
                for (let i = 0; i < statements.length; i += dbBatchSize) {
                    const chunk = statements.slice(i, i + dbBatchSize);
                    await executeBatchWithRetry(dbClient, chunk);
                }
            }

            console.log(
                `   ✅ Tranche ${band.name} terminée : +${bandMatched.toLocaleString('fr-FR')} avec Gaia, ${bandFailed.toLocaleString('fr-FR')} sans correspondance.\n`,
            );
        }

        console.log(`\n🎉 Cross-match Gaia DR3 terminé avec succès !`);
        console.log(`====================================================`);
        console.log(`- Distances Gaia ajoutées : ${totalMatchedGlobal.toLocaleString('fr-FR')}`);
        console.log(`- Étoiles sans parallaxe Gaia : ${totalFailedGlobal.toLocaleString('fr-FR')}`);
        console.log(`====================================================`);
    } catch (e) {
        console.error('❌ Erreur pendant le cross-match Gaia :', e);
    } finally {
        dbClient.close();
    }
}

main();
