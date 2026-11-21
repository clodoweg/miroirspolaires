/**
 * Racine du dépôt et chargement du .env pour les scripts
 *
 * Responsabilité : fournir `PROJECT_ROOT` et charger `.env` depuis la racine du dépôt, quel que
 * soit le répertoire courant (certains scripts dépendaient du cwd, d'autres non).
 *
 * Ce module n'est pas une CLI : il est importé par les scripts de `scripts/`.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

/** Racine du dépôt (deux niveaux au-dessus de `scripts/lib/`). */
export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let isLoaded = false;

/**
 * Charge `.env` depuis la racine du dépôt (une seule fois, sans écraser l'environnement déjà défini).
 *
 * @returns {void}
 */
export function loadEnv() {
    if (isLoaded) return;
    // POURQUOI : quiet coupe les « tips » de dotenv 17, qui polluent la sortie lue par l'admin.
    dotenv.config({ path: path.join(PROJECT_ROOT, '.env'), quiet: true });
    isLoaded = true;
}
