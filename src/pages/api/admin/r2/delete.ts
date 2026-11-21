import type { APIRoute } from 'astro';
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { requireAdmin, jsonResponse, parseDeletableFolder, safeResolve } from '@/lib/admin/shared';

export const prerender = false;

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
// POURQUOI : pas de valeur par défaut, pour ne jamais lire ou écrire dans un mauvais bucket.
const bucketName = process.env.R2_BUCKET_NAME ?? '';

const ASSETS_DIR = path.join(process.cwd(), 'src/assets');

/**
 * Endpoint API pour supprimer un répertoire ou sous-répertoire de médias.
 * Gère la suppression soit locale (sur le disque) soit distante (sur le bucket Cloudflare R2).
 *
 * @param {Object} context - Contexte Astro contenant la requête HTTP.
 * @returns {Promise<Response>} Réponse JSON indiquant le succès ou l'échec de la suppression.
 */
export const POST: APIRoute = async ({ request, locals }) => {
    const blocked = requireAdmin(locals);
    if (blocked) return blocked;

    try {
        const body = await request.json();
        const { target } = body;
        const folder = parseDeletableFolder(body.folder);

        if (!target || !body.folder) {
            return new Response(JSON.stringify({ error: "Paramètres 'target' et 'folder' requis" }), { status: 400 });
        }

        if (target !== 'local' && target !== 'r2') {
            return new Response(JSON.stringify({ error: "Cible invalide. Doit être 'local' ou 'r2'" }), {
                status: 400,
            });
        }

        if (!folder) {
            return new Response(JSON.stringify({ error: 'Dossier non autorisé' }), { status: 403 });
        }

        if (target === 'local') {
            // Défense en profondeur : le chemin résolu doit rester sous src/assets.
            const localPath = safeResolve(ASSETS_DIR, folder);

            try {
                const stat = await fs.stat(localPath);
                if (!stat.isDirectory()) {
                    return new Response(JSON.stringify({ error: "Le chemin n'est pas un répertoire" }), {
                        status: 400,
                    });
                }
            } catch {
                return new Response(JSON.stringify({ error: "Le répertoire local n'existe pas" }), { status: 404 });
            }

            // POURQUOI : On supprime récursivement le dossier local et tout son contenu.
            await fs.rm(localPath, { recursive: true, force: true });
            return jsonResponse({ success: true, message: `Répertoire local ${folder} supprimé` });
        }

        // target === 'r2'
        if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
            return new Response(JSON.stringify({ error: 'Identifiants R2 manquants pour la suppression' }), {
                status: 500,
            });
        }

        const s3 = new S3Client({
            region: 'auto',
            endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
            credentials: { accessKeyId, secretAccessKey },
        });

        // POURQUOI : Cloudflare R2 est un stockage d'objets (pas de vrais répertoires physiques).
        // Pour supprimer un "dossier", on doit lister tous les objets ayant ce préfixe et les supprimer par lots.
        const prefix = folder.endsWith('/') ? folder : `${folder}/`;
        let continuationToken: string | undefined = undefined;
        let totalDeleted = 0;

        while (true) {
            // POURQUOI : On type explicitement la réponse en `any` car le type de retour
            // de `s3.send` est extrêmement imbriqué et peut générer des erreurs d'initialisation circulaire.
            const listResponse: any = await s3.send(
                new ListObjectsV2Command({
                    Bucket: bucketName,
                    Prefix: prefix,
                    ContinuationToken: continuationToken,
                }),
            );

            if (!listResponse.Contents || listResponse.Contents.length === 0) {
                break;
            }

            // POURQUOI : On type `obj` en `any` pour éviter l'erreur TypeScript d'inférence implicite de type `any`.
            const objectsToDelete = listResponse.Contents.map((obj: any) => ({ Key: obj.Key }));

            await s3.send(
                new DeleteObjectsCommand({
                    Bucket: bucketName,
                    Delete: { Objects: objectsToDelete },
                }),
            );

            totalDeleted += objectsToDelete.length;

            if (listResponse.IsTruncated) {
                continuationToken = listResponse.NextContinuationToken;
            } else {
                break;
            }
        }

        return jsonResponse({
            success: true,
            message: `Répertoire distant R2 ${folder} nettoyé. ${totalDeleted} objets supprimés.`,
        });
    } catch (e) {
        console.error('Error in delete endpoint:', e);
        return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
    }
};
