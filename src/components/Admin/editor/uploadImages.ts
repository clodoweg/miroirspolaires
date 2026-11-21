/**
 * Envoi d'images depuis les éditeurs de l'admin (blog et voyages).
 *
 * Responsabilité : un seul point d'entrée pour les deux modes.
 *  - Admin local : un envoi multipart vers `/api/admin/images|voyages-images/<année>/<slug>` (disque).
 *  - Admin distant : pour chaque fichier, URL présignée (`POST /api/admin/uploads`), dépôt direct sur R2
 *    (PUT), puis traitement côté serveur (`POST /api/admin/uploads/finalize`).
 *
 * POURQUOI le dépôt direct à distance : une fonction Vercel refuse un corps de plus de 4,5 Mo.
 */

export interface UploadImagesOptions {
    section: 'blog' | 'voyages';
    year: string;
    slug: string;
    files: File[];
    /** Photos 360° du blog : conservées en haute définition. */
    is360?: boolean;
    /** Admin distant (Preview de `dev`). */
    remote: boolean;
    fetchImpl?: typeof fetch;
}

export type UploadImagesResult<T> = { ok: true; saved: T[] } | { ok: false; error: string };

async function readError(response: Response): Promise<string> {
    const body = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
    return body.message ?? body.error ?? `HTTP ${response.status}`;
}

/**
 * Envoie des images dans le dossier d'un article ou d'un voyage.
 *
 * @param options - Section, entrée, fichiers, mode.
 * @returns Les images enregistrées, au format de la route de la section (`path` ou `rel`), ou l'erreur.
 */
export async function uploadAdminImages<T>(options: UploadImagesOptions): Promise<UploadImagesResult<T>> {
    const fetchImpl = options.fetchImpl ?? fetch;
    const apiBase = options.section === 'blog' ? '/api/admin/images' : '/api/admin/voyages-images';

    if (!options.remote) {
        const formData = new FormData();
        for (const file of options.files) formData.append('files', file);
        if (options.is360) formData.append('is360', 'true');
        const response = await fetchImpl(`${apiBase}/${options.year}/${options.slug}`, {
            method: 'POST',
            body: formData,
        });
        if (!response.ok) return { ok: false, error: await readError(response) };
        return { ok: true, saved: ((await response.json()) as { saved: T[] }).saved };
    }

    const saved: T[] = [];
    for (const file of options.files) {
        const target = { section: options.section, year: options.year, slug: options.slug };
        const presign = await fetchImpl('/api/admin/uploads', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...target, filename: file.name, contentType: file.type, size: file.size }),
        });
        if (!presign.ok) return { ok: false, error: `${file.name} : ${await readError(presign)}` };
        const { uploadUrl, uploadKey } = (await presign.json()) as { uploadUrl: string; uploadKey: string };

        const put = await fetchImpl(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
        if (!put.ok) return { ok: false, error: `${file.name} : envoi vers R2 refusé (HTTP ${put.status})` };

        const finalize = await fetchImpl('/api/admin/uploads/finalize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...target, uploadKey, filename: file.name, is360: options.is360 === true }),
        });
        if (!finalize.ok) return { ok: false, error: `${file.name} : ${await readError(finalize)}` };
        saved.push(...((await finalize.json()) as { saved: T[] }).saved);
    }
    return { ok: true, saved };
}
