/**
 * Initialisation du schéma Turso des données astronomiques
 *
 * WARNING: destructif, sans confirmation ni --dry-run. Supprime (DROP TABLE IF EXISTS) les 5 tables
 * variable_stars, exoplanets, comets, asteroids et database_metadata, puis les recrée vides.
 * Toutes les données importées sont perdues : relancer ensuite les scripts update-*.
 *
 * Responsabilité principale :
 * - Recréer le schéma des 5 tables lues par le site et l'admin.
 * - Créer les index de recherche de base (nom, constellation, magnitude, h des astéroïdes).
 *   Les index de variable_stars attendus par l'API (dec + v_mag_max, type, ra) sont créés par
 *   scripts/db/create-indexes.mjs, pas ici.
 * - La table variable_stars_gaia n'est ni supprimée ni recréée : après une réinitialisation, lancer
 *   crossmatch-variable-stars.mjs avec --reset pour ne pas sauter des étoiles marquées « not_found ».
 *
 * Effet distant : Turso (TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, lus dans le .env de la racine du dépôt
 * via scripts/lib/turso.mjs, quel que soit le répertoire courant).
 *
 * Options disponibles :
 *   Aucune. Tout argument est ignoré.
 *
 * Code de sortie : 1 si TURSO_DATABASE_URL manque ; une erreur SQL est seulement affichée (code 0).
 *
 * Exemples d'utilisation :
 *   node scripts/db/init-db.mjs
 *   node scripts/db/create-indexes.mjs   # ensuite, pour les index de variable_stars
 */

import { createTursoClient } from '../lib/turso.mjs';

const client = createTursoClient();
console.log(`Connexion à la base de données : ${process.env.TURSO_DATABASE_URL}`);

async function init() {
    try {
        console.log('Suppression des tables existantes si nécessaires pour mise à jour...');
        await client.execute('DROP TABLE IF EXISTS variable_stars;');
        await client.execute('DROP TABLE IF EXISTS exoplanets;');
        await client.execute('DROP TABLE IF EXISTS comets;');
        await client.execute('DROP TABLE IF EXISTS asteroids;');
        await client.execute('DROP TABLE IF EXISTS database_metadata;');

        console.log('Création de la table database_metadata...');
        await client.execute(`
            CREATE TABLE database_metadata (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
        `);

        console.log('Création de la table variable_stars...');
        await client.execute(`
            CREATE TABLE variable_stars (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                star_name TEXT,
                constellation TEXT,
                ra REAL NOT NULL,
                dec REAL NOT NULL,
                v_mag_min REAL,
                v_mag_max REAL,
                period REAL,
                epoch REAL,
                type TEXT,
                spectral_type TEXT,
                distance REAL,
                details TEXT
            );
        `);

        console.log('Création de la table exoplanets...');
        await client.execute(`
            CREATE TABLE exoplanets (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                common_name TEXT,
                star_name TEXT NOT NULL,
                v_mag REAL,
                ra REAL NOT NULL,
                dec REAL NOT NULL,
                period REAL NOT NULL,
                epoch REAL NOT NULL,
                duration REAL,
                depth REAL,
                mass REAL,
                radius REAL,
                distance REAL,
                spectral_type TEXT,
                star_radius REAL,
                constellation TEXT,
                is_candidate INTEGER NOT NULL
            );
        `);

        console.log('Création de la table comets...');
        await client.execute(`
            CREATE TABLE comets (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                p_year INTEGER NOT NULL,
                p_month INTEGER NOT NULL,
                p_day REAL NOT NULL,
                q REAL NOT NULL,
                e REAL NOT NULL,
                omega REAL NOT NULL,
                node REAL NOT NULL,
                inclination REAL NOT NULL,
                epoch_str TEXT NOT NULL,
                mag REAL,
                slope REAL,
                ref TEXT
            );
        `);

        console.log('Création de la table asteroids...');
        await client.execute(`
            CREATE TABLE asteroids (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                h REAL NOT NULL,
                g REAL NOT NULL,
                epoch TEXT NOT NULL,
                m REAL NOT NULL,
                omega REAL NOT NULL,
                node REAL NOT NULL,
                inclination REAL NOT NULL,
                e REAL NOT NULL,
                n REAL NOT NULL,
                a REAL NOT NULL,
                ref TEXT
            );
        `);

        // Index de performance pour des recherches instantanées
        console.log('Création des index de performance...');
        await client.execute(
            `CREATE INDEX IF NOT EXISTS idx_var_stars_constellation ON variable_stars(constellation);`,
        );
        await client.execute(`CREATE INDEX IF NOT EXISTS idx_var_stars_name ON variable_stars(name);`);
        await client.execute(`CREATE INDEX IF NOT EXISTS idx_var_stars_v_mag_max ON variable_stars(v_mag_max);`);

        await client.execute(`CREATE INDEX IF NOT EXISTS idx_exoplanets_name ON exoplanets(name);`);
        await client.execute(`CREATE INDEX IF NOT EXISTS idx_exoplanets_constellation ON exoplanets(constellation);`);
        await client.execute(`CREATE INDEX IF NOT EXISTS idx_exoplanets_v_mag ON exoplanets(v_mag);`);

        await client.execute(`CREATE INDEX IF NOT EXISTS idx_comets_name ON comets(name);`);

        await client.execute(`CREATE INDEX IF NOT EXISTS idx_asteroids_name ON asteroids(name);`);
        await client.execute(`CREATE INDEX IF NOT EXISTS idx_asteroids_h ON asteroids(h);`);

        console.log('Base de données initialisée avec succès !');
    } catch (error) {
        console.error("Erreur lors de l'initialisation de la base de données :", error);
    } finally {
        client.close();
    }
}

init();
