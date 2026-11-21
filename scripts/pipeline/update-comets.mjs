/**
 * Mise à jour de la table Turso des comètes depuis le Minor Planet Center
 *
 * WARNING: destructif. Vide la table comets (DELETE FROM comets) puis la réimporte, sans transaction :
 * un échec pendant l'insertion laisse la table vide ou partielle (relancer le script).
 *
 * Responsabilité principale :
 * - Télécharger https://www.minorplanetcenter.net/iau/MPCORB/AllCometEls.txt et en lire les
 *   colonnes fixes (périhélie, q, e, ω, Ω, i, époque, magnitude, pente).
 * - Insérer les comètes par lots de 100.
 * - Écrire dans database_metadata : comets_last_sync, comets_count et comets_size_bytes (estimation à
 *   150 octets par ligne).
 * - Ne crée pas la table comets : elle doit exister (scripts/db/init-db.mjs).
 *
 * Effet distant : Turso (TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, .env de la racine du dépôt) et
 * téléchargement depuis le MPC.
 *
 * Options disponibles :
 *   Aucune. Tout argument est ignoré.
 *
 * Code de sortie : 1 en cas d'échec (téléchargement, contenu invalide, Turso).
 *
 * Exemples d'utilisation :
 *   node scripts/pipeline/update-comets.mjs
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';
import { loadEnv } from '../lib/env.mjs';

loadEnv();

// Charger le fichier .env depuis la racine du projet, quel que soit le répertoire d'exécution actuel (CWD)
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const URL = 'https://www.minorplanetcenter.net/iau/MPCORB/AllCometEls.txt';

async function main() {
    console.log(`Téléchargement des éléments orbitaux des comètes depuis le MPC...`);
    console.log(`URL : ${URL}`);

    try {
        const response = await fetch(URL);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const text = await response.text();

        // Vérification basique du contenu
        if (text.length < 1000 || !text.includes('10P')) {
            throw new Error('Contenu téléchargé invalide ou incomplet.');
        }

        console.log('Parsing des comètes...');
        const lines = text.split('\n').filter((l) => l.trim().length > 0);
        const comets = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.length < 150) continue;

            try {
                const id = line.substring(0, 12).trim();
                const name = line.substring(102, 158).trim();

                const pYear = parseInt(line.substring(14, 18).trim(), 10);
                const pMonth = parseInt(line.substring(19, 21).trim(), 10);
                const pDay = parseFloat(line.substring(22, 29).trim());
                const q = parseFloat(line.substring(29, 39).trim());
                const e = parseFloat(line.substring(39, 49).trim());
                const omega = parseFloat(line.substring(49, 59).trim());
                const node = parseFloat(line.substring(59, 69).trim());
                const inclination = parseFloat(line.substring(69, 79).trim());
                const epochStr = line.substring(79, 89).trim();
                const mag = parseFloat(line.substring(89, 95).trim());
                const slope = parseFloat(line.substring(95, 100).trim());
                const ref = line.substring(158).trim();

                if (isNaN(q) || isNaN(e) || isNaN(omega) || isNaN(node) || isNaN(inclination)) continue;

                comets.push({
                    id,
                    name,
                    pYear,
                    pMonth,
                    pDay,
                    q,
                    e,
                    omega,
                    node,
                    inclination,
                    epochStr,
                    mag,
                    slope,
                    ref,
                });
            } catch {
                // Ignorer les lignes mal formées
            }
        }

        console.log(`✓ ${comets.length} comètes analysées.`);

        // Écrire dans la base de données Turso
        console.log(`💾 Insertion dans Turso...`);
        const dbUrl = process.env.TURSO_DATABASE_URL;
        const dbToken = process.env.TURSO_AUTH_TOKEN;
        if (!dbUrl) {
            throw new Error("TURSO_DATABASE_URL n'est pas défini.");
        }
        const dbClient = createClient({ url: dbUrl, authToken: dbToken });

        try {
            console.log('🧹 Nettoyage de la table comets...');
            await dbClient.execute('DELETE FROM comets;');

            // Insérer par lots de 100
            const batchSize = 100;
            for (let i = 0; i < comets.length; i += batchSize) {
                const chunk = comets.slice(i, i + batchSize);
                const statements = chunk.map((c) => ({
                    sql: `INSERT OR REPLACE INTO comets (
                        id, name, p_year, p_month, p_day, q, e, omega, node, inclination, epoch_str, mag, slope, ref
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    args: [
                        c.id,
                        c.name,
                        c.pYear,
                        c.pMonth,
                        c.pDay,
                        c.q,
                        c.e,
                        c.omega,
                        c.node,
                        c.inclination,
                        c.epochStr,
                        isNaN(c.mag) ? null : c.mag,
                        isNaN(c.slope) ? null : c.slope,
                        c.ref || null,
                    ],
                }));
                await dbClient.batch(statements);
            }
            console.log(`✨ Insertion terminée avec succès dans Turso !`);

            console.log('💾 Enregistrement des métadonnées de synchronisation...');
            await dbClient.execute({
                sql: `INSERT OR REPLACE INTO database_metadata (key, value) VALUES (?, ?), (?, ?), (?, ?)`,
                args: [
                    'comets_last_sync',
                    new Date().toISOString(),
                    'comets_size_bytes',
                    String(comets.length * 150),
                    'comets_count',
                    String(comets.length),
                ],
            });
        } finally {
            dbClient.close();
        }
    } catch (error) {
        console.error(`❌ Échec de la mise à jour des comètes :`, error.message);
        process.exit(1);
    }
}

main();
