/**
 * Accès à Turso (libSQL) pour les scripts
 *
 * Responsabilité : lire `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` et créer le client libSQL.
 * Remplace les copies du même code dans `scripts/pipeline/` et `scripts/db/`.
 *
 * Ce module n'est pas une CLI : il est importé par les scripts de `scripts/`.
 */

import { createClient } from '@libsql/client';
import { loadEnv } from './env.mjs';

/**
 * Crée le client Turso et arrête le script (code 1) si l'URL de la base manque.
 *
 * @returns {import('@libsql/client').Client} Le client libSQL.
 */
export function createTursoClient() {
    loadEnv();
    const url = process.env.TURSO_DATABASE_URL;
    if (!url) {
        console.error('❌ TURSO_DATABASE_URL manquante dans .env');
        process.exit(1);
    }
    return createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
}
