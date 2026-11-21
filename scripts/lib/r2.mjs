/**
 * Accès à Cloudflare R2 (API S3) pour les scripts
 *
 * Responsabilité : lire et vérifier les variables R2 du `.env`, et créer le client S3.
 * Remplace les copies du même code dans les scripts de `scripts/r2/`, `scripts/build/` et
 * `scripts/pipeline/`.
 *
 * Ce module n'est pas une CLI : il est importé par les scripts de `scripts/`.
 */

import { S3Client } from '@aws-sdk/client-s3';
import { loadEnv } from './env.mjs';

/**
 * @typedef {Object} R2Config
 * @property {string} accountId
 * @property {string} accessKeyId
 * @property {string} secretAccessKey
 * @property {string} bucketName
 */

/**
 * Lit la configuration R2 et arrête le script (code 1) si une variable manque.
 *
 * WARNING: pas de bucket par défaut, pour ne jamais lire ni écrire dans un mauvais bucket.
 *
 * @returns {R2Config} La configuration complète.
 */
export function requireR2Config() {
    loadEnv();
    const config = {
        accountId: process.env.R2_ACCOUNT_ID,
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
        bucketName: process.env.R2_BUCKET_NAME,
    };
    const missing = [
        ['R2_ACCOUNT_ID', config.accountId],
        ['R2_ACCESS_KEY_ID', config.accessKeyId],
        ['R2_SECRET_ACCESS_KEY', config.secretAccessKey],
        ['R2_BUCKET_NAME', config.bucketName],
    ]
        .filter(([, value]) => !value)
        .map(([name]) => name);
    if (missing.length > 0) {
        console.error(`❌ Variables R2 manquantes dans .env : ${missing.join(', ')}`);
        process.exit(1);
    }
    return config;
}

/**
 * Crée le client S3 pointant vers R2.
 *
 * @param {R2Config} config - Configuration renvoyée par `requireR2Config()`.
 * @returns {S3Client} Le client.
 */
export function createR2Client(config) {
    return new S3Client({
        region: 'auto',
        endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
}
