/**
 * Extract the first catalogue identifier present in a free-form string
 * (typically a photo title or an "objects in field" entry) and return it in
 * the canonical "PREFIX NUMBER" form expected by the /objets explorer.
 *
 * Examples:
 *   "M42"          → "M 42"
 *   "NGC7000"      → "NGC 7000"
 *   "Sh2-155"      → "Sh2 155"
 *   "Galaxie de Barnard (NGC 6822)" → "NGC 6822"
 */
export function extractCatalogueId(...sources: (string | undefined | null)[]): string | null {
    const re = /\b(NGC|IC|Sh2|LBN|LDN|Barnard|Caldwell|Abell|PGC|UGC|vdB|M)[\s-]?(\d+(?:-\d+)?)\b/i;
    for (const src of sources) {
        if (!src) continue;
        const m = src.match(re);
        if (m) {
            const upper = m[1].toUpperCase();
            const canonicalPrefix =
                upper === 'VDB'
                    ? 'vdB'
                    : ['NGC', 'IC', 'LBN', 'LDN', 'PGC', 'UGC'].includes(upper)
                      ? upper
                      : m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
            return `${canonicalPrefix} ${m[2]}`;
        }
    }
    return null;
}
