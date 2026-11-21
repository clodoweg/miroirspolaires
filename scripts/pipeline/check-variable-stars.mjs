/**
 * Audit de la table variable_stars : couverture par tranche de magnitude et couverture Gaia
 *
 * Responsabilité principale :
 * - Fixer la magnitude limite de l'audit : max(MAX(v_mag_max) en base, database_metadata
 *   variable_stars_max_mag, 12).
 * - Pour la tranche v_mag_max <= 12 puis chaque tranche de 1 mag jusqu'à cette limite, comparer le
 *   nombre de lignes Turso, le nombre d'étoiles VSX à période connue sur VizieR TAP (COUNT) et le
 *   nombre de lignes avec une distance (Gaia).
 * - Afficher un tableau Markdown et des recommandations.
 *
 * Limites connues : la base est filtrée sur v_mag_max (magnitude au minimum d'éclat) et VizieR sur
 * `max` (magnitude au maximum d'éclat) : les écarts par tranche ne sont qu'indicatifs. La note sur le
 * cross-match Gaia « par défaut pour Mag <= 12 » est obsolète : update-variable-stars.mjs ne le fait
 * plus, les distances viennent de crossmatch-variable-stars.mjs.
 *
 * Effet distant : aucune écriture. Lecture Turso (TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, .env de la
 * racine du dépôt) et requêtes VizieR TAP.
 *
 * Options disponibles :
 *   Aucune. Tout argument est ignoré.
 *
 * Code de sortie : 1 si TURSO_DATABASE_URL manque ; sinon 0, même en cas d'erreur (affichée). Une
 * tranche que VizieR ne renvoie pas est comptée à 0.
 *
 * Exemples d'utilisation :
 *   node scripts/pipeline/check-variable-stars.mjs
 *   npm run check-variable-stars
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '../lib/env.mjs';
import { createTursoClient } from '../lib/turso.mjs';

loadEnv();

// Charger le fichier .env depuis la racine du projet, quel que soit le répertoire d'exécution actuel (CWD)
const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
    console.log("🔍 Démarrage de l'audit de la base de données des étoiles variables...");

    const dbClient = createTursoClient();

    try {
        // 1. Déterminer la magnitude maximale dans la base locale et configurée
        const maxLocalRes = await dbClient.execute('SELECT MAX(v_mag_max) as max_mag FROM variable_stars');
        const maxLocal = maxLocalRes.rows[0].max_mag ? Number(maxLocalRes.rows[0].max_mag) : 0;

        const maxConfigRes = await dbClient.execute(
            "SELECT value FROM database_metadata WHERE key = 'variable_stars_max_mag'",
        );
        const maxConfig = maxConfigRes.rows[0]?.value ? Number(maxConfigRes.rows[0].value) : 12.0;

        const targetMaxMag = Math.max(maxLocal, maxConfig, 12.0);
        console.log(
            `📊 Magnitude maximale détectée : Locale = ${maxLocal.toFixed(1)}, Configurée = ${maxConfig.toFixed(1)}`,
        );
        console.log(`🎯 L'audit va analyser jusqu'à la magnitude ${targetMaxMag.toFixed(1)}`);

        // 2. Définir les tranches de magnitude à vérifier
        const bands = [
            {
                name: 'Mag <= 12.0',
                localFilter: 'v_mag_max <= 12.0',
                vizierFilter: 'max <= 12.0',
            },
        ];

        for (let m = 12.0; m < targetMaxMag; m++) {
            const nextM = Math.min(targetMaxMag, m + 1.0);
            bands.push({
                name: `Mag ]${m.toFixed(1)}, ${nextM.toFixed(1)}]`,
                localFilter: `v_mag_max > ${m.toFixed(1)} AND v_mag_max <= ${nextM.toFixed(1)}`,
                vizierFilter: `max > ${m.toFixed(1)} AND max <= ${nextM.toFixed(1)}`,
            });
        }

        console.log(`\n⏳ Récupération des statistiques (cela peut prendre quelques secondes)...`);

        const results = [];

        for (const band of bands) {
            console.log(`📡 Analyse de la tranche : ${band.name}...`);

            // A. Compter en local
            const localCountRes = await dbClient.execute(
                `SELECT COUNT(*) as count FROM variable_stars WHERE ${band.localFilter}`,
            );
            const localCount = Number(localCountRes.rows[0].count);

            // B. Compter en local avec Gaia (distance > 0)
            const localGaiaRes = await dbClient.execute(
                `SELECT COUNT(*) as count FROM variable_stars WHERE ${band.localFilter} AND distance IS NOT NULL AND distance > 0`,
            );
            const localGaiaCount = Number(localGaiaRes.rows[0].count);

            // C. Compter sur VizieR TAP
            let vizierCount = 0;
            const query = `SELECT COUNT(*) as count FROM "B/vsx/vsx" WHERE ${band.vizierFilter} AND Period IS NOT NULL`;
            const url = `https://tapvizier.u-strasbg.fr/TAPVizieR/tap/sync?request=doQuery&lang=ADQL&query=${encodeURIComponent(query)}&format=json`;

            try {
                const res = await fetch(url);
                if (res.ok) {
                    const json = await res.json();
                    vizierCount = json.data?.[0]?.[0] ? Number(json.data[0][0]) : 0;
                } else {
                    console.warn(
                        `   ⚠️ Impossible de contacter VizieR pour la tranche ${band.name} (HTTP ${res.status})`,
                    );
                }
            } catch (e) {
                console.warn(`   ⚠️ Erreur de connexion VizieR pour la tranche ${band.name} : ${e.message}`);
            }

            const diff = Math.max(0, vizierCount - localCount);
            const missingPct = vizierCount > 0 ? (diff / vizierCount) * 100 : 0;
            const gaiaPct = localCount > 0 ? (localGaiaCount / localCount) * 100 : 0;

            results.push({
                name: band.name,
                local: localCount,
                vizier: vizierCount,
                diff,
                missingPct,
                gaia: localGaiaCount,
                noGaia: localCount - localGaiaCount,
                gaiaPct,
            });
        }

        // 3. Afficher le tableau de résultats
        console.log(`\n📋 RAPPORT D'AUDIT DES ÉTOILES VARIABLES :`);
        console.log(
            `=============================================================================================================`,
        );

        // Entête du tableau Markdown
        const headers = ['Tranche Mag', 'Local', 'VizieR', 'Manquantes', 'Avec Gaia', 'Sans Gaia', 'Couv. Gaia'];
        const formatRow = (row) => {
            return `| ${row[0].padEnd(16)} | ${row[1].padStart(8)} | ${row[2].padStart(8)} | ${row[3].padStart(18)} | ${row[4].padStart(9)} | ${row[5].padStart(9)} | ${row[6].padStart(10)} |`;
        };

        console.log(formatRow(headers));
        console.log(
            `| :--------------- | -------: | -------: | -----------------: | --------: | --------: | ---------: |`,
        );

        let totalLocal = 0;
        let totalVizier = 0;
        let totalGaia = 0;

        for (const r of results) {
            totalLocal += r.local;
            totalVizier += r.vizier;
            totalGaia += r.gaia;

            const diffStr = r.diff > 0 ? `${r.diff} (${r.missingPct.toFixed(2)}%)` : '0 (0.00%)';
            const rowData = [
                r.name,
                r.local.toLocaleString('fr-FR'),
                r.vizier.toLocaleString('fr-FR'),
                diffStr,
                r.gaia.toLocaleString('fr-FR'),
                r.noGaia.toLocaleString('fr-FR'),
                `${r.gaiaPct.toFixed(1)}%`,
            ];
            console.log(formatRow(rowData));
        }

        const totalDiff = Math.max(0, totalVizier - totalLocal);
        const totalMissingPct = totalVizier > 0 ? (totalDiff / totalVizier) * 100 : 0;
        const totalGaiaPct = totalLocal > 0 ? (totalGaia / totalLocal) * 100 : 0;

        console.log(
            `| ---------------- | -------- | -------- | ------------------ | --------- | --------- | ---------- |`,
        );
        const totalRowData = [
            'TOTAL',
            totalLocal.toLocaleString('fr-FR'),
            totalVizier.toLocaleString('fr-FR'),
            totalDiff > 0 ? `${totalDiff} (${totalMissingPct.toFixed(2)}%)` : '0 (0.00%)',
            totalGaia.toLocaleString('fr-FR'),
            (totalLocal - totalGaia).toLocaleString('fr-FR'),
            `${totalGaiaPct.toFixed(1)}%`,
        ];
        console.log(formatRow(totalRowData));
        console.log(
            `=============================================================================================================`,
        );

        // 4. Conclusion / Recommandations
        console.log(`\n💡 ANALYSE ET RECOMMANDATIONS :`);
        if (totalDiff > 0) {
            console.log(
                `- ⚠️ Il manque ${totalDiff.toLocaleString('fr-FR')} étoiles variables dans votre base de données locale.`,
            );
            console.log(
                `- 👉 Recommandation : Cliquez sur "Reprendre l'importation (sans effacer)" pour combler le manque.`,
            );
        } else {
            console.log(`- ✅ Toutes les étoiles variables attendues sont bien présentes dans votre base locale.`);
        }

        const noGaiaTotal = totalLocal - totalGaia;
        if (noGaiaTotal > 0) {
            console.log(
                `- ⚠️ Il y a ${noGaiaTotal.toLocaleString('fr-FR')} étoiles locales sans données de distance Gaia DR3.`,
            );
            console.log(
                `  (Note : Le cross-match Gaia n'est effectué par défaut que pour la tranche Mag <= 12.0 afin d'optimiser les performances).`,
            );
        } else {
            console.log(`- ✅ 100% des étoiles variables locales disposent de données Gaia DR3.`);
        }
    } catch (e) {
        console.error("❌ Erreur pendant l'exécution de l'audit :", e);
    } finally {
        dbClient.close();
    }
}

main();
