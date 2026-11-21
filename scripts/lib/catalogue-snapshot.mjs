/**
 * Validation des instantanés de catalogues
 *
 * Responsabilité : décider si une liste fraîchement téléchargée peut remplacer l'instantané
 * versionné. Une réponse tronquée du CDS ne doit jamais écraser des données complètes.
 *
 * Ce module n'est pas une CLI : il est importé par `scripts/build/update-catalogue-snapshots.mjs`.
 */

/** Part minimale de l'instantané existant qu'une nouvelle liste doit conserver. */
export const MIN_RETAINED_RATIO = 0.9;

/**
 * Cherche ce qui interdit d'écrire un instantané.
 *
 * @param {Array<{ id: string, ra: number, dec: number }>} entries - Nouvelles entrées.
 * @param {number | null} existingCount - Taille de l'instantané actuel, null s'il n'y en a pas.
 * @param {boolean} [allowShrink] - Accepte une liste nettement plus courte (`--force`).
 * @returns {string | null} La raison du refus, ou null si l'écriture est permise.
 */
export function findSnapshotRejection(entries, existingCount, allowShrink = false) {
    if (entries.length === 0) return 'liste vide';
    const invalidEntry = entries.find((e) => !Number.isFinite(e.ra) || !Number.isFinite(e.dec));
    if (invalidEntry) return `coordonnées invalides pour ${invalidEntry.id}`;
    if (!allowShrink && existingCount !== null && entries.length < existingCount * MIN_RETAINED_RATIO) {
        return `${entries.length} entrées contre ${existingCount} dans l'instantané actuel (--force pour accepter)`;
    }
    return null;
}

/**
 * Prépare une liste pour l'écriture : retire le champ interne de tri et écrit une entrée par ligne,
 * pour que le diff entre deux générations reste lisible.
 *
 * @param {Array<Record<string, unknown>>} entries - Entrées renvoyées par le chargement direct.
 * @param {string} generatedAt - Date ISO de la génération.
 * @returns {string} Le contenu du fichier JSON.
 */
export function serializeSnapshot(entries, generatedAt) {
    const cleanEntries = entries.map(({ _idx, ...entry }) => entry);
    const lines = cleanEntries.map((entry) => `    ${JSON.stringify(entry)}`);
    return `{\n  "generatedAt": ${JSON.stringify(generatedAt)},\n  "entries": [\n${lines.join(',\n')}\n  ]\n}\n`;
}
