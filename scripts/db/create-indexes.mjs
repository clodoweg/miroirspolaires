/**
 * Création des index de performance de la table variable_stars
 *
 * Responsabilité principale :
 * - Lister les index existants de variable_stars.
 * - Créer (CREATE INDEX IF NOT EXISTS) les index supposés par src/pages/api/variable-stars.ts et
 *   absents de init-db.mjs :
 *     - idx_var_stars_dec_vmag : composite (dec, v_mag_max), filtres « Faisable » / « Visible ce soir » ;
 *     - idx_var_stars_type : filtre par type de variabilité ;
 *     - idx_var_stars_ra : filtre par ascension droite.
 * - Un index déjà présent est ignoré ; aucun index n'est supprimé.
 *
 * Effet distant : Turso (écriture de schéma, sauf avec --check). Le .env est lu à la racine du dépôt
 * (scripts/lib/turso.mjs). Sur plusieurs millions de lignes, une création peut durer plusieurs minutes.
 *
 * Options disponibles :
 *   --check : liste les index existants de variable_stars et s'arrête, sans rien créer (lecture seule).
 *   Tout autre argument est ignoré.
 *
 * Code de sortie : 1 si TURSO_DATABASE_URL manque ; sinon 0, même si une création échoue (erreur affichée).
 *
 * Exemples d'utilisation :
 *   node scripts/db/create-indexes.mjs --check
 *   node scripts/db/create-indexes.mjs
 */

import { createTursoClient } from '../lib/turso.mjs';

async function run() {
    const checkOnly = process.argv.includes('--check');

    console.log('Connecting to Turso...');
    const client = createTursoClient();

    // Lister les index existants
    const existingIndexes = await client.execute(
        `SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='variable_stars'`,
    );
    console.log('\n=== Index existants sur variable_stars ===');
    for (const row of existingIndexes.rows) {
        console.log(`  ${row.name}: ${row.sql || '(auto)'}`);
    }

    if (checkOnly) {
        await client.close();
        return;
    }

    // Index composite principal : (dec, v_mag_max)
    // POURQUOI: Les requêtes "Visible ce soir" et "Faisable" filtrent toujours par plage
    // de déclinaison (WHERE dec >= ? AND dec <= ?) et optionnellement par magnitude max.
    // Sans cet index, SQLite fait un full table scan sur 4.8M de lignes.
    const indexesToCreate = [
        {
            name: 'idx_var_stars_dec_vmag',
            sql: 'CREATE INDEX IF NOT EXISTS idx_var_stars_dec_vmag ON variable_stars(dec, v_mag_max)',
            description: 'Composite (dec, v_mag_max) pour filtrage déclinaison + magnitude',
        },
        {
            name: 'idx_var_stars_type',
            sql: 'CREATE INDEX IF NOT EXISTS idx_var_stars_type ON variable_stars(type)',
            description: 'Index sur type pour filtre par catégorie de variabilité',
        },
        {
            name: 'idx_var_stars_ra',
            sql: 'CREATE INDEX IF NOT EXISTS idx_var_stars_ra ON variable_stars(ra)',
            description: 'Index sur ra pour filtrage par ascension droite visible ce soir',
        },
    ];

    for (const idx of indexesToCreate) {
        const alreadyExists = existingIndexes.rows.some((r) => r.name === idx.name);
        if (alreadyExists) {
            console.log(`\n✓ ${idx.name} existe déjà — ignoré.`);
            continue;
        }
        console.log(`\n⏳ Création: ${idx.name} (${idx.description})...`);
        console.log(`   SQL: ${idx.sql}`);
        const start = Date.now();
        try {
            await client.execute(idx.sql);
            console.log(`   ✓ Terminé en ${((Date.now() - start) / 1000).toFixed(1)}s`);
        } catch (e) {
            console.error(`   ✗ Erreur: ${e.message}`);
        }
    }

    // Vérification finale
    const finalIndexes = await client.execute(
        `SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='variable_stars'`,
    );
    console.log('\n=== Index finaux ===');
    for (const row of finalIndexes.rows) {
        console.log(`  ${row.name}: ${row.sql || '(auto)'}`);
    }

    await client.close();
    console.log('\nTerminé.');
}

run().catch(console.error);
