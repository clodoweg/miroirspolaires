/**
 * Mise à jour de la table Turso des astéroïdes depuis le Minor Planet Center
 *
 * WARNING: destructif. Vide la table asteroids (DELETE FROM asteroids) puis la réimporte, sans
 * transaction. Un lot qui échoue après 3 tentatives est seulement signalé : la table peut rester
 * incomplète alors que le script se termine avec le code 0.
 *
 * Responsabilité principale :
 * - Télécharger 4 fichiers MPCORB du MPC (NEA, Distant, Unusual, PHA) et en lire les colonnes fixes
 *   (H, G, époque, M, ω, Ω, i, e, n, a). Une source en échec est sautée, les autres sont gardées.
 * - Dédoublonner par désignation (un astéroïde présent dans plusieurs fichiers n'est gardé qu'une fois).
 * - Créer la table asteroids et ses index (nom, h) s'ils manquent.
 * - Insérer par lots de 500, 8 lots en parallèle au plus.
 * - Écrire dans database_metadata : asteroids_last_sync, asteroids_count et asteroids_size_bytes
 *   (estimation à 150 octets par ligne).
 *
 * Effet distant : Turso (TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, .env de la racine du dépôt) et
 * téléchargements depuis le MPC.
 *
 * Options disponibles :
 *   Aucune. Tout argument est ignoré.
 *
 * Code de sortie : 1 si aucune source n'a pu être chargée ou en cas d'erreur Turso hors lots d'insertion.
 *
 * Exemples d'utilisation :
 *   node scripts/pipeline/update-asteroids.mjs
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '../lib/env.mjs';
import { createTursoClient } from '../lib/turso.mjs';

loadEnv();

// Charger le fichier .env depuis la racine du projet, quel que soit le répertoire d'exécution actuel (CWD)
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SOURCES = [
    { name: 'NEA', url: 'https://www.minorplanetcenter.net/iau/MPCORB/NEA.txt' },
    { name: 'Distant', url: 'https://www.minorplanetcenter.net/iau/MPCORB/Distant.txt' },
    { name: 'Unusual', url: 'https://www.minorplanetcenter.net/iau/MPCORB/Unusual.txt' },
    { name: 'PHA', url: 'https://www.minorplanetcenter.net/iau/MPCORB/PHA.txt' },
];

async function main() {
    const dbClient = createTursoClient();

    try {
        const asteroidMap = new Map();

        for (const source of SOURCES) {
            console.log(`📥 Téléchargement des éléments orbitaux des astéroïdes (${source.name}) depuis le MPC...`);
            console.log(`URL : ${source.url}`);

            try {
                const response = await fetch(source.url);
                if (!response.ok) {
                    console.error(`⚠️ Erreur de téléchargement pour ${source.name}: ${response.status}`);
                    continue;
                }
                const text = await response.text();

                if (text.length < 1000) {
                    console.warn(`⚠️ Contenu téléchargé pour ${source.name} invalide ou trop court.`);
                    continue;
                }

                console.log(`Parsing des astéroïdes (${source.name})...`);
                const lines = text.split('\n').filter((l) => l.trim().length > 0);
                let parsedCount = 0;

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    if (line.length < 194) continue;

                    try {
                        const id = line.substring(0, 7).trim();
                        const h = parseFloat(line.substring(8, 13).trim());
                        const g = parseFloat(line.substring(14, 19).trim());
                        const epoch = line.substring(20, 25).trim();
                        const m = parseFloat(line.substring(26, 35).trim());
                        const omega = parseFloat(line.substring(37, 46).trim());
                        const node = parseFloat(line.substring(48, 57).trim());
                        const inclination = parseFloat(line.substring(59, 68).trim());
                        const e = parseFloat(line.substring(70, 79).trim());
                        const n = parseFloat(line.substring(80, 91).trim());
                        const a = parseFloat(line.substring(92, 103).trim());
                        const ref = line.substring(107, 116).trim();
                        const name = line.substring(166, 194).trim() || id;

                        if (isNaN(h) || isNaN(e) || isNaN(a) || isNaN(m) || isNaN(inclination)) continue;

                        asteroidMap.set(id, {
                            id,
                            name,
                            h,
                            g: isNaN(g) ? 0.15 : g,
                            epoch,
                            m,
                            omega,
                            node,
                            inclination,
                            e,
                            n,
                            a,
                            ref,
                        });
                        parsedCount++;
                    } catch {
                        // Ignorer les lignes mal formées
                    }
                }
                console.log(`✓ ${parsedCount} astéroïdes analysés pour ${source.name}.`);
            } catch (e) {
                console.error(`⚠️ Échec du traitement pour la source ${source.name} :`, e.message);
            }
        }

        const asteroids = Array.from(asteroidMap.values());
        console.log(`📊 Total : ${asteroids.length} astéroïdes uniques chargés.`);

        if (asteroids.length === 0) {
            throw new Error("Aucun astéroïde n'a pu être chargé.");
        }

        console.log(`💾 Insertion dans Turso...`);

        await dbClient.execute(`
            CREATE TABLE IF NOT EXISTS asteroids (
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

        await dbClient.execute(`CREATE INDEX IF NOT EXISTS idx_asteroids_name ON asteroids(name);`);
        await dbClient.execute(`CREATE INDEX IF NOT EXISTS idx_asteroids_h ON asteroids(h);`);

        console.log('🧹 Nettoyage de la table asteroids...');
        await dbClient.execute('DELETE FROM asteroids;');

        const batchSize = 500;
        const maxConcurrency = 8;
        const statements = asteroids.map((c) => ({
            sql: `INSERT OR REPLACE INTO asteroids (
                id, name, h, g, epoch, m, omega, node, inclination, e, n, a, ref
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [c.id, c.name, c.h, c.g, c.epoch, c.m, c.omega, c.node, c.inclination, c.e, c.n, c.a, c.ref || null],
        }));

        const batches = [];
        for (let i = 0; i < statements.length; i += batchSize) {
            batches.push(statements.slice(i, i + batchSize));
        }

        console.log(
            `🚀 Insertion de ${asteroids.length} astéroïdes dans Turso par lots de ${batchSize} (Concurrence max : ${maxConcurrency})...`,
        );

        let completed = 0;
        const pool = [];

        const runBatch = async (batch) => {
            let retries = 3;
            while (retries > 0) {
                try {
                    await dbClient.batch(batch);
                    completed++;
                    process.stdout.write(`\r   -> Lots complétés : ${completed}/${batches.length}`);
                    return;
                } catch (e) {
                    retries--;
                    if (retries === 0) {
                        console.error(`\n❌ Échec définitif d'un lot :`, e.message);
                    } else {
                        await new Promise((r) => setTimeout(r, 1000));
                    }
                }
            }
        };

        for (let i = 0; i < batches.length; i++) {
            if (pool.length >= maxConcurrency) {
                await Promise.race(pool);
            }
            const p = runBatch(batches[i]).then(() => {
                pool.splice(pool.indexOf(p), 1);
            });
            pool.push(p);
        }
        await Promise.all(pool);
        console.log(`\n✨ Insertion de ${asteroids.length} astéroïdes terminée avec succès dans Turso !`);

        console.log('💾 Enregistrement des métadonnées de synchronisation...');
        await dbClient.execute(
            'CREATE TABLE IF NOT EXISTS database_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
        );
        await dbClient.execute({
            sql: `INSERT OR REPLACE INTO database_metadata (key, value) VALUES (?, ?), (?, ?), (?, ?)`,
            args: [
                'asteroids_last_sync',
                new Date().toISOString(),
                'asteroids_size_bytes',
                String(asteroids.length * 150),
                'asteroids_count',
                String(asteroids.length),
            ],
        });
    } catch (error) {
        console.error(`❌ Échec de la mise à jour des astéroïdes :`, error.message);
        process.exit(1);
    } finally {
        dbClient.close();
    }
}

main();
