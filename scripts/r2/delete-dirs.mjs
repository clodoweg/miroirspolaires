#!/usr/bin/env node
/**
 * Utility script to remove specific directory structures from a Cloudflare R2 bucket.
 *
 * Responsibility:
 * - Lists objects with a given prefix.
 * - Deletes objects in batches until the prefix is cleared.
 * - Used to clean up assets that should no longer be hosted on R2 (e.g. static local-only directories).
 *
 * WARNING: destructif, sans confirmation. Lancer d'abord avec --dry-run.
 *
 * CLI Options:
 *   - With no arguments, deletes the predefined local-only directories (DIRS_TO_DELETE).
 *   - Any positional arguments are treated as prefixes and override the default list.
 *   - --dry-run : liste les objets qui seraient supprimés, sans rien supprimer.
 *   Toute autre option est refusée (code de sortie 1) : une option mal orthographiée ne doit
 *   jamais déclencher la suppression.
 *
 * Examples of Usage:
 *   node scripts/r2/delete-dirs.mjs --dry-run                           # Preview the default deletion
 *   node scripts/r2/delete-dirs.mjs                                     # Predefined local-only dirs (a-propos/, index/, …)
 *   node scripts/r2/delete-dirs.mjs astrophotographies/mini/            # Single targeted prefix
 *   node scripts/r2/delete-dirs.mjs astrophotographies/mini/ blog/old/  # Multiple prefixes
 */

import { ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseCliArgs } from '../lib/args.mjs';
import { loadEnv } from '../lib/env.mjs';
import { createR2Client, requireR2Config } from '../lib/r2.mjs';
import { LOCAL_ONLY_DIRS } from '../../src/config/imageConfig.mjs';

loadEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const r2Config = requireR2Config();
const { bucketName } = r2Config;
const s3 = createR2Client(r2Config);

const DEFAULT_DIRS_TO_DELETE = LOCAL_ONLY_DIRS.map((dir) => `${dir}/`);

let cliArgs;
try {
    cliArgs = parseCliArgs(process.argv.slice(2), { flags: { dryRun: ['--dry-run'] } });
} catch (error) {
    console.error(`❌ ${error.message}`);
    process.exit(1);
}
const isDryRun = cliArgs.flags.dryRun;

// Honour positional CLI args as prefix overrides; auto-append trailing slash
// so users can pass `astrophotographies/mini` and still target a directory.
const cliPrefixes = cliArgs.positionals.map((p) => (p.endsWith('/') ? p : `${p}/`));
const DIRS_TO_DELETE = cliPrefixes.length > 0 ? cliPrefixes : DEFAULT_DIRS_TO_DELETE;

/**
 * Deletes all objects matching a specific prefix from the bucket.
 *
 * @param {string} prefix - The directory prefix to delete (e.g., 'videos/').
 * @returns {Promise<number>} The total number of objects deleted.
 */
async function deleteDirectory(prefix) {
    console.log(`🗑️  Deleting: ${prefix}`);
    let continuationToken = undefined;
    let totalDeleted = 0;

    while (true) {
        const listResponse = await s3.send(
            new ListObjectsV2Command({
                Bucket: bucketName,
                Prefix: prefix,
                ContinuationToken: continuationToken,
            }),
        );

        if (!listResponse.Contents || listResponse.Contents.length === 0) {
            if (totalDeleted === 0) {
                console.log(`   → No objects found with prefix "${prefix}"`);
            }
            break;
        }

        const objectsToDelete = listResponse.Contents.map((obj) => ({ Key: obj.Key }));

        if (isDryRun) {
            objectsToDelete.forEach((object) => console.log(`   [dry-run] ${object.Key}`));
            totalDeleted += objectsToDelete.length;
            if (!listResponse.IsTruncated) break;
            continuationToken = listResponse.NextContinuationToken;
            continue;
        }

        await s3.send(
            new DeleteObjectsCommand({
                Bucket: bucketName,
                Delete: { Objects: objectsToDelete },
            }),
        );

        totalDeleted += objectsToDelete.length;
        console.log(`   → Deleted ${objectsToDelete.length} objects`);

        if (listResponse.IsTruncated) {
            continuationToken = listResponse.NextContinuationToken;
        } else {
            break;
        }
    }

    console.log(`   ✓ Total deleted from ${prefix}: ${totalDeleted} objects\n`);
    return totalDeleted;
}

/**
 * Main execution logic for directory deletion.
 */
async function main() {
    console.log('='.repeat(60));
    console.log('R2 Directory Deletion Script');
    console.log(`Bucket: ${bucketName}`);
    if (isDryRun) console.log('Mode : --dry-run (aucune suppression)');
    console.log('='.repeat(60));
    console.log('\nDirectories to delete:');
    DIRS_TO_DELETE.forEach((d) => console.log(`  - ${d}`));
    console.log('\n');

    let grandTotal = 0;
    for (const dir of DIRS_TO_DELETE) {
        grandTotal += await deleteDirectory(dir);
    }

    console.log('='.repeat(60));
    console.log(`✅ Done! Total objects deleted: ${grandTotal}`);
    console.log('='.repeat(60));
}

main().catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
});
